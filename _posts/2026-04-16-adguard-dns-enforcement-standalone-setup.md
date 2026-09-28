---
layout: post
title: "AdGuard with Docker: Standalone Setup and DNS Enforcement Validation"
date: 2026-04-16
categories: [HomeLab, Security]
tags: [adguard, dns, docker, opnsense, dns-filtering, doh, dot, homelab, network-security]
---

# AdGuard with Docker: Standalone Setup and DNS Enforcement Validation

## Scope and example conventions

This guide deploys AdGuard Home on a Linux Docker host and validates a specific DNS access policy. It complements the [OPNsense homelab guide](/posts/homelab-network-setup/). Documentation was reviewed on 2026-09-28; no live resolver or firewall was tested.

All internal addresses and names are synthetic: AdGuard `10.77.100.10`, optional OPNsense Unbound `10.77.100.1`, and administrator `10.77.90.10`. Substitute your private plan consistently. Public resolver addresses below are intentional test/upstream services, not operational identifiers. Do not publish real client names, query logs, configuration exports, TLS keys, DNS-provider credentials, or screenshots with account/browser metadata.

The intended path is client -> AdGuard -> chosen upstream. DHCP advertises the resolver; firewall rules constrain conventional DNS; endpoint policy is needed to control applications using encrypted DNS or tunnels. Passing port-53 tests does not prove that every possible DNS bypass is blocked.

## 1. Prepare the host and reserve ports

