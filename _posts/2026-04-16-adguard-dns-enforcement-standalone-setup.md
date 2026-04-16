---
layout: post
title: "AdGuard with Docker: Standalone Setup and DNS Enforcement Validation"
date: 2026-04-16
categories: [HomeLab, Security]
tags: [adguard, dns, docker, opnsense, dns-filtering, doh, dot, homelab, network-security]
---

# AdGuard with Docker: Standalone Setup and DNS Enforcement Validation

## Overview

This standalone guide covers deploying AdGuard Home with Docker and proving DNS enforcement works end-to-end.

This write-up focuses on:

- AdGuard Docker deployment
- upstream DNS over HTTPS configuration
- optional OPNsense Unbound as upstream and fallback behavior
- DHCP and client DNS assignment strategy
- OPNsense firewall DNS enforcement rules
- validation tests to confirm DNS bypass is blocked
- troubleshooting when clients still use external DNS

---

## Architecture Goals

AdGuard is most useful when it becomes the single approved resolver for your network.

Target flow:

1. Clients get DNS server from DHCP (AdGuard IP)
2. Clients send DNS only to AdGuard
3. AdGuard forwards upstream using controlled resolvers (DoH/DoT)
4. Firewall blocks all direct client DNS attempts to the internet

If any client can query public resolvers directly, filtering and visibility are incomplete.

---

## Prerequisites

- Docker host (Ubuntu/Debian recommended)
- Static IP for AdGuard host (example: `10.10.100.10`)
- OPNsense already routing VLANs (if using this guide with the main homelab)
- Admin access to DHCP scopes and firewall rules

Ports used:

| Port | Protocol | Use |
|---|---|---|
| 53 | TCP/UDP | DNS service |
| 80 | TCP | Web UI (optional HTTP redirect) |
| 443 | TCP | Web UI HTTPS |
| 3000 | TCP | Initial setup UI (first-run wizard) |

---

## Step 1: Deploy AdGuard with Docker

Create folders:

```bash
sudo mkdir -p /opt/adguard/data/{work,conf}
sudo chown -R $USER:$USER /opt/adguard
```

Create compose file:

```bash
nano /opt/adguard/docker-compose.yml
```

Use:

```yaml
services:
  adguard:
    image: adguard/adguardhome:latest
    container_name: adguardhome
    restart: unless-stopped
    network_mode: host
    volumes:
      - ./data/work:/opt/adguardhome/work
      - ./data/conf:/opt/adguardhome/conf
```

Why `network_mode: host`:

- DNS works cleanly on port 53
- client source IP visibility remains accurate
- avoids Docker bridge NAT quirks for DNS logging

Start container:

```bash
cd /opt/adguard
docker compose up -d
docker compose ps
```

First-run UI:

- `http://<adguard-ip>:3000`

Complete setup wizard and set strong admin credentials.

---

## Step 2: Configure Upstream DNS and Filtering

In AdGuard UI:

1. Settings -> DNS settings
2. Upstream DNS servers:

```text
https://dns.quad9.net/dns-query
https://dns.cloudflare.com/dns-query
```

3. Bootstrap DNS:

```text
9.9.9.9
1.1.1.1
```

4. Query mode: Parallel requests

Blocklists (start with 2-4, then tune):

- AdGuard DNS filter
- OISD
- URLhaus
- Hagezi Pro or similar curated list

Do not enable every list immediately. Too many overlapping lists increase false positives.

### Optional: Use OPNsense Unbound as Upstream with Fallback

If you run Unbound on OPNsense, you can use it as AdGuard's local recursive resolver and optionally keep DoH providers as fallback.

Recommended patterns:

1. Privacy-first recursive mode:
- AdGuard upstream: OPNsense Unbound only (for example `10.10.100.1`)
- Behavior: if Unbound is down, DNS fails (expected)

2. Resilience mode (recommended for most labs):
- AdGuard upstream order:
  - `10.10.100.1`
  - `https://dns.quad9.net/dns-query`
  - `https://dns.cloudflare.com/dns-query`
- Behavior: AdGuard prefers local Unbound and fails over to DoH if Unbound is unavailable

OPNsense Unbound settings to support this cleanly:

1. Services -> Unbound DNS -> General
2. Enable Unbound DNS
3. Network interfaces: include only the interface where AdGuard can reach OPNsense (commonly SECURITY_STACK) and localhost
4. Access lists: allow only trusted source(s), at minimum AdGuard host IP/subnet
5. Save and apply

Important: do not hand out OPNsense/Unbound directly in DHCP if your policy is "all clients must use AdGuard". Only AdGuard should query Unbound in this model.

Validation for Unbound fallback behavior:

1. Confirm normal resolution while Unbound is running:

```bash
nslookup example.com 10.10.100.10
```

2. Temporarily stop Unbound on OPNsense:

- Services -> Unbound DNS -> Disable (or stop service)

3. Query again through AdGuard:

```bash
nslookup example.com 10.10.100.10
```

Expected results:

- Privacy-first mode: query fails (no fallback configured)
- Resilience mode: query still succeeds via DoH fallback

