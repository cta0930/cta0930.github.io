---
layout: post
title: "DShield Honeypot Add-On for the OPNsense Homelab"
date: 2026-03-08
categories: [HomeLab, Security]
tags: [homelab, dshield, honeypot, raspberry-pi, opnsense, firewall, nat, cloud, internet-storm-center, network-security]
---

# DShield Honeypot Add-On for the OPNsense Homelab

## Scope and example conventions

This guide extends the [OPNsense homelab walkthrough](/posts/homelab-network-setup/). It covers a dedicated sensor behind OPNsense, with notes for cloud or another router. Documentation was reviewed on 2026-09-28; no live sensor or firewall was tested as part of that review.

Addresses and names are synthetic and match the base guide: HONEYPOT `10.77.110.0/24`, gateway `10.77.110.1`, sensor `10.77.110.10`, DNS `10.77.100.10`, and administrator `10.77.90.10`. They are not operational inventory. Keep real addresses, MACs, account/email identifiers, API keys, logs, and installer/status output private. DShield intentionally submits telemetry to ISC; understand that submission separately from sanitizing a public walkthrough.

## 1. Choose a dedicated supported host

Use a dedicated physical host or isolated VM with one sensor interface. Do not co-locate production services, personal files, or a trusted-network interface. For this example choose Ubuntu Server 24.04 LTS or the supported 64-bit Raspberry Pi OS described by upstream. The [DShield README](https://github.com/DShield-ISC/dshield) lists its tested platforms and minimum resources; arbitrary Linux distributions are not guaranteed to work. Allow headroom for logs and monitor disk space.

| Deployment | Inbound path | Containment |
|---|---|---|
| OPNsense + private sensor | Reachable WAN IPv4 and destination NAT | Dedicated segment and ingress/egress rules |
| Cloud VM | Provider public-IP mapping/security policy | Isolated network, provider firewall, no trusted workloads |
| Other router | Equivalent port forwards where NAT is used | Separate VLAN/subnet with enforced routing policy |

A host firewall on the same unrestricted LAN as personal computers is not an adequate replacement for an external isolation boundary. Cloud security groups also need deliberate outbound rules; their defaults often permit all egress. Restrict cloud metadata access and remove unnecessary instance roles/credentials.

If your ISP uses CGNAT, local port forwarding does not create public reachability. Resolve that with the provider or choose an isolated cloud deployment. This example is IPv4-only; block unintended IPv6 exposure and verify the installer/host behavior.

### Choose the path before imaging the host

For the home-lab path, have these items ready: a sensor-only Ethernet segment, an OPNsense interface assigned to it, local console access to the sensor, a private ISC account, and an offsite test connection. Keep WAN forwarding disabled until administration and isolation tests pass.

For a Raspberry Pi, use a supported 64-bit OS image and a reliable power supply/storage device. In the imager, configure only the account, key-based SSH, and network options needed for initial access. Do not embed account details or wireless credentials in a public screenshot. Wired Ethernet makes the single-interface model easier to reason about; disable unused wireless connectivity.

For a VM, attach one virtual NIC to the isolated sensor network. A hypervisor bridge or port group attached to the ordinary LAN defeats the intended boundary even if the guest has a different-looking IP. Keep hypervisor management on a separate protected network and avoid shared folders, clipboard integration, or mounted credentials on the sensor.

For cloud hosting, first secure the provider account and recovery console. Use an isolated network without trusted peer workloads, remove unnecessary attached roles and metadata access, and review both inbound and outbound policy. A directly addressed VM does not need the home OPNsense port-forward rules.

### Record a private deployment worksheet

| Item | Example / what to record |
|---|---|
| Sensor role | Dedicated disposable Internet sensor |
| OS and architecture | Exact installed release and CPU architecture |
| NIC | Actual name from `ip -br link`, not an assumed eth0 |
| Sensor address | Example `10.77.110.10/24` |
| Gateway / resolver | Example `10.77.110.1` / `10.77.100.10` |
| Management source | Example `10.77.90.10/32` or an approved VPN peer |
| Source revision | Installer commit recorded before installation |
| Inbound services | Initially TCP 22 and 80 only in this design |
| Recovery | Console access and rebuild instructions |

The public guide uses examples; keep the filled-in worksheet private. Record the reason for every additional egress or inbound exception so later changes can be audited.

## 2. Register and install before public exposure

Register through [ISC account settings](https://isc.sans.edu/myaccount.html). Keep the required account values and API key in a password manager; enter them locally when prompted. Do not include them in shell command lines, screenshots, or Git.

Follow the [Ubuntu installation instructions](https://github.com/DShield-ISC/dshield/blob/main/docs/install-instructions/Ubuntu.md) or the matching [Raspberry Pi instructions](https://github.com/DShield-ISC/dshield/blob/main/docs/install-instructions/Raspbian.md). On a fresh Ubuntu host, create the requested account with working sudo access, apply updates, and install Git/OpenSSH. Retain console recovery and a tested administrator key.

As the intended unprivileged installation user:

```bash
git clone https://github.com/DShield-ISC/dshield.git
cd dshield
git rev-parse HEAD
# Review the selected revision and OS-specific instructions before executing.
bin/install.sh
```

Record the revision privately. Current Ubuntu instructions say the installer invokes sudo where required; do not wrap the whole installation in `sudo bash` based on an old recipe. Enter the actual NIC and narrowly scoped management sources during setup. Reboot when instructed and reconnect on the installer-configured real SSH port, normally TCP 12222:

```bash
ssh -p 12222 dshield@10.77.110.10
```

Confirm the generated policy accepts your routed management address. Do not assume being on the sensor's local subnet, or being behind NAT, is a sufficient administrative restriction. The installer configures redirection, logging, services, and reporting; review its generated state before exposing it.

### Ubuntu preparation in detail

On a fresh supported Ubuntu installation, apply updates and install the small set of prerequisites before running the sensor installer:

```bash
sudo apt update
sudo apt upgrade
sudo apt install -y git openssh-server
ip -br address
ip route
timedatectl status
```

Expected: one intended sensor NIC, a default route through the sensor gateway, accurate time, and working name resolution. Review any reboot requirement before proceeding. Do not run Docker, OpenCTI, or another service stack on this host.

If the `dshield` account was not created during OS installation, create it locally with a password usable for sudo and add it to the administrative group:

```bash
sudo adduser dshield
sudo usermod -aG sudo dshield
```

Install the administrator's public SSH key for this account and verify access before disabling password login. Retain console recovery. Switch to that account for installation and test that sudo works:

```bash
sudo -iu dshield
sudo -v
```

Run the clone/install sequence above from this user's home directory. Do not assume the cloud image's original user automatically has the same home directory or permissions. If using a different supported account model, follow that revision's OS instructions consistently.

### Installer inputs and what they control

Prompt wording changes between revisions. Answer from the private worksheet rather than mechanically selecting defaults:

| Input area | What to verify |
|---|---|
| ISC credentials | Correct account/API values entered locally, never copied into the post |
| Network interface | The actual interface carrying sensor traffic |
| Administrative sources | Only the intended routed admin/VPN addresses, not all private ranges |
| Local/trusted exemptions | Their effect on logging and honeypot redirects |
| Real SSH administration | Confirm the final port and source restrictions |
| Public address/reporting | Correct handling of upstream NAT and the observed Internet endpoint |

Keep the installer log private. If installation fails, identify the first failed prerequisite or service operation before rerunning. Repeatedly layering package and firewall changes over an uncertain state can make recovery harder; a clean reinstall is often appropriate for a disposable sensor.

### Post-install checkpoint

Reconnect from the approved administrative source on the reported real SSH port. Keep the old session until the new one works. Check listeners and the project's status script, then reboot once and repeat. Do this before Internet exposure so a boot-time firewall or SSH error cannot strand an already exposed host.

If administration fails after installation, use the console. Inspect the SSH listener, generated administrative source allowlist, actual routed source address, and upstream MGMT rule. Do not add a public WAN forward to the real SSH port to recover access.

## 3. Isolate before exposure

Assign the dedicated HONEYPOT interface `10.77.110.1/24`; place only the sensor on that segment. Use a static sensor address outside any DHCP pool, or a reservation appropriate to your selected DHCP service. If using a VLAN instead, make the sensor port untagged in only HONEYPOT and the uplink tagged for it.

Create aliases for the sensor, approved DNS/time servers, and `PROTECTED_NETS`. Include all trusted, VPN, upstream-management, link-local, CGNAT, and locally used non-public destinations; RFC1918 alone is incomplete. Include locally used public prefixes where necessary.

On **HONEYPOT ingress**, use this order for sensor-initiated IPv4 connections:

| Order | Action | Source -> destination |
|---|---|---|
| 1 | Pass | Sensor -> approved DNS host, TCP/UDP 53 |
| 2 | Pass | Sensor -> approved time host, UDP 123 |
| 3 | Pass, optional | Sensor -> dedicated log receiver, exact required port |
| 4 | Block/log | HONEYPOT net -> This Firewall (all remaining services) |
| 5 | Block/log | HONEYPOT net -> PROTECTED_NETS |
| 6 | Pass | Sensor -> approved public reporting/update destinations, TCP 443 |
| 7 | Pass, only if required | Sensor -> approved public package destinations, TCP 80 |
| 8 | Block/log | HONEYPOT net -> any |

DNS/time exceptions must precede the protected-network block. If repositories or feeds use changing/CDN addresses, maintain and test the destination policy; an FQDN alias is not URL-level filtering. Temporarily broader public HTTP(S) egress is a containment tradeoff, not a guarantee of telemetry-only traffic. Document and narrow it after installation. Do not remove the internal blocks to fix a failed update.

On **MGMT ingress**, allow only the administrator host to sensor TCP 12222. For VPN administration, place the corresponding rule on the tunnel ingress interface. Putting that rule on HONEYPOT would not authorize a connection entering from MGMT. Stateful replies are normally permitted automatically; this does not grant the sensor new connections to trusted hosts.

Check floating/group rules and remove any old broad pass rules. These controls apply to routed traffic, not other machines on the same segment. Cloud deployments need equivalent enforced egress containment and private/VPN administration. Avoid permitting an entire cloud network just because it is private address space.

### Create the OPNsense objects

1. Assign the dedicated physical port or VLAN as HONEYPOT, enable it, and set `10.77.110.1/24`. Leave upstream gateway unset.
2. Set the sensor to `10.77.110.10/24` with that gateway. If using DHCP, configure its reservation/pool so there is no overlap with manually assigned hosts.
3. Add a host alias `SENSOR` containing `10.77.110.10` and a host alias for each approved DNS, time, and optional log destination.
4. Build the HONEYPOT ingress rules from the table. Choose IPv4 and source `SENSOR` for the explicit service passes. Source port stays any; destination port is the named service.
5. Add the management pass on MGMT with source the admin host, destination SENSOR, TCP destination port 12222. Do not allow the whole sensor subnet to initiate management connections.
6. Save/apply, open the live firewall log, and validate the allowed paths before creating WAN forwards.

For an approved internal DNS server, a blanket private-network block placed before the DNS exception will break resolution. Conversely, an unrestricted HONEYPOT-to-any pass placed before the internal block will bypass containment. Read the rules in their effective order, including floating and group rules.

### Containment evidence to retain privately

Test from the sensor to a known active management service, such as server SSH, and verify a deny entry. From the administrator, verify that real sensor SSH still works. Then test a permitted DNS lookup and update/reporting connection. This combination checks both containment and usability.

A sensor can still reply to an Internet connection already admitted by a stateful firewall. That is necessary for the honeypot to function. The egress policy above restricts **new sensor-initiated connections**; it is not a promise that an established adversary session cannot exchange data.

## 4. Preserve the installer's honeypot redirection

DShield performs host-side redirection for its honeypot listeners. Do not translate WAN ports to guessed alternate sensor ports; forward the original destination ports to the sensor and verify the selected installer's generated rules.

For a deliberately limited initial OPNsense exposure, forward the original TCP destination ports unchanged:

| WAN destination | Sensor destination | Purpose |
|---|---|---|
| WAN address TCP 22 | 10.77.110.10 TCP 22 | SSH honeypot via host redirect |
| WAN address TCP 80 | 10.77.110.10 TCP 80 | HTTP honeypot via host redirect |

Create matching associated WAN filter rules in the destination-NAT/port-forward screen. Preserve the external source address: do not source-NAT arriving Internet clients to a trusted internal address. Keep NAT reflection disabled for this testing workflow and test from outside. Confirm that the chosen WAN ports are not used by firewall administration or another forward.

Inspect the installed redirect lists before optionally exposing Telnet, additional web ports, or HTTPS. Forward only ports supported and tested in that installed revision, preserving their original destination ports. Do not expose a guessed HTTPS listener. Never forward real administrative SSH TCP 12222 from the home WAN.

This selective exposure intentionally gathers less telemetry than upstream's broader sensor deployment model. It is not a full-port DShield collector. The [upstream architecture](https://github.com/DShield-ISC/dshield/blob/main/docs/dshield-architecture/Architecture.md) explains host redirection, but may lag the current installer; generated rules and verified listeners decide the actual port set.

For a cloud VM, allow the same chosen original ports in the provider's firewall and leave redirection to the sensor. Private/VPN administration or provider console access should remain separate. On another NAT router, use the same original-port forwarding principle. Directly routed public addressing requires inbound filtering, not an extra OPNsense NAT rule.

### Enter the first port forward

In the IPv4 destination-NAT/port-forward editor, create one rule for SSH:

| Field | Example |
|---|---|
| Interface / protocol | WAN / TCP |
| Source / source port | Any / any |
| Destination | WAN address |
| Destination port | 22 |
| Redirect target | SENSOR (`10.77.110.10`) |
| Redirect target port | 22 |
| Filter association | Associated pass rule |
| Description | Internet SSH to isolated sensor |

Repeat for HTTP with destination and redirect port 80. Apply, inspect the associated WAN rule, and verify the exact translated destination. Leave any NAT reflection option disabled for this workflow. Do not create an "all ports" forward as a troubleshooting shortcut.

The packet path is Internet client -> OPNsense destination translation -> original sensor port -> DShield's host redirect -> honeypot listener. The real administrative listener is separate. Inspecting `ss` may show the final listener rather than a process bound directly to original port 22; the NAT table explains the rest of the path.

### Diagnose inbound traffic at each hop

During a brief external test, compare the WAN rule log with a short capture on the sensor:

```bash
# On the sensor, replace the interface name with the one actually installed.
sudo tcpdump -ni <SENSOR_INTERFACE> -c 20 'tcp port 22 or tcp port 80'
```

Replace the angle-bracket placeholder before running; do not save or publish packet contents unnecessarily. Install the diagnostic tool through the permitted package path if it is not present.

- Nothing at WAN: verify the external address, ISP reachability, upstream router, and test source.
- WAN match but no sensor packet: inspect redirect target, interface route, and sensor addressing.
- Sensor receives packets but no application response: inspect host redirects, listener/service health, and management-source exemptions.
- Application responds but reporting is missing: inspect submission/status separately; transport success does not verify ingestion.

Preserving source IPs matters because reporting, exemptions, and attribution depend on them. If all incoming connections appear to originate from a private router address, fix the NAT design before trusting the observations.

## 5. Keep host firewall ownership clear

Do **not** add the old UFW recipe on top of DShield. The installer manages packet logging, NAT redirection, and administrative exceptions. A second firewall manager can overwrite or conflict with that ruleset. Apply the external containment policy above and use only the selected revision's documented local customization mechanism for necessary host changes.

Privately inspect the active backend and listeners:

```bash
sudo ss -lntup
sudo iptables-save
# If this installation uses native nftables, inspect its active rules too:
sudo nft list ruleset
sudo /srv/dshield/status.sh
```

Run commands appropriate to the installed backend; an unavailable diagnostic command is not itself proof of a broken sensor. Review [the installer source](https://github.com/DShield-ISC/dshield/blob/main/bin/install.sh) and local generated rules to confirm original-port redirects, administrative allowlists, and default policy. Host listener ports need not be exposed directly by the upstream router.

Status/rules output can include account identifiers and topology. Do not paste it into the public post. Do not assume services named `dshield` or `nginx` exist; the status script and the installed service units are the diagnostic starting point.

## 6. Verify reachability, containment, and reporting

Before enabling WAN rules, test that the administrator can reconnect and the sensor cannot initiate new connections to trusted networks. Use a controlled listening TCP service as well as firewall logs; failed ping or a refused connection to a closed port does not prove filtering. Also verify that DNS, time, updates, and reporting still work.

After exposure, make a small, authorized test from a genuinely external network. Replace this reserved documentation address privately with your own endpoint:

```bash
# 198.51.100.20 is a documentation placeholder, not a live test target.
ssh -p 22 testuser@198.51.100.20
curl --max-time 10 -I http://198.51.100.20/
```

Never supply real credentials to the honeypot. Test only systems you control. Avoid sustained synthetic traffic that would distort submitted telemetry. Tests from management networks may bypass honeypot redirects/logging by design and are not equivalent to Internet tests.

- [ ] External SSH/HTTP hits reach the intended honeypot, not real management services.
- [ ] External TCP 12222 and other unintended services remain unreachable.
- [ ] Real external source addresses and original destination ports appear correctly in sensor logs.
- [ ] DNS/time exceptions work, while unauthorized sensor-to-internal TCP/UDP connections are blocked and logged.
- [ ] IPv6 and cloud metadata do not provide an untested alternative path.
- [ ] The status script is healthy, storage has headroom, and intended events appear in [ISC reports](https://isc.sans.edu/myreports.html) after submission.
- [ ] A reboot retains management access, isolation, redirects, and reporting.

`curl` reaching ISC proves connectivity only; it does not prove API authentication or successful report ingestion. Use the status/submission logs and portal to verify those separately.

## 7. Operate and recover

Monitor disk usage, reporting gaps, and unexpected outbound attempts. Follow the selected release's update procedure and rerun isolation/exposure tests after upgrades. Keep private configuration backups; rebuild a suspected compromised disposable sensor instead of restoring trust solely because a process restarted.

Wazuh or another log collector is optional. Allow only its required destination/ports, use a sensor-specific identity, and treat every sensor event as untrusted input. Do not grant the sensor dashboard/admin privileges or broad security-stack access. Ensure any extra agent is compatible with the sensor's resource budget and upstream deployment model.

### A repeatable validation record

Use a short table like this in your private notes after installation and each update:

| Test | Expected | Evidence |
|---|---|---|
| Admin -> real SSH | Success from approved source only | Listener plus successful key login |
| External -> TCP 22/80 | Honeypot response | Original source/port in sensor observation |
| External -> real SSH | No permitted connection | Edge policy and external test |
| Sensor -> approved DNS/time | Success | Query/time state and matching pass |
| Sensor -> trusted SSH/dashboard | Denied | Known-live destination and firewall deny |
| Reporting | Accepted events in ISC account | Submission status and portal time window |
| Reboot | Same policy and services return | Repeat above checks |

Use timestamps with timezone in private notes to correlate firewall, sensor, and portal observations. Do not fabricate sample "successful" outputs in the published article. Distinguish a check that has been performed from one that is still a checklist item.

### Reporting and maintenance troubleshooting

```bash
sudo /srv/dshield/status.sh
df -h
systemctl --failed --no-pager
sudo journalctl --since '30 minutes ago' --priority=warning --no-pager
```

These are diagnostics, not proof of reporting by themselves. Use the installed revision's status output to identify the actual reporting job and relevant log paths. Confirm time, DNS, TLS connectivity, account credentials, and egress policy. An HTTP success from ISC does not establish that the API accepted your sensor submission.

Before an update, record the working installer revision and back up private configuration. Follow that revision's update procedure, then compare management allowlists, redirects, egress policy, and listeners again. Updates may add services or change port handling; do not assume the upstream firewall should automatically expose every new listener.

If compromise is suspected, disable the edge forwards, contain the sensor, preserve only the evidence needed for your investigation, and rebuild from trusted media. Do not reconnect the sensor to a trusted VLAN to make collection easier. Rotate credentials that may have been exposed and revalidate before restoring exposure.

**Items requiring local confirmation:** selected DShield commit and OS, generated port redirects (especially HTTPS), permitted management sources, provider/NAT behavior, actual egress dependencies, and receipt of reports. Upstream architecture notes and current installer behavior can differ; this guide does not claim a runtime-verified build.
