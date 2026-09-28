---
layout: post
title: "OPNsense Home Lab Walkthrough: Segmentation, WireGuard, DNS, and Monitoring"
date: 2026-04-15
categories: [HomeLab, Security]
tags: [opnsense, vlan, wireguard, suricata, zenarmor, adguard, wazuh, opencti, docker, ubuntu, homelab, firewall]
---

# OPNsense Home Lab Walkthrough

## Scope and example conventions

This guide describes an OPNsense firewall, an 802.1Q switch, an Ubuntu security server, and a separately isolated DShield sensor. It is a reference build, not evidence that a particular live network passed the tests below. Documentation was reviewed on 2026-09-28; record your installed versions and test results privately.

All addresses, VLAN numbers, interface assignments, and device names below are **synthetic examples**, not an inventory of an operational network. Public endpoints use `example.com` or documentation address space. Replace examples consistently in private configuration. Never publish configuration exports, keys, webhook URLs, account IDs, MAC addresses, serial numbers, or screenshots containing live topology or browser/account metadata.

Related guides: [DShield honeypot](/posts/dshield-honeypot/), [AdGuard DNS](/posts/adguard-dns-enforcement-standalone-setup/), and [OpenCTI](/posts/opencti-docker-standalone-setup/).

## 1. Plan hardware, addressing, and recovery

Use an OPNsense-supported x86-64 appliance with enough ports and resources for your measured traffic and inspection workload. A four-port Protectli appliance is one possible platform; verify the exact model's CPU, NIC, storage, and firmware against its [manufacturer specifications](https://protectli.com/product/vp2420/), rather than treating different models as interchangeable. Confirm the actual interface names at the console; `igc0` through `igc3` are examples only.

Use a switch supporting 802.1Q tagging, PVID configuration, and the management isolation your design requires. GS308E, GS316EP, and GS324T have different capabilities and revisions. Do not assume that VLAN support means the switch can restrict its own management plane to one VLAN. Check the exact hardware revision's manual through [NETGEAR support](https://www.netgear.com/support/) and test management access from every zone before connecting untrusted clients. Disable switch inter-VLAN routing so traffic cannot bypass OPNsense.

Size the Ubuntu server from the combined requirements of Wazuh, OpenCTI, DNS, and retention. An 8 GB machine is not a validated minimum for this combined stack. Keep DNS on a separate host if memory exhaustion or security-stack maintenance would otherwise interrupt the entire network.

### Example address plan

| Zone | VLAN / connection | Example subnet | Purpose |
|---|---|---|---|
| LAB | VLAN 110 | 10.77.10.0/24 | Test systems |
| WORK | VLAN 120 | 10.77.20.0/24 | Work endpoints |
| TRUSTED | VLAN 130 | 10.77.30.0/24 | Personal clients |
| GUEST | VLAN 140 | 10.77.40.0/24 | Guest/IoT clients |
| PRINTER | VLAN 150 | 10.77.50.0/24 | Shared printers |
| MGMT | VLAN 190 | 10.77.90.0/24 | Administration |
| SECSTACK | Dedicated port | 10.77.100.0/24 | Security services |
| HONEYPOT | Dedicated port | 10.77.110.0/24 | Untrusted sensor |
| VPN | WireGuard overlay | 10.77.200.0/24 | Remote peers |

Use `.1` for each OPNsense interface, `10.77.100.10` for the server, `10.77.110.10` for the sensor, and `10.77.90.10` for the example administrator. These choices must not overlap existing local, upstream, or remote VPN networks.

```text
Internet -> ISP handoff -> OPNsense
                            |-- tagged trunk -> switch -> isolated client VLANs
                            |-- security services segment
                            |-- dedicated honeypot segment
                            `-- WireGuard remote-access overlay
