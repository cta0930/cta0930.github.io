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

## 4. Preserve the installer's honeypot redirection

The previous recipe's `22 -> 1222`, `80 -> 8080`, and `443 -> 8443` mappings were not a verified DShield port model. DShield uses host-side redirection; internal listener ports must not be inferred from another honeypot tutorial.

For a deliberately limited initial OPNsense exposure, forward the original TCP destination ports unchanged:

| WAN destination | Sensor destination | Purpose |
|---|---|---|
| WAN address TCP 22 | 10.77.110.10 TCP 22 | SSH honeypot via host redirect |
| WAN address TCP 80 | 10.77.110.10 TCP 80 | HTTP honeypot via host redirect |

Create matching associated WAN filter rules in the destination-NAT/port-forward screen. Preserve the external source address: do not source-NAT arriving Internet clients to a trusted internal address. Keep NAT reflection disabled for this testing workflow and test from outside. Confirm that the chosen WAN ports are not used by firewall administration or another forward.

Inspect the installed redirect lists before optionally exposing Telnet, additional web ports, or HTTPS. Forward only ports supported and tested in that installed revision, preserving their original destination ports. Do not expose a guessed HTTPS listener. Never forward real administrative SSH TCP 12222 from the home WAN.

This selective exposure intentionally gathers less telemetry than upstream's broader sensor deployment model. It is not a full-port DShield collector. The [upstream architecture](https://github.com/DShield-ISC/dshield/blob/main/docs/dshield-architecture/Architecture.md) explains host redirection, but may lag the current installer; generated rules and verified listeners decide the actual port set.

For a cloud VM, allow the same chosen original ports in the provider's firewall and leave redirection to the sensor. Private/VPN administration or provider console access should remain separate. On another NAT router, use the same original-port forwarding principle. Directly routed public addressing requires inbound filtering, not an extra OPNsense NAT rule.

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

**Items requiring local confirmation:** selected DShield commit and OS, generated port redirects (especially HTTPS), permitted management sources, provider/NAT behavior, actual egress dependencies, and receipt of reports. Upstream architecture notes and current installer behavior can differ; this guide does not claim a runtime-verified build.
