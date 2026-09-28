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

## 2. Prepare the ISP handoff and install OPNsense

Bridge mode, IP passthrough, and a consumer router's DMZ/exposed-host feature are different. Bridge mode usually removes routing/NAT for the downstream handoff; passthrough behavior is vendor-specific; DMZ forwarding commonly retains NAT. Double NAT can complicate inbound access, but does not inherently break every VPN. Follow the ISP's instructions for the exact gateway. Do not disable its firewall before the replacement firewall is ready. Management access after conversion is also device-specific.

For inbound VPN or honeypot traffic, confirm that the WAN is reachable from the Internet. CGNAT generally prevents unsolicited inbound IPv4 without provider assistance; another port forward on your own router does not solve it. A public IPv6 address needs its own firewall policy.

1. Obtain a current supported installer from [OPNsense](https://opnsense.org/download/) and follow its image verification and media-writing instructions. Check the target USB carefully before writing.
2. Install using the console and set a unique administrator password. Interface assignments depend on the NICs detected by that installation.
3. Use a **temporary, non-overlapping** untagged LAN, such as `192.168.250.1/24`, for initial access. Do not assign the eventual MGMT subnet to both this LAN and a VLAN interface.
4. Update OPNsense, set time synchronization, and save a baseline backup. Use `home.arpa` for a private home namespace rather than `.local`, which is used by multicast DNS.
5. Keep WAN default-deny. Enable private-network blocking only when appropriate for the upstream addressing; a private WAN behind another router needs a deliberate exception.

This guide's rule examples are IPv4-only. Leave IPv6 routing, router advertisements, and DHCPv6 disabled until you have an equivalent tested IPv6 policy. IPv4 RFC1918 blocks do not filter IPv6.

## 3. Create VLANs without losing management access

1. Create the six VLANs from the table on the chosen trunk parent. Assign and enable each VLAN and both dedicated segments. Set their example `.1/24` addresses; do not configure an upstream gateway on these internal interfaces.
2. Add an explicit MGMT ingress rule allowing the administrator to the firewall's MGMT address on HTTPS, and SSH only if enabled.
3. On the switch, create the same VLANs. Make the OPNsense uplink **tagged** in each VLAN. An access port is **untagged** in exactly its assigned VLAN, with a matching PVID; exclude it from other VLANs.
4. Preserve a temporary administration path while creating a MGMT access port. Set the administrator to `10.77.90.10/24`, gateway `10.77.90.1`, and verify access through that port.
5. Restrict the switch management plane using its supported management-VLAN/access-control feature. An IP in the MGMT subnet alone does not guarantee isolation. Test from a non-management access port, including with a manually assigned management-subnet address, before trusting the restriction.
6. Only after the tagged management path works, remove the temporary LAN address/DHCP and broad default LAN pass rule. Leave the trunk parent without an IP. Prefer tagged-only trunk admission; if the switch requires a native VLAN/PVID, use an otherwise unused isolated VLAN, not MGMT.
7. Bind the firewall GUI to MGMT and retain the explicit admin rule. Review automatic anti-lockout rules and floating/group rules before claiming that only the intended host can administer it. Disable unused switch ports and save both configurations.

AP uplinks may carry several tagged SSID VLANs; configure their management/native VLAN explicitly. A normal access port cannot carry multiple isolated SSIDs without matching AP VLAN support.

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

## 5. Prepare the Ubuntu server

Use an Ubuntu release supported by all selected components. Install updates, enable reliable time synchronization, and assign the static server address from the plan. Install OpenSSH through the installer's SSH setup or package manager.

Generate an administrator key locally and copy **only the public key** to the server:

```bash
ssh-keygen -t ed25519 -C "example-lab-admin" -f ~/.ssh/lab_admin
ssh-copy-id -i ~/.ssh/lab_admin.pub labadmin@10.77.100.10
ssh -i ~/.ssh/lab_admin labadmin@10.77.100.10
```

Replace `labadmin` with the account you created. Protect the private key with a passphrase. After a successful second key-authenticated session, disable root, password, and keyboard-interactive SSH authentication. Check included configuration files and `Match` blocks, run `sudo sshd -t`, inspect effective settings with `sudo sshd -T`, then reload SSH while retaining console/session recovery. SSH keepalive settings detect dead peers; they are not an inactivity logout policy.

A minimal UFW host policy can allow TCP 22 from the administrator and required host-network DNS/admin services, then deny other unsolicited input. Do not allow all internal networks to every dashboard. Optional fail2ban does not replace source restrictions or key authentication; a mistyped local key passphrase is not a server authentication failure.

Install Docker Engine and Compose using the [official Ubuntu installation instructions](https://docs.docker.com/engine/install/ubuntu/). Membership in the Docker group effectively grants root-level control. Pin tested image versions/digests and keep a private upgrade/rollback record.

**Docker firewall caveat:** published bridge-network ports can bypass ordinary UFW input rules. Apply routed OPNsense restrictions and Docker-backend-appropriate filtering; bind published ports to intended addresses and test reachability. Do not disable Docker's firewall management as a shortcut. See [Docker packet filtering](https://docs.docker.com/engine/network/packet-filtering-firewalls/).

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