```

The diagram intentionally omits physical port numbers, actual devices, and operational addresses. VLANs separate broadcast domains; devices within a VLAN can communicate without traversing the router. Use AP client isolation or additional segmentation where same-zone isolation is required.

Before cutover, export an encrypted/private backup, retain console access, and document a rollback path. Keep credentials and ISP connection details in a password manager.

### Build sequence and private worksheet

Use this sequence even if some hardware is already configured. Each checkpoint gives you a working state to return to rather than changing routing, DHCP, DNS, and inspection at once.

| Stage | Work | Checkpoint before proceeding |
|---|---|---|
| Foundation | Install firewall, confirm ISP handoff | Admin access and outbound Internet work |
| Segmentation | Add VLANs, switch membership, management path | Correct subnet and gateway on a test port |
| Policy | Add explicit service exceptions and internal blocks | Allowed and denied connections match logs |
| Server | Install Ubuntu, SSH, Docker | Admin key login and container smoke test work |
| DNS | Deploy AdGuard, then advertise/enforce it | TCP/UDP DNS works through the approved resolver |
| Monitoring | Start Wazuh, then OpenCTI | A real test event and a small feed import arrive |
| Remote access | Add WireGuard peer | Offsite peer reaches only approved destinations |
| Inspection | Enable one engine at a time | Expected alerts without loss of required traffic |

Create a private worksheet containing physical cable labels, actual interface names, subnet/gateway assignments, DHCP ranges, reserved addresses, service versions, and the location of recovery backups. The example below belongs in the public guide; the worksheet with your real values does not.

### Example physical and switch-port plan

On the four-port reference firewall, use one port for WAN, one for the switch trunk, one for SECSTACK, and one for HONEYPOT. Verify port-to-interface mapping by link state at the console before assigning roles. Do not assume the first printed chassis port is the first FreeBSD interface.

| Example switch port | Connected endpoint | Egress membership | Ingress PVID |
|---|---|---|---|
| 1 | Firewall trunk | Tagged 110,120,130,140,150,190 | Unused native VLAN if required |
| 2 | Administrator | Untagged 190 only | 190 |
| 3 | Lab endpoint | Untagged 110 only | 110 |
| 4 | Work endpoint | Untagged 120 only | 120 |
| 5 | Trusted endpoint | Untagged 130 only | 130 |
| 6 | Guest/IoT test device | Untagged 140 only | 140 |
| 7 | Printer | Untagged 150 only | 150 |
| 8 | Unused | Disabled | Isolated unused VLAN |

This is a synthetic cabling example, not an actual port inventory. An AP trunk replaces an access-port role and needs its own explicit tagged SSID and management configuration.

Tagged membership controls how frames leave the port. PVID classifies incoming untagged frames. Both must agree with the endpoint. A device with a correct-looking static IP can still be in the wrong VLAN; verify membership rather than using IP addressing as proof of segmentation.

### Capacity and storage planning

Record idle and peak CPU, RAM, and disk use after each service is added. A useful starting **planning target**, not a vendor minimum or benchmark, is a server with 32 GB RAM and SSD storage for a small combined lab; large feeds or retention can exceed it quickly. Reserve disk headroom and decide retention before ingesting multiple feeds. If the server begins swapping heavily, pause additional ingestion and identify the dominant service before adding workers.

Keep backups off the device they protect. Protect firewall exports as credentials: they can contain VPN private keys, account configuration, certificates, and enough information to reconstruct your network.

## 2. Prepare the ISP handoff and install OPNsense

Bridge mode, IP passthrough, and a consumer router's DMZ/exposed-host feature are different. Bridge mode usually removes routing/NAT for the downstream handoff; passthrough behavior is vendor-specific; DMZ forwarding commonly retains NAT. Double NAT can complicate inbound access, but does not inherently break every VPN. Follow the ISP's instructions for the exact gateway. Do not disable its firewall before the replacement firewall is ready. Management access after conversion is also device-specific.

For inbound VPN or honeypot traffic, confirm that the WAN is reachable from the Internet. CGNAT generally prevents unsolicited inbound IPv4 without provider assistance; another port forward on your own router does not solve it. A public IPv6 address needs its own firewall policy.

1. Obtain a current supported installer from [OPNsense](https://opnsense.org/download/) and follow its image verification and media-writing instructions. Check the target USB carefully before writing.
2. Install using the console and set a unique administrator password. Interface assignments depend on the NICs detected by that installation.
3. Use a **temporary, non-overlapping** untagged LAN, such as `192.168.250.1/24`, for initial access. Do not assign the eventual MGMT subnet to both this LAN and a VLAN interface.
4. Update OPNsense, set time synchronization, and save a baseline backup. Use `home.arpa` for a private home namespace rather than `.local`, which is used by multicast DNS.
5. Keep WAN default-deny. Enable private-network blocking only when appropriate for the upstream addressing; a private WAN behind another router needs a deliberate exception.

This guide's rule examples are IPv4-only. Leave IPv6 routing, router advertisements, and DHCPv6 disabled until you have an equivalent tested IPv6 policy. IPv4 RFC1918 blocks do not filter IPv6.

### Installation and first access, step by step

1. Back up the existing router configuration and note the ISP authentication method privately. If the connection uses PPPoE, obtain the credentials before cutover. Retain a way to restore the original Internet path.
2. Download the appropriate OPNsense image for the console you will use, verify it as instructed by the project, and write it to the chosen USB device. Image types are not interchangeable with every media-writing mode; use the instructions for that image.
3. Boot the appliance from USB with a keyboard/display or supported serial console. Identify the installation disk carefully; installation replaces its contents.
4. Follow the current [OPNsense installer](https://docs.opnsense.org/manual/install.html), set a unique root password, remove installation media, and reboot to the installed system.
5. Assign the WAN and temporary LAN interfaces using the console. Set temporary LAN to `192.168.250.1/24` only after confirming that subnet is unused elsewhere. Enable a temporary DHCP pool or give the administrator a static address such as `192.168.250.10/24`.
6. Connect the administrator directly to temporary LAN, or through a switch path that preserves untagged traffic. Browse to `https://192.168.250.1`. A new local certificate may not yet be trusted; verify that you are connected to the intended appliance before accepting it.
7. Set timezone, hostname, and the private namespace. Configure WAN according to the ISP handoff. Apply updates and restart if required, then save a private baseline backup.