Use a supported Linux distribution and [Docker Engine installation](https://docs.docker.com/engine/install/ubuntu/), with the Compose plugin. This example uses Linux host networking; Docker Desktop networking differs. Assign a stable host address, keep console/SSH recovery, and verify time synchronization.

| Listener | Exposure |
|---|---|
| TCP/UDP 53 | Approved DNS clients only |
| TCP 3000 | Administrator only, including setup |
| TCP 443 | Reserved for Wazuh on the combined homelab server |
| TCP 8080 | Reserved for OpenCTI on the combined server |

AdGuard can serve additional encrypted-DNS protocols, but they are not enabled or exposed by this recipe. Do not forward its resolver or administration ports from WAN.

Check existing listeners before starting:

```bash
sudo ss -lntup
```

Inspect port 53 conflicts, especially `systemd-resolved`. Binding to a specific service address may avoid a loopback-only conflict; wildcard listeners may not. If changing the host's stub resolver, follow [AdGuard's Docker instructions](https://adguard-dns.io/kb/adguard-home/docker/) and preserve a working `/etc/resolv.conf`. Do not create a bootstrap loop in which AdGuard needs itself to resolve its upstream hostname.

## 2. Deploy a pinned container

Create a directory owned by the deployment administrator:

```bash
sudo mkdir -p /opt/adguard/data/work /opt/adguard/data/conf
sudo chown "$USER:$(id -gn)" /opt/adguard
cd /opt/adguard
umask 077
```

Create `.env` and set `ADGUARD_VERSION` to a reviewed release tag from the official image, for example using an editor. Do not leave it blank or use an unreviewed moving tag. Store the chosen tag/digest and upgrade date privately.

Create `compose.yaml`:

```yaml
services:
  adguard:
    image: "adguard/adguardhome:${ADGUARD_VERSION:?Set a reviewed release tag}"
    restart: unless-stopped
    network_mode: host
    volumes:
      - ./data/work:/opt/adguardhome/work
      - ./data/conf:/opt/adguardhome/conf
```

There is no `ports` block with host networking. The process shares the host's network namespace, so configure actual listen addresses and host firewall rules. Host networking is one choice; it does not repair source addresses already translated by an upstream router.

Before startup, allow admin TCP 3000 and intended clients' TCP/UDP 53 at the host and on their **source ingress** interfaces in OPNsense. Preserve SSH from the admin host before enabling any host default-deny policy. Restrict other service ports separately. If using Docker bridge publishing instead, ordinary UFW input rules may be bypassed; use [Docker-aware filtering](https://docs.docker.com/engine/network/packet-filtering-firewalls/) and test it.

```bash
docker compose config --quiet
docker compose pull
docker compose up -d
docker compose ps
docker compose logs --tail=100 adguard
```

From the approved administrator, open `http://10.77.100.10:3000` for the wizard. Keep the UI on port 3000, bind DNS to the intended service address, and set unique credentials. Use an SSH tunnel or properly configured HTTPS for administration across untrusted links; do not move the UI to Wazuh's port 443. Limit resolver access to the approved client networks and keep the setup port private from the first start.

## 3. Choose upstream behavior explicitly

Choose one design and test it. The [AdGuard configuration reference](https://adguard-dns.io/kb/adguard-home/configuration/) distinguishes normal upstreams, bootstrap resolvers, and fallback resolvers.

| Design | Normal upstream field | Fallback field |
|---|---|---|
| Local recursive resolver only | `10.77.100.1` | Empty |
| Local resolver with public fallback | `10.77.100.1` | Chosen DoH endpoint |
| Public encrypted upstream | Chosen DoH endpoint | Optional separately chosen service |

A DoH example is `https://dns.quad9.net/dns-query`; configure a reachable bootstrap resolver where required. Bootstrap DNS resolves upstream hostnames; it is not the fallback query path. Evaluate provider policy before selecting a service.

**List order is not failover priority.** Load balancing selects among normal upstreams; parallel mode queries them together. Use the dedicated fallback setting for unavailable upstreams. A valid negative answer is not the same as an upstream being unavailable. Public fallback changes which provider receives queries and does not make local-only records available during an outage.

For Unbound, listen on the intended SECSTACK address, permit AdGuard's host address in its access controls, and allow AdGuard-to-Unbound TCP/UDP 53 on SECSTACK ingress. Do not forward Unbound back to AdGuard. Recursive Unbound also needs its own outbound DNS access; a forwarding configuration has different upstream requirements. See [OPNsense Unbound](https://docs.opnsense.org/manual/unbound.html).

Client DNS blocks must exempt AdGuard's intended upstream/bootstrap traffic before any catch-all denial. Restrict direct client access to Unbound so that it cannot bypass AdGuard filtering. Treat local-name and private reverse-DNS forwarding as separate configuration and test that private names do not leak to public providers.

## 4. Set filtering and client DNS

Begin with a small maintained filter set, then test applications before adding more. Record why an allowlist entry exists. Query logs contain browsing and device information: choose a limited retention period, restrict access, and sanitize exported samples.

On the installed OPNsense release's DHCP service, advertise only approved AdGuard addresses. Do not advertise a public resolver as a "secondary" if clients must be filtered; clients may use it at any time. For resilience, deploy another approved filtering resolver instead. Keep the working resolver until AdGuard has passed a client test, then renew leases.

```bash
# Linux; a local stub address may appear in resolv.conf.
resolvectl status
```

```powershell
# Windows
ipconfig /all
```

Static clients, browser secure-DNS settings, and VPN DNS need separate checks. For an approved WireGuard peer, `DNS = 10.77.100.10` also requires a route and a tunnel-ingress DNS pass rule. The profile setting alone is not enforcement.

## 5. Apply ordered DNS rules

Create host alias `DNS_SERVER = 10.77.100.10`. On each client ingress interface, place these rules before general Internet pass rules and before blocks that would otherwise deny the resolver:

| Order | Action | Destination |
|---|---|---|
| 1 | Pass TCP/UDP | DNS_SERVER port 53 |
| 2 | Block/log TCP/UDP | Any other port 53 |
| 3 | Block/log TCP/UDP | Any port 853 |

Keep the homelab's other segmentation rules. Review floating/group rules, existing states, and any DNS redirect NAT that changes these tests. This guide uses **blocking**, not transparent DNS redirection. Routed rules do not constrain same-subnet traffic; use endpoint/host controls where needed.

Port 853 blocks typical DoT and DoQ. DoH can use HTTPS TCP/UDP 443, and VPN/proxy traffic can carry DNS too. Known-provider aliases and application filtering offer partial coverage, not a universal guarantee. Managed browser/OS settings may be necessary.

These examples are IPv4-only. Either deploy equivalent IPv6 DNS advertisement/filtering or deliberately disable/block IPv6 along the relevant paths. DHCPv4 changes do not override DNS learned through IPv6 router advertisements or DHCPv6.

## 6. Validate from every zone

Use a client on each VLAN and the VPN. If available, `dig` tests both UDP and TCP; `nslookup` is useful for basic resolution. Record results privately.

```bash
# Approved resolver: both should succeed.
dig @10.77.100.10 example.com A +time=2 +tries=1
dig @10.77.100.10 example.com A +tcp +time=2 +tries=1

# Direct conventional DNS bypass: both should fail under this policy.
dig @8.8.8.8 example.com A +time=2 +tries=1
dig @8.8.8.8 example.com A +tcp +time=2 +tries=1

# TCP connectivity check only, not a complete encrypted-DNS test.
nc -vz -w 3 1.1.1.1 853
```

Verify the allowed query in AdGuard and denied attempts in firewall logs. A timeout without matching evidence can also mean an unrelated outage. A successful DNS response may be cached; it does not by itself prove upstream connectivity or failover.

For fallback testing, arrange a maintenance window and restore access immediately afterward. Temporarily make only the normal upstream unavailable, use a query not already cached (or clear caches in the test environment), and inspect the actual upstream used. Check that local-only mode fails for uncached public queries, fallback mode uses its configured fallback, and the normal path resumes after recovery. Test internal names separately; they should not be expected to resolve publicly.

- [ ] Admin UI is reachable only by approved administrators.
- [ ] WAN cannot reach DNS or the setup/admin UI.
- [ ] Both TCP and UDP DNS behave as intended on every client network.
- [ ] DoH, DoQ, IPv6, and VPN behavior match the documented limits.
- [ ] The resolver's bootstrap/upstream access works after reboot.
- [ ] Source addresses remain useful for the intended client policy.
- [ ] Fallback tests account for caches and include upstream evidence.

## 7. Back up, update, and troubleshoot

Protect the Compose/environment files and both persistent directories. Stop AdGuard briefly for a consistent file backup, secure the backup because it may contain keys, credentials, and query history, then restart and test DNS. For a new release, review notes, change the pinned version, pull/recreate the container, and verify client resolution. Retain the previous version and matching backup for recovery; do not assume configuration migrations are reversible.

| Symptom | Check |
|---|---|
| Container cannot bind DNS | Existing port-53 listeners, bind address, host resolver configuration |
| Clients use old DNS | Lease renewal, static/VPN settings, IPv6 advertisements, browser DoH |
| Public port-53 query succeeds | Earlier pass/floating rule, wrong ingress interface, existing states, redirect NAT |
| All clients appear as one host | Forwarding resolver or source NAT; host networking alone cannot reverse it |
| Local resolver fails but fallback seems unused | Fallback field, bootstrap/egress access, valid negative answers, caches |
| DNS breaks during server maintenance | Single point of failure; plan a second approved resolver |

**Unverified locally:** installed AdGuard/OPNsense versions, host listener conflicts, actual fallback behavior, IPv6 policy, and client source visibility. Complete the tests before describing this as a validated deployment.
