---
layout: post
title: "WireGuard on OPNsense: Remote Access Behind an Upstream Router"
date: 2026-09-28
categories: [HomeLab, Security]
tags: [wireguard, opnsense, vpn, nat, routing, troubleshooting, firewall, homelab]
---

# WireGuard on OPNsense: Remote Access Behind an Upstream Router

## Scope and safety

This focused companion to the [OPNsense home lab](/posts/homelab-network-setup/) documents a reproducible way to restore remote-access VPN service after changing an ISP router or uplink. It is a **reference procedure**, not a claim that the author's current deployment has passed every test. The addresses and names are synthetic; never post peer private keys, preshared keys, live public endpoints, firewall exports, dynamic-DNS account tokens, or actual route tables.

This walkthrough covers **road-warrior access to selected private services**, not site-to-site VPN or an Internet full tunnel. The relevant upstream references are the [OPNsense WireGuard road-warrior guide](https://docs.opnsense.org/manual/how-tos/wireguard-client.html) and [WireGuard documentation](https://www.wireguard.com/quickstart/). GUI labels may change by release; check the installed version before changing a working system.

## 1. Write down the intended traffic path

```text
Remote laptop/phone -- Internet -- public ISP router
                                      |
                               UDP port forward
                                      |
                           OPNsense private WAN
                                      |
                            WireGuard instance
                                      |
                      allowed MGMT / security services
```

Use the following **example-only** plan. These ranges are deliberately different from operational home lab inventory.

| Component | Example |
|---|---|
| Upstream router's inside subnet | `192.0.2.0/24` **(diagram-only documentation range; do not assign it in a live LAN)** |
| OPNsense WAN | An address leased or reserved on the actual upstream LAN |
| WireGuard instance/tunnel | `10.77.200.1/24` |
| Remote phone peer | `10.77.200.2/32` |
| Management network | `10.77.90.0/24` |
| Security services | `10.77.100.0/24` |
| Example VPN hostname | `vpn.example.com` (not a working endpoint) |
| Example UDP listen port | `51820` |

Record the real WAN gateway, OPNsense WAN address, upstream NAT rule, hostname resolution and peer endpoints in a **private** change worksheet. If the ISP uses CGNAT, an ordinary router port forward cannot accept unsolicited inbound IPv4; obtain a usable public address or use an appropriate alternative architecture.

## 2. Establish the uplink before debugging WireGuard

1. Confirm a trusted LAN client can reach the Internet through OPNsense, and that OPNsense has the expected WAN address and default gateway.
2. On the upstream router, reserve the OPNsense WAN address if possible. Forward **UDP**, not TCP, on the chosen external port to the OPNsense WAN address and instance listen port. A consumer router's "DMZ host" setting is usually broad port forwarding **with NAT still enabled**, not bridge mode; prefer the narrow UDP forward.
3. On OPNsense, permit inbound UDP to **WAN address** on the WireGuard listening port. Do not expose the OPNsense administration UI on WAN.
4. Compare your publicly reachable address with the router's WAN address. If they differ, determine whether you are behind CGNAT or another upstream NAT before troubleshooting peer keys.
5. Test from **outside** the home network (cellular data with Wi-Fi off, for example). An internal test against the public hostname can fail solely because the router lacks NAT reflection/hairpin support.

Do not disable the upstream router's security controls merely to make the tunnel appear online. If an earlier setup used bridge mode and the replacement uses NAT, the inbound path, local WAN address, and possibly firewall rule destinations have changed.

## 3. Create or inspect the OPNsense instance and peer

Under **VPN → WireGuard → Instances**, inspect or create one enabled instance. Generate the server key pair locally in the GUI; set the listen port and unique tunnel address `10.77.200.1/24`. Do not configure the instance as `10.77.200.1/32`: the instance needs the tunnel subnet. Leave the instance DNS override blank unless the installed release's documentation requires otherwise.

Under **VPN → WireGuard → Peers**, register the remote device's **public** key. Give each peer a unique tunnel address and set its server-side Allowed IPs to `10.77.200.2/32` for this example. Associate the peer with the instance, apply changes and enable/restart WireGuard as appropriate. A peer entry does not create the remote device's private key.

For an explicitly configured split-tunnel client, the **illustrative** fields are:

```ini
# Illustration only: generate both devices' keys privately; never commit a real client .conf.
[Interface]
Address = 10.77.200.2/32
PrivateKey = <CLIENT_PRIVATE_KEY_NOT_FOR_PUBLICATION>
DNS = 10.77.100.10

[Peer]
PublicKey = <SERVER_PUBLIC_KEY_FROM_PRIVATE_CONFIGURATION>
Endpoint = vpn.example.com:51820
AllowedIPs = 10.77.90.0/24, 10.77.100.0/24
PersistentKeepalive = 25
```

The DNS address must be reachable inside `AllowedIPs`; the example includes its subnet. If clients need to resolve a private `home.arpa` namespace, the resolver must serve that namespace and accept queries from the VPN subnet. Persistent keepalive is useful when a mobile peer is behind NAT, but it is not a substitute for the server's inbound UDP path.

## 4. Permit only intended tunnel destinations

Assigning the WireGuard instance to an OPNsense interface can simplify interface-specific rules and subnet aliases. For a private split tunnel, Internet outbound NAT is **not** required just to access local routes. Ensure that rules exist on the assigned WireGuard interface (or the WireGuard group if using the unassigned design) to permit only the intended destination/port combinations.

| Incoming interface | Source | Destination / service | Action |
|---|---|---|---|
| WAN | Internet | WAN address, `51820/UDP` | Pass for handshake |
| WireGuard interface | `10.77.200.0/24` | Resolver `10.77.100.10`, `53/TCP+UDP` | Pass if VPN DNS is intended |
| WireGuard interface | Authorized peer(s) | Explicit admin hosts, approved management ports | Pass |
| WireGuard interface | VPN subnet | Everything else | Block/log |

Do not add a broad VPN-to-any pass rule for convenience. Return traffic for allowed, stateful connections is normally handled by the firewall state table. Review floating and interface-group rules, which can match before the per-interface rules. For remote access to the firewall itself, grant only the necessary management service to the specific authorized peer and prefer a non-WAN management interface.

## 5. Diagnose in layers, not by changing everything at once

| Observation | Next evidence to collect |
|---|---|
| No recent handshake | Verify external DNS, UDP forward, ISP/CGNAT, WAN rule, instance/peer key pairing; capture WAN UDP packets |
| WAN sees UDP, no handshake | Verify destination port, instance status, peer public key and any preshared-key agreement |
| Handshake exists, no internal access | Check client AllowedIPs, WireGuard ingress rules, destination host firewall, and return routes |
| IP works, private hostname fails | Check VPN DNS, AllowedIPs route to DNS, resolver ACL and domain records |
| Small packets work, websites/SSH stall | Investigate path MTU/MSS and asymmetric routing; make measured adjustments |
| Works at home, fails on cellular | Recheck public endpoint/forward/CGNAT and avoid relying on hairpin behavior |

For packet-path evidence, use OPNsense's packet capture on WAN and the WireGuard interface. A capture containing remote public addresses or private endpoints belongs in private case notes, not the blog. On a Linux client, `wg show` reports latest handshake and transfer counters; use the device's GUI on other platforms. A recent handshake proves key agreement and reachability, **not** permission to an internal service.

## 6. Record an offsite acceptance test

Run these from an authorized device on an external connection. Replace the synthetic targets privately.

```bash
# Example Linux client checks; a blocked ping alone does not prove VPN failure.
wg show
ip route get 10.77.100.10
nc -vz -w 3 10.77.100.10 22
# If DNS over the VPN is intended:
dig @10.77.100.10 example.home.arpa
```

Test **one approved** service and **one explicitly prohibited** service, then verify corresponding OPNsense live-log entries and the target host's firewall/logs. Confirm the public Internet path remains outside the tunnel for a split-tunnel peer. If the design includes IPv6, add equivalent routing, DNS and firewall validation; IPv4 rules cannot enforce an IPv6 policy.

## 7. Recovery and publication checklist

Back up OPNsense configuration securely before editing, retain console/local administrative access, and revert one change at a time if reachability breaks. Rotate any WireGuard private key or preshared key ever included in a screenshot, post, ticket, or repository history; deleting a file from the latest commit is not adequate remediation.

**Related:** [Home lab architecture](/posts/homelab-network-setup/) · [Firewall rule validation](/posts/opnsense-vlan-firewall-validation/) · [AdGuard DNS enforcement](/posts/adguard-dns-enforcement-standalone-setup/).