Do not expose the administrative GUI or SSH on WAN. Verify that the firewall itself can resolve a public name and reach update servers, then verify a temporary LAN client. If only the firewall works, inspect LAN rules, outbound NAT, client gateway, and DNS separately.

### When WAN access does not work

| Observation | Next check |
|---|---|
| WAN has no address | Cable/link, ISP lease or PPPoE credentials, modem restart requirements |
| WAN has a private address | Deliberate upstream routing versus incomplete passthrough; private-network blocking |
| Firewall reaches an IP but not a hostname | Resolver configuration and DNS egress |
| Client cannot reach its gateway | VLAN/untagged path, address/mask, cable and interface assignment |
| Client reaches gateway but not Internet | Source-interface pass rule, NAT, upstream route |
| Outbound works but inbound tests fail | CGNAT, upstream forwarding, correct external test network |

Do not change several settings simultaneously. Capture the relevant interface state and live firewall log privately, change one cause, then repeat the same test.

## 3. Create VLANs without losing management access

1. Create the six VLANs from the table on the chosen trunk parent. Assign and enable each VLAN and both dedicated segments. Set their example `.1/24` addresses; do not configure an upstream gateway on these internal interfaces.
2. Add an explicit MGMT ingress rule allowing the administrator to the firewall's MGMT address on HTTPS, and SSH only if enabled.
3. On the switch, create the same VLANs. Make the OPNsense uplink **tagged** in each VLAN. An access port is **untagged** in exactly its assigned VLAN, with a matching PVID; exclude it from other VLANs.
4. Preserve a temporary administration path while creating a MGMT access port. Set the administrator to `10.77.90.10/24`, gateway `10.77.90.1`, and verify access through that port.
5. Restrict the switch management plane using its supported management-VLAN/access-control feature. An IP in the MGMT subnet alone does not guarantee isolation. Test from a non-management access port, including with a manually assigned management-subnet address, before trusting the restriction.
6. Only after the tagged management path works, remove the temporary LAN address/DHCP and broad default LAN pass rule. Leave the trunk parent without an IP. Prefer tagged-only trunk admission; if the switch requires a native VLAN/PVID, use an otherwise unused isolated VLAN, not MGMT.
7. Bind the firewall GUI to MGMT and retain the explicit admin rule. Review automatic anti-lockout rules and floating/group rules before claiming that only the intended host can administer it. Disable unused switch ports and save both configurations.

AP uplinks may carry several tagged SSID VLANs; configure their management/native VLAN explicitly. A normal access port cannot carry multiple isolated SSIDs without matching AP VLAN support.

### Enter one VLAN before repeating the pattern

Menu labels vary by release, but the configuration objects are the same. In the VLAN device page, add tag `110` on the selected trunk parent with description `LAB`. In interface assignments, assign that device, name it `LAB`, enable it, choose static IPv4, and set `10.77.10.1/24`. Leave upstream gateway unset. Repeat for the remaining VLANs in the address table.

On a NETGEAR-style membership screen, `T` means tagged, `U` untagged, and a blank/excluded entry means not a member. For the lab test port, set VLAN 110 to U and its PVID to 110. For the uplink, set VLAN 110 to T. Exclude the test port from the old/default client VLAN after preserving the recovery path.

Test one VLAN before configuring every endpoint. On a statically addressed test client, use an unused address such as `10.77.10.10/24` and gateway `10.77.10.1`. Confirm the route and access to an explicitly allowed test service. Absence of Internet access may simply mean no pass rule has been added yet; do not add a blanket internal allow to diagnose tagging.

### Complete the management move safely

Keep the old administration path available while you prepare the MGMT access port. Configure the switch's supported management VLAN and a private static management address, for example `10.77.90.2/24` with gateway `10.77.90.1`. Confirm that address is unused and excluded from DHCP. Then connect the administrator to the MGMT access port and test both switch and firewall management.

If the new path fails, return through the preserved path or console. Check the switch's management VLAN feature, uplink tag 190, access-port PVID 190, administrator address/mask, and firewall listener/rule. Only remove temporary access after both management interfaces work through the new path.

