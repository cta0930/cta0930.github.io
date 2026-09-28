---
layout: post
title: "OPNsense VLAN Firewall Validation: Proving Segmentation Works"
date: 2026-09-28
categories: [HomeLab, Security]
tags: [opnsense, vlan, firewall, segmentation, testing, dns, logging, homelab]
---

# OPNsense VLAN Firewall Validation: Proving Segmentation Works

## Why validate instead of trusting the rules screen?

This procedure extends the [home lab architecture guide](/posts/homelab-network-setup/) with repeatable **positive and negative** tests for VLAN isolation. An IP address on the expected subnet, a green interface, or a successful Internet speed test does not prove a VLAN's security boundary. This article is a sanitized reference test plan; no claim is made that every test was executed on a live deployment during publication.

All `10.77.x.x` addresses, VLAN IDs, test names, and hosts below are synthetic. Do not publish your actual management IP, switch configuration export, internal DNS zones, full firewall ruleset, MAC/serial numbers, personal device names, or timestamped logs identifying real users. The official [OPNsense firewall rules documentation](https://docs.opnsense.org/manual/firewall.html) explains rule evaluation, state handling, and differences between rules implementations.

## 1. Define expected paths before touching the firewall

| Example source | Destination | Expected result | Reason |
|---|---|---|---|
| MGMT `10.77.90.10` | Admin port on security server `10.77.100.10` | Allow | Named administrator exception |
| GUEST `10.77.40.10` | MGMT `10.77.90.10` | Deny | Guest isolation |
| GUEST `10.77.40.10` | DNS `10.77.100.10:53` | Allow | Explicit resolver exception |
| GUEST `10.77.40.10` | Security server `10.77.100.10:22` | Deny | DNS access must not imply SSH access |
| HONEYPOT `10.77.110.10` | MGMT or SECSTACK | Deny | Untrusted sensor cannot initiate lateral access |
| VPN peer `10.77.200.2` | Approved admin service | Allow if authorized | Narrow remote-access exception |

Keep the actual source/target matrix in a private change ticket. For each path record interface, source/destination IP, protocol, port, expected result, tester, and a result timestamp. Positive tests catch overly broad blocks; negative tests catch accidental access.

## 2. Confirm the layer-2 boundary first

1. Verify that the firewall's trunk and switch access-port **tagging, untagged membership, and PVIDs** match the design. Use a temporary test port and maintain an independent management path during changes.
2. Verify each test host gets a lease from its intended DHCP scope and uses the corresponding OPNsense gateway. Inspect the host's actual interface, subnet, gateway and DNS configuration.
3. Check that the switch is not routing between VLANs. A connection entirely within one VLAN normally never crosses OPNsense; host firewalls and AP client isolation handle same-zone controls.
4. For wireless SSIDs, validate the AP's tag/native-VLAN behavior rather than assuming the SSID name implies isolation.
5. Check IPv6 RA/DHCPv6 and IPv6 firewall policy separately. A network with IPv4 isolation but unrestricted IPv6 is not fully segmented.

An endpoint with a manually assigned IP can appear to belong to a subnet while physically sitting on the wrong VLAN. Treat a DHCP lease as supporting evidence, not as definitive proof of switch tagging.

## 3. Build policy on the interface where traffic enters

A typical OPNsense filter rule matches packets **inbound on the originating interface**. Create specific service exceptions, then explicit logged blocks for destinations that must remain unreachable, and only then a suitably scoped Internet egress rule. Do not insert a universal "allow any" above isolation rules.

```text
GUEST ingress (illustrative ordering)
  PASS  GUEST net -> approved DNS address  TCP/UDP 53
  BLOCK GUEST net -> protected private subnets  any  [log]
  PASS  GUEST net -> intended Internet destinations  permitted protocols
  implicit deny otherwise
```

A broad pass may also allow undesirable RFC1918, VPN and non-RFC1918 internal ranges unless they are covered by explicit blocks. Build an alias from **your private, complete set of protected networks**, not from the example table alone; include IPv6 policy where enabled. Restrict management access to approved sources and ports. Use aliases for maintainability, but inspect their resolved members and any automatic rules after applying changes.

OPNsense can evaluate floating rules and interface-group rules before ordinary interface rules. Quick rules generally stop evaluation on the first matching rule; non-quick rules have different semantics. Existing firewall **states** can persist after a rule change, so close the client connection and inspect or selectively clear the matching state during a controlled test before declaring the new rule ineffective. Clearing the entire state table disrupts unrelated traffic.

## 4. Validate reachability and denial with safe tests

Use an authorized client physically or logically located in each source zone. Substitute your private endpoints; the examples here are intentionally **not** a scan of public systems.

```bash
# Run on a test endpoint in the intended source VLAN.
ip -brief address
ip route

# Test a port expected to be allowed, then one expected to be denied.
nc -vz -w 3 10.77.100.10 53
nc -vz -w 3 10.77.100.10 22

# Confirm the approved DNS server actually handles queries.
dig @10.77.100.10 example.org
```

A TCP timeout, `connection refused`, failed ping, or unsuccessful `nc` connection can each have a different cause. A refusal may come from the destination host instead of OPNsense; an ICMP timeout may just mean ICMP is blocked. Correlate firewall live logs, rule counters, packet capture, and destination service logs. A positive connection to DNS port 53 does not by itself prove that a correct DNS answer was returned.

For DNS enforcement, read the [dedicated AdGuard walkthrough](/posts/adguard-dns-enforcement-standalone-setup/). Port-53 restrictions cannot, by themselves, prevent applications using DNS-over-HTTPS or tunneling. Keep that limitation explicit when reporting the test result.

## 5. Separate firewall policy from host policy and routing

For a permitted management connection, check the **full** path: correct client route, origin VLAN, matching pass rule, destination subnet route, destination host firewall, service listening address, and return path. Docker-published ports on a Linux server require additional care: do not assume UFW input rules alone control all Docker bridge traffic. Bind administrative services to the intended address or loopback and test from a prohibited zone.

For denied connections, check that packets reach the expected ingress interface. If the firewall sees no packets, inspect switch membership, client routes, Wi-Fi isolation, the upstream router or VPN AllowedIPs. If the firewall permits a packet but the connection still fails, inspect the server rather than immediately adding a broader firewall rule.

## 6. Use a repeatable results sheet

| Test ID | Origin | Target/service | Expected | Observed | Evidence (private) |
|---|---|---|---|---|---|
| SEG-01 | MGMT | Server SSH | Allow | Not executed | Private log/capture reference |
| SEG-02 | GUEST | Server SSH | Deny | Not executed | Private log/capture reference |
| SEG-03 | GUEST | Approved DNS | Allow | Not executed | Query and firewall log reference |
| SEG-04 | HONEYPOT | MGMT | Deny | Not executed | Private firewall log reference |
| SEG-05 | VPN peer | Non-approved host | Deny | Not executed | Private firewall log reference |

The rows above are a **template**, not fabricated test results. Repeat after ISP/router changes, VLAN reassignments, firewall upgrades, new VPN peers, DNS changes, and IPS deployment. Maintain rollback access; only publish aggregate outcomes after scrubbing logs and screenshots.

**Related:** [WireGuard remote access](/posts/wireguard-opnsense-remote-access-troubleshooting/) · [DShield containment](/posts/dshield-honeypot/) · [Suricata rollout](/posts/opnsense-suricata-ids-ips-validation/).