4. Re-enable Unbound and confirm AdGuard returns to local upstream path.

---

## Step 3: Assign AdGuard via DHCP

For each DHCP scope (OPNsense Services -> DHCPv4 -> Interface):

1. Set DNS server to AdGuard IP (`10.10.100.10`)
2. Save and apply
3. Renew lease on test client

Client check:

```bash
# Linux
resolvectl status | grep "DNS Servers" -A2

# or
cat /etc/resolv.conf
```

Windows check:

```powershell
ipconfig /all
```

Expected: DNS server is AdGuard IP.

---

## Step 4: Enforce DNS in OPNsense Firewall

This is the key control. Without enforcement, clients can bypass AdGuard.

Create alias first:

- Firewall -> Aliases -> Add
  - Name: `DNS_SERVER`
  - Type: Host
  - Value: `10.10.100.10`

On each internal VLAN/interface, add rules in this order:

1. Pass VLAN net -> `DNS_SERVER` TCP/UDP 53
2. Block VLAN net -> any TCP/UDP 53
3. Block VLAN net -> any TCP 853 (DoT)

Optional stricter controls:

- Block known public DoH endpoints using aliases (partial control)
- Use Zenarmor/application policy to reduce DoH bypass over 443

Important: first-match wins. Place pass-to-AdGuard above block rules.

---

## Step 5: Validation Checklist (Must Pass)

Run these from a client on each VLAN.

### Test A: Normal resolution through AdGuard

```bash
nslookup example.com 10.10.100.10
```

Expected: success.

### Test B: Direct bypass to public resolver should fail

```bash
nslookup example.com 8.8.8.8
nslookup example.com 1.1.1.1
```

Expected: timeout or blocked response.

### Test C: DoT bypass should fail

```bash
# test TCP 853 connectivity
nc -vz 1.1.1.1 853
```

Expected: blocked.

### Test D: Query appears in AdGuard log

In AdGuard -> Query log, confirm client IP and query entries are visible.

If using Unbound upstream, also verify upstream path behavior in AdGuard query details (local Unbound vs fallback provider) during normal and failover tests.

### Test E: Firewall logs show blocked bypass attempts

In OPNsense firewall logs, filter by client IP and look for blocked 53/853 attempts.

If all tests pass, DNS enforcement is working correctly.

---

## Step 6: Recommended Hardening

1. Restrict AdGuard admin UI access to management subnet only
2. Enable HTTPS for web UI
3. Export AdGuard config backup after initial stable setup
4. Monitor top blocked domains and adjust allowlist deliberately
5. Keep host OS and container image updated

UFW example on AdGuard host:

```bash
sudo ufw allow from 10.10.99.0/24 to any port 443 proto tcp
sudo ufw allow from 10.10.0.0/16 to any port 53 proto tcp
sudo ufw allow from 10.10.0.0/16 to any port 53 proto udp
sudo ufw default deny incoming
sudo ufw enable
```

---

## Step 7: Troubleshooting

1. Clients still using old DNS
- Renew DHCP lease
- Reboot client network stack
- Check static DNS hardcoded on endpoint

2. Queries work to 8.8.8.8 despite block rules
- Rule order incorrect on interface
- Wrong interface selected
- Floating rule overriding expected behavior

3. AdGuard query log missing client IPs
- Verify `network_mode: host`
- Avoid NATing DNS through extra middleboxes where possible

4. Some apps still resolve despite blocks
- App using DoH over 443
- Add app policy controls (Zenarmor/endpoint policy)

5. DNS behavior changes when Unbound service restarts
- Confirm your chosen mode (privacy-first vs resilience fallback)
- In resilience mode, temporary upstream switch to DoH is expected while Unbound is unavailable
- In privacy-first mode, temporary DNS outage is expected if Unbound is the only upstream

6. Clients resolve directly through OPNsense instead of AdGuard
- Check DHCP scopes are handing out AdGuard IP only
- Ensure interface firewall rules allow 53 only to AdGuard alias and block other 53/853 destinations
- Ensure OPNsense Unbound is not exposed broadly to client VLANs unless intentionally designed

---

## Integration with Main Homelab Guide

If you are using the main OPNsense homelab stack:

- keep AdGuard on Security Stack network (`10.10.100.0/24`)
- enforce DNS on each VLAN/interface as described
- validate from all zones including WireGuard clients

For WireGuard full-tunnel clients, ensure WG profile uses:

```ini
DNS = 10.10.100.10
```

Without this, remote clients may bypass local policy and lose consistent filtering.

---

## Key Takeaways

- AdGuard deployment is quick; DNS enforcement is where security value is created.
- DHCP assignment alone is not enough; firewall policy must block alternate resolvers.
- If using Unbound with AdGuard, decide explicitly between privacy-first (no fallback) and resilience (DoH fallback) behavior.
- Validation testing per VLAN is mandatory to prove bypass is actually blocked.
- Keep notification and logging pipelines (Wazuh/Slack/email) tuned so DNS anomalies are actionable.

---

**Disclaimer:** This guide is for educational and lab use. Ensure DNS filtering/enforcement policies comply with organizational and legal requirements in your environment.