**Expected result:** a management client reaches the approved administrative services, while a guest client cannot. Test the switch from a guest access port with a manually assigned management-range address too; this checks a class of switch management exposure that ordinary routed tests can miss. Restore the guest's normal address after the test.

## 4. Establish DHCP and ordered firewall policy

Use the DHCP service supported by your installed OPNsense release; service names and menus vary. Run only one DHCP server per segment. Example client pools are `.100` through `.199`, excluding manually assigned infrastructure. Use the zone's `.1` gateway. Keep a working temporary resolver until AdGuard is deployed and tested; do not advertise a DNS server that is not running.

Rules normally apply where a connection **enters** OPNsense. An administrator connecting to SECSTACK needs a rule on MGMT, not SECSTACK. Stateful replies normally need no reverse pass rule. Same-subnet traffic is not controlled by these router rules. See [OPNsense firewall rules](https://docs.opnsense.org/manual/firewall.html).

Create host aliases for `ADMIN_HOSTS`, `DNS_SERVER`, `SENSOR`, and approved service destinations. Create `PROTECTED_NETS` covering **all** local, VPN, upstream-management, and other non-public destinations that clients must not reach. Include RFC1918, link-local, CGNAT, and any locally used public ranges as appropriate. `WAN address` means the firewall's WAN IP, not the Internet.

For each ordinary client ingress interface, use this order:

| Order | Action | Destination/service |
|---|---|---|
| 1 | Pass | DNS_SERVER, TCP and UDP 53 |
| 2 | Pass | Approved time server, UDP 123, if required |
| 3 | Pass | Explicit zone exceptions from the table below |
| 4 | Block | Any other TCP/UDP 53 and TCP/UDP 853 |
| 5 | Block | This Firewall (remaining management/local services) |
| 6 | Block | PROTECTED_NETS |
| 7 | Pass | Approved Internet protocols/destinations, if this zone needs them |
| 8 | Block/log | Everything else (the implicit default deny also remains) |

Keep DHCP's required service rules available. Review the complete effective ruleset, including floating, group, generated, and existing state entries. A broad pass before a block defeats that block; creating a destination alias named "Internet" does not automatically make it safe. Retest with new connections after policy changes.

| Source zone | Explicit exceptions before protected-network block |
|---|---|
| MGMT | ADMIN_HOSTS only to named infrastructure and required admin ports |
| WORK / TRUSTED | Selected printer IPs and actual printing ports, such as TCP 631 or 9100 |
| LAB / GUEST | DNS/time only unless a specific additional service is justified |
| PRINTER | DNS/time and narrowly scoped updates; no unsolicited access to clients |
| Monitored endpoints | Wazuh manager TCP 1514; TCP 1515 only when enrollment is needed |
| SECSTACK | Required DNS upstreams, updates and feeds; no general access to MGMT |
| HONEYPOT | Follow the stricter [DShield policy](/posts/dshield-honeypot/#3-isolate-before-exposure) |
| VPN | Per-peer approved services; administration is a separate privilege |

Blocking ports 53 and 853 constrains conventional DNS, DoT, and common DoQ. It does **not** prevent DoH over HTTPS, VPNs, proxies, or all other tunnels. Use managed endpoint/browser settings and additional policy if bypass prevention is a requirement. Give the resolver its own narrowly scoped upstream permissions before applying client DNS restrictions to SECSTACK.

### DHCP example and first-match rule construction

For LAB, enable the selected DHCP service on LAB with range `10.77.10.100` through `10.77.10.199`, gateway `10.77.10.1`, and a resolver that is already working. Keep static infrastructure below the pool or reserve it using that DHCP implementation's supported method. Save/apply, renew a test lease, and check address, mask, gateway, and DNS before repeating on other client interfaces.

Create `DNS_SERVER` as a host alias containing `10.77.100.10`. In a traditional OPNsense rule editor, a LAB DNS pass rule uses these fields:

| Field | Example value |
|---|---|
| Action / interface / direction | Pass / LAB / in |
| IP version / protocol | IPv4 / TCP/UDP |
| Source / source port | LAB net / any |
| Destination / destination port | DNS_SERVER / 53 |
| Gateway | Default, unless a deliberate policy-routing design requires otherwise |
| Description | LAB to approved DNS |

Client source ports are normally ephemeral; setting source port 53 would break ordinary queries. Add the remaining rules in the table's order, enable logging on the denies needed for validation, and apply. Keep descriptions specific enough to recognize in the live log.

For WORK printing, use a host alias for selected printers rather than the entire printer subnet, select TCP, and permit only the protocol actually enabled on the printer. Do not grant bidirectional subnet access just to make discovery work. Multicast discovery across VLANs is a separate design decision; adding a broad firewall rule does not automatically relay it.

### Verify a rule with positive and negative evidence

Use a destination with a known listening service. First show that an approved administrator can reach it. Next try the same destination/port from the restricted zone and confirm the deny entry at the firewall. A service that is down will fail from both zones and cannot validate a segmentation rule.

In Windows, `Test-NetConnection` is convenient for TCP checks:

```powershell
# From the permitted administrator, then repeat from a restricted client.
Test-NetConnection -ComputerName 10.77.100.10 -Port 22
```

Expected: SSH succeeds only where the source policy permits it. Check DNS separately because successful TCP 22 says nothing about UDP 53. When changing policy, test with new connections; existing states may retain earlier access. If clearing states is necessary, target only the relevant test state and preserve the management session.

## 5. Prepare the Ubuntu server

Use an Ubuntu release supported by all selected components. Install updates, enable reliable time synchronization, and assign the static server address from the plan. Install OpenSSH through the installer's SSH setup or package manager.

Generate an administrator key locally and copy **only the public key** to the server:

```bash
mkdir -p ~/.ssh && chmod 700 ~/.ssh
ssh-keygen -t ed25519 -C "example-lab-admin" -f ~/.ssh/lab_admin
ssh-copy-id -i ~/.ssh/lab_admin.pub labadmin@10.77.100.10
ssh -i ~/.ssh/lab_admin labadmin@10.77.100.10
```

Replace `labadmin` with the account you created. Protect the private key with a passphrase. After a successful second key-authenticated session, disable root, password, and keyboard-interactive SSH authentication. Check included configuration files and `Match` blocks, run `sudo sshd -t`, inspect effective settings with `sudo sshd -T`, then reload SSH while retaining console/session recovery. SSH keepalive settings detect dead peers; they are not an inactivity logout policy.

A minimal UFW host policy can allow TCP 22 from the administrator and required host-network DNS/admin services, then deny other unsolicited input. Do not allow all internal networks to every dashboard. Optional fail2ban does not replace source restrictions or key authentication; a mistyped local key passphrase is not a server authentication failure.

Install Docker Engine and Compose using the [official Ubuntu installation instructions](https://docs.docker.com/engine/install/ubuntu/). Membership in the Docker group effectively grants root-level control. Pin tested image versions/digests and keep a private upgrade/rollback record.

**Docker firewall caveat:** published bridge-network ports can bypass ordinary UFW input rules. Apply routed OPNsense restrictions and Docker-backend-appropriate filtering; bind published ports to intended addresses and test reachability. Do not disable Docker's firewall management as a shortcut. See [Docker packet filtering](https://docs.docker.com/engine/network/packet-filtering-firewalls/).

### Ubuntu address and recovery checks

For the reference server, use address `10.77.100.10/24`, gateway `10.77.100.1`, and initially a working resolver permitted by the SECSTACK policy. Set these during Ubuntu installation or through the host's existing network manager. Do not append a second competing network definition without examining the current configuration.

```bash
ip -br address
ip route
resolvectl status
sudo apt update
sudo apt upgrade
sudo apt install -y openssh-server ca-certificates curl dnsutils
sudo systemctl status ssh --no-pager
```

Expected: the intended NIC has the static address, the default route points to `.1`, and name resolution works before Docker is installed. If using Netplan to change an existing server, validate with `sudo netplan generate` and use `sudo netplan try` with console access available. Confirm the new SSH session before accepting the change.

### Key-only SSH with a second-session test

After the key-copy and successful key-login steps above, configure the effective SSH policy for your installed OpenSSH version:

```text
PubkeyAuthentication yes
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
AllowUsers labadmin
X11Forwarding no
AllowAgentForwarding no
```

Replace `labadmin` with the account you actually created. Check `/etc/ssh/sshd_config` and included files; simply appending a contradictory setting may not override the effective value. Keep the original session open, then run:

```bash
sudo sshd -t
sudo sshd -T | grep -E 'passwordauthentication|kbdinteractiveauthentication|permitrootlogin|allowusers'
sudo systemctl reload ssh
```

Expected: syntax validation succeeds and the effective values match your intent. From a second terminal, reconnect with the chosen key. Only then close the first session. If a `Match` section applies, also evaluate settings for the intended connection, rather than relying solely on the global output.

### Install Docker on a fresh Ubuntu host

The following uses Docker's official Ubuntu APT repository. On an existing container host, first review installed packages and workloads; do not remove competing packages or replace the engine blindly.

```bash
sudo apt update
sudo apt install -y ca-certificates curl
sudo install -d -m 0755 /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
. /etc/os-release
printf '%s\n' \
  'Types: deb' \
  'URIs: https://download.docker.com/linux/ubuntu' \
  "Suites: ${UBUNTU_CODENAME:-$VERSION_CODENAME}" \
  'Components: stable' \
  "Architectures: $(dpkg --print-architecture)" \
  'Signed-By: /etc/apt/keyrings/docker.asc' | sudo tee /etc/apt/sources.list.d/docker.sources
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo docker run --rm hello-world
sudo docker compose version
```

Use `sudo docker` in later examples unless the deployment administrator already has authorized Docker access. If you deliberately add that account to the Docker group, log out and back in, and treat the account as a host administrator. The service guides' unprefixed `docker` commands assume that access has been established.

Prepare private service directories outside the website repository. Keep each service's Compose file, environment, and persistent data together or document its named volumes clearly. Avoid placing a production `.env` alongside public walkthrough files.

## 6. Deploy and validate AdGuard Home first

Reserve TCP/UDP 53 for DNS and TCP 3000 for the private admin UI. Wazuh will use TCP 443 and OpenCTI TCP 8080. Check existing listeners, including `systemd-resolved`, before starting containers; if changing the host resolver, maintain a working `/etc/resolv.conf` and avoid a bootstrap loop.

This Linux host-network example deliberately has **no `ports` block**. Set ADGUARD_VERSION to a reviewed release tag in a private environment file. For digest pinning, replace the entire image value with the official repository followed by @sha256: and its verified digest:

```yaml
services:
  adguard:
    image: "adguard/adguardhome:${ADGUARD_VERSION:?Set a tested image tag}"
    restart: unless-stopped
    network_mode: host
    volumes:
      - ./data/work:/opt/adguardhome/work
      - ./data/conf:/opt/adguardhome/conf
```

Use the [AdGuard Docker documentation](https://adguard-dns.io/kb/adguard-home/docker/). Host networking is one deployment choice, not a universal requirement for client IP visibility. In the wizard at `http://10.77.100.10:3000`, bind DNS to the intended service address and keep the admin UI on port 3000. Restrict that UI to administrators; use HTTPS or an SSH tunnel for remote administration. Do not later move it onto Wazuh's port 443.

Configure chosen DNS upstreams and a bootstrap resolver if they use hostnames. Begin with a small maintained filter set and test needed applications. Set query-log retention deliberately; query logs identify clients and browsing activity. After a client successfully resolves through AdGuard, update DHCP DNS and renew leases, then enable DNS enforcement. Validate the server's own resolution after reboot too.

## 7. Deploy Wazuh from a complete release

Use the [official Docker deployment guide](https://documentation.wazuh.com/current/deployment-options/docker/wazuh-container.html) for one selected release. Download or clone the **complete matching repository**, including `single-node/config`, not just two Compose files. Record its tag/commit privately.

1. Meet that release's resource and kernel prerequisites, including the required `vm.max_map_count`.
2. Generate certificates with the release's supplied certificate-generation workflow.
3. Replace default passwords consistently across the indexer, manager/API, dashboard, and related configuration using the documented password-change process. A dashboard-only password edit can break inter-service authentication.
4. Review published ports and restrict dashboard 443 to administrators. Limit agent 1514 and enrollment 1515 to intended clients; do not publish backend APIs/indexer ports unnecessarily.
5. Run `docker compose config --quiet`, start the stack, and review health/logs before enrolling agents. Use the dashboard's version-matched agent deployment instructions.

For OPNsense syslog, configure a manager `<remote>` syslog listener with explicit allowed source addresses and matching UDP/TCP protocol. Publish the same port in Compose if needed, then configure an OPNsense logging target. The sending address may be the SECSTACK interface address; verify it. Enable Suricata EVE/syslog forwarding separately. Confirm event receipt and decoder/rule behavior; successful UDP transmission alone proves neither ingestion nor alert generation.

Optional Slack/email integrations belong in private persistent configuration. Store credentials outside version control, restrict access, and consider the identifying data included in alert payloads. Use [Wazuh's integration documentation](https://documentation.wazuh.com/current/user-manual/manager/integration-with-external-apis.html) for the selected release.

### Wazuh deployment checkpoints

On the security server, clone the official repository into a private deployment directory and choose the release referenced by the matching documentation. The commands deliberately require that selection rather than silently installing the current development branch:

```bash
mkdir -p ~/private-deployments
cd ~/private-deployments
git clone https://github.com/wazuh/wazuh-docker.git
cd wazuh-docker
read -r -p "Wazuh Docker release tag from the matching guide: " WAZUH_DOCKER_TAG
git switch --detach "${WAZUH_DOCKER_TAG:?Select a documented release tag}"
cd single-node
```

Inspect the Compose file and the supplied `config` directory. Use that release's certificate generator, environment, and credential-change instructions together. For releases using `generate-indexer-certs.yml`, the generation step is:

```bash
docker compose -f generate-indexer-certs.yml run --rm generator
```

Do not continue if certificates are missing or the generator fails. Check the kernel prerequisite before starting the indexer; use the selected release's documented value in a dedicated sysctl file instead of repeatedly appending duplicate settings.

After credentials, ports, and certificates are configured, validate and start:

```bash
docker compose config --quiet
docker compose up -d
docker compose ps
docker compose logs --tail=100 wazuh.indexer wazuh.manager wazuh.dashboard
```

Expected: all components settle into their intended running/healthy state and the dashboard becomes reachable from an approved administrator. Authentication failures between components usually require checking the coordinated credential configuration, not just resetting the interactive dashboard account.

### Receive one OPNsense log source before adding others

In the persistent manager configuration, an illustrative receiver for firewall-originated syslog looks like this inside the existing `<ossec_config>` element:

```xml
<remote>
  <connection>syslog</connection>
  <port>514</port>
  <protocol>udp</protocol>
  <allowed-ips>10.77.100.1</allowed-ips>
</remote>
```

Use the actual source address observed for your logging target; this example assumes the firewall sends from its SECSTACK interface. Preserve the separate secure-agent receiver. Check [Wazuh remote configuration](https://documentation.wazuh.com/current/user-manual/reference/ossec-conf/remote.html) for the selected release. Ensure UDP 514 is published to the manager only where intended, and restart the manager after changing its persistent configuration.

In OPNsense's logging-target page, add destination `10.77.100.10`, matching UDP port 514, and begin with one application/category. Send a benign event, then look for that event in the manager's processing path. A received raw event may not create an alert if no rule matches; test the decoder/rule rather than treating an empty alert list as proof of network failure. Add Suricata forwarding and additional categories only after the first source works.

For endpoint agents, use the dashboard's deployment instructions with manager `10.77.100.10`. Permit TCP 1514 from intended endpoint networks and the enrollment path only when needed. Verify enrollment, an active heartbeat, and one controlled event. Keep the manager API and indexer inaccessible to ordinary clients.

## 8. Add OpenCTI only after core services are stable

Use the [OpenCTI installation guide](https://docs.opencti.io/latest/deployment/installation/) and its matching official Docker distribution. Do not combine arbitrary `latest` platform/worker images with unrelated old Elasticsearch, Redis, RabbitMQ, or MinIO versions.

Copy the release's sample environment file to a private `.env`; generate unique administrator/backend passwords and the required token/connector UUIDs locally. Use `admin@example.com` only as a documentation placeholder. Restrict the file to its owner, exclude it from Git, and protect backups. Follow the release's required variables, health checks, memory limits, and dependency configuration.

Keep backend services on private container networks. Expose only the application port on the intended address, restrict it to administrators, and use HTTPS or an SSH tunnel before sending credentials over an untrusted network. Validate the resolved Compose configuration privately because it can contain secrets.

Connectors are separately deployed/configured components; they are not all activated by a dashboard toggle. Select supported connectors, pin compatible versions, configure their credentials/schedules, and verify ingestion. Wazuh correlation is a separate integration project, not an automatic consequence of running both products. Do not reuse OpenCTI's database as a Zenarmor reporting database.

## 9. Configure WireGuard remote access

Follow the [OPNsense road-warrior guide](https://docs.opnsense.org/manual/how-tos/wireguard-client.html). Use the installed release's WireGuard menu; do not assume an extra plugin is required.

Create an instance at `10.77.200.1/24`, UDP 51820, and generate its keys privately. Create a peer with a unique tunnel `/32` and associate it with that instance. Enable WireGuard. Assign its device as an interface with IPv4/IPv6 configuration types **None**; the instance supplies the tunnel address. Allow WAN UDP 51820 to the WAN address, then add least-privilege rules on the assigned tunnel interface.

Example client template (generate the private key on the client):

```ini
[Interface]
PrivateKey = <CLIENT_PRIVATE_KEY>
Address = 10.77.200.2/32
DNS = 10.77.100.10

[Peer]
PublicKey = <SERVER_PUBLIC_KEY>
Endpoint = vpn.example.com:51820
AllowedIPs = 10.77.100.10/32
PersistentKeepalive = 25
```

This example routes only the security server; firewall rules still decide which services are accessible. Permit DNS 53 and explicitly required dashboard/agent ports. Add destinations to both routing and firewall policy when needed. Grant MGMT access only to approved administrative peers.

For an IPv4 full tunnel, use `AllowedIPs = 0.0.0.0/0`, permit intended Internet egress after internal blocks, and verify outbound NAT includes the VPN subnet. Do not blindly add `::/0`: configure and test IPv6 end-to-end or deliberately block/disable it on the client to prevent bypass. Full tunneling alone does not guarantee inspection of decrypted VPN traffic or prevent DNS tunneling.

### WireGuard setup and an offsite test

1. In the instance editor, enable the instance, generate server keys, enter UDP 51820 and `10.77.200.1/24`, and save. Keep the private key on the firewall.
2. Generate a client keypair in the client application. Add a firewall peer containing only its public key and `10.77.200.2/32`. Select that peer in the instance and apply.
3. Assign the WireGuard device, enable the interface, leave address configuration as None, and restart/apply WireGuard as directed by the installed release.
4. Add the WAN UDP pass rule to the firewall's WAN address. On the assigned WireGuard interface, allow the peer address to AdGuard TCP/UDP 53 and the specific services it needs; keep all other access denied.
5. Fill in the client template privately with the actual public endpoint and keys. Connect over mobile data or another outside connection, not just the local Wi-Fi.
6. Check the latest handshake and transfer counters, resolve a name through AdGuard, and test one allowed and one denied destination.

A recent handshake proves that the peers authenticated; it does not prove routing, DNS, NAT, or application access. If the handshake succeeds but DNS fails, check the client's route to `10.77.100.10`, tunnel-ingress rules, the resolver's client allowlist, and return routing. If no handshake occurs, check endpoint resolution, WAN reachability, ISP/CGNAT, keys, peer association, and UDP 51820 first.

For a full tunnel, separately verify the observed external address, DNS behavior, and IPv6 handling. Test access again after switching the client between networks. Do not enable management access merely because a peer is authenticated; keep an explicit administrative peer alias.

## 10. Add inspection without conflicting packet engines

Suricata is built into OPNsense's intrusion-detection service. Start in IDS/alert mode, load a small ruleset, verify useful alerts, then selectively enable drop policies. For netmap IPS, disable hardware offloads as directed by [OPNsense's IPS guide](https://docs.opnsense.org/manual/ips.html); VLAN inspection uses the supported parent interface.

WAN capture sees NAT-translated addresses and encrypted VPN traffic. Set HOME_NET for the addresses visible at the chosen capture point; an internal-only HOME_NET on WAN can prevent relevant rules from matching. WAN inspection does not establish visibility into internal east-west traffic or encrypted application payloads. If per-client/internal visibility is required, choose an appropriate internal capture point instead.

Install Zenarmor through its [vendor documentation](https://www.zenarmor.com/docs), checking current repository/plugin names, interface support, hardware requirements, and licensing. Never attach both netmap engines to the same interface or assume a parent/VLAN split avoids contention. The vendor [coexistence guidance](https://www.zenarmor.com/docs/troubleshooting/configuration) requires separate interfaces for Suricata IPS and Zenarmor. A WAN Suricata/internal Zenarmor layout is one option with the WAN limitations above.

Use a supported dedicated reporting backend. Policy counts/features depend on edition; the free edition must not be assumed to support all per-zone policies. Confirm visibility with actual traffic, including VPN flows, and retest performance after enabling either engine.

## 11. Validate before exposing services

Run tests from an actual client in each zone, using fresh connections and both allowed and denied TCP/UDP services. Ping failure alone does not prove isolation.

```bash
# Linux client examples
ip address show
ip route show
nslookup example.com 10.77.100.10
nslookup example.com 8.8.8.8
```

The first DNS query should succeed; the second should fail under the direct-block policy. `8.8.8.8` is a public resolver test destination, not a private operational address.

- [ ] DHCP leases, gateways, VLAN membership, PVIDs, and DNS match the private plan.
- [ ] Unauthorized zones cannot reach firewall/switch management, server SSH, or dashboards; approved admins can.
- [ ] Guest/lab/sensor cannot initiate connections to protected networks except documented DNS/time/logging exceptions.
- [ ] Same-VLAN/AP client isolation works where required.
- [ ] DNS works after reboots; encrypted DNS/IPv6 behavior matches the stated policy.
- [ ] Wazuh receives and interprets a test event; OpenCTI receives an intended feed.
- [ ] WireGuard works offsite and reaches only its approved destinations, with the intended IPv4/IPv6 egress behavior.
- [ ] Inspection generates expected alerts/drops at the selected capture points without disrupting traffic.
- [ ] A scan from outside finds only deliberately exposed VPN/honeypot services.
- [ ] Private backups and recovery access work; no secrets or live screenshots enter the website repository.

**Unverified deployment details:** the actual switch revision and management controls, ISP handoff, installed component versions, IPv6 behavior, resource capacity, and inspection coverage require local confirmation. This documentation review did not change or test live equipment.
