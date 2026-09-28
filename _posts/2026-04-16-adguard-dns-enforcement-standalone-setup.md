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

### Preflight on the actual server

Run these checks on the intended Linux host, not the administrator's workstation:

```bash
ip -br address
ip route
resolvectl status
docker version
docker compose version
sudo ss -lntupn | grep -E ':(53|3000|443|8080)\b'
```

Use `sudo docker` if your account has not been granted Docker access. The [homelab server preparation](/posts/homelab-network-setup/#5-prepare-the-ubuntu-server) includes the Ubuntu Docker installation commands. `docker version` should report both client and server; a socket-permission error is different from a stopped daemon.

Check that the host actually owns `10.77.100.10` before trying to bind AdGuard to it. If port 53 is occupied, identify the process and its exact listen address. Do not stop every DNS-related service simply because it appears in the output. A loopback stub can coexist with a resolver bound to a different specific address, whereas a wildcard bind may conflict.

Plan a temporary host resolver that remains usable while AdGuard is stopped. If the server's own DNS points at a container that is down, image downloads and upgrades can fail before the container restarts. Keep any temporary exception narrow and remove it when the final resolver design works.

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

### Populate the version file and inspect the deployment

After creating `/opt/adguard`, save the reviewed release tag without putting a made-up version into the Compose file:

```bash
cd /opt/adguard
umask 077
read -r -p "Reviewed AdGuard Home image tag: " ADGUARD_VERSION
printf 'ADGUARD_VERSION=%s\n' "${ADGUARD_VERSION:?A release tag is required}" > .env
chmod 600 .env
docker compose config --quiet
docker compose config --images
```

The last command shows the resolved image reference without printing the full configuration. Compare it with the release you chose. For a digest, replace the whole `image` value with the official repository followed by `@sha256:` and the verified digest; a digest cannot simply be substituted after the tag colon.

### Restrict the first-run UI on a dedicated AdGuard host

For a fresh **dedicated** host using this host-network recipe, the following is an example UFW policy. Adapt the client list and administration source first. On a shared server, integrate with its existing rules rather than treating this as a complete replacement for every service.

```bash
# Preserve administrator SSH before enabling the firewall.
sudo ufw allow from 10.77.90.10 to any port 22 proto tcp
sudo ufw allow from 10.77.90.10 to any port 3000 proto tcp

# Permit only the example client networks that should use this resolver.
for CLIENT_NET in 10.77.10.0/24 10.77.20.0/24 10.77.30.0/24 10.77.40.0/24 10.77.50.0/24 10.77.90.0/24 10.77.100.0/24 10.77.110.0/24 10.77.200.0/24; do
  sudo ufw allow from "$CLIENT_NET" to any port 53 proto udp
  sudo ufw allow from "$CLIENT_NET" to any port 53 proto tcp
done
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw enable
sudo ufw status numbered
```

The loop uses the same synthetic plan as the homelab guide. Remove zones not present in your build. This example does not constrain host egress; the resolver's upstream/update permissions still belong in the SECSTACK policy. Review existing UFW rules because an older broad allow may remain. This UFW example applies to host-network listeners, not a promise that UFW protects Docker bridge publishing.

### Walk through the setup wizard

1. Start the container only after the host and routed management rules are in place. From the approved admin host, open the setup UI on port 3000.
2. Choose the intended web-interface listen address and keep port 3000. Do not accept a default port that is already used by another service.
3. Choose the service address for DNS and port 53. Inspect any port-conflict warning instead of repeatedly restarting.
4. Create a unique admin username/password locally and finish the wizard. Log out and back in to confirm the new credentials.
5. Restrict permitted DNS clients to the intended networks if using AdGuard's application-level access controls. Keep network firewall restrictions as well.
6. Make one direct DNS query from a permitted client before changing DHCP for everyone.

For administration over an SSH tunnel to the bound service address:

```bash
ssh -N -L 13000:10.77.100.10:3000 labadmin@10.77.100.10
```

Browse to `http://127.0.0.1:13000` on the administrator workstation. Keep the terminal running. If the UI instead listens only on host loopback, use `127.0.0.1:3000` as the tunnel's remote destination. Do not widen the UI firewall rule to solve a mismatched listen address.

**Expected checkpoint:** the container remains up, the private admin UI works, and one permitted client receives a DNS answer. DHCP changes and bypass blocks come after this checkpoint.

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

### Concrete local-Unbound plus fallback example

In the DNS settings UI, set the normal upstream to `10.77.100.1`, a chosen public DoH resolver in the separate fallback field, and explicit bootstrap addresses for hostname resolution. Save and use the UI's upstream test, then verify from a real client.

The following is only the relevant `dns` portion of `AdGuardHome.yaml`, not a complete configuration. Prefer the UI; if editing the file directly, stop AdGuard first, retain the other generated settings, and use the schema for your installed release:

```yaml
dns:
  upstream_dns:
    - 10.77.100.1
  fallback_dns:
    - https://dns.quad9.net/dns-query
  bootstrap_dns:
    - 9.9.9.9
  upstream_mode: load_balance
```

This example deliberately has only one normal upstream, so normal operation does not race Unbound against a public service. The bootstrap resolver's plaintext DNS permission is a specific resolver-host exception, not a client bypass permission. Confirm the fallback service is reachable under the resolver's egress policy.

### Set up the Unbound side

1. Enable Unbound on OPNsense and select the interface/address reachable from AdGuard plus loopback where required by the firewall's own resolution design.
2. Add an access-control entry for the AdGuard host, not the entire collection of untrusted client zones.
3. Permit that host to the selected firewall resolver address on TCP/UDP 53 before the SECSTACK-to-firewall deny.
4. Verify that Unbound's forwarding mode, if used, does not point back to AdGuard. For recursive mode, permit the firewall's necessary DNS traffic to authoritative servers.
5. Query Unbound directly from the AdGuard host, then query AdGuard from a client. This distinguishes upstream failure from the client-facing service.

```bash
# On the AdGuard host:
dig @10.77.100.1 example.com A +time=2 +tries=1
# On an approved client:
dig @10.77.100.10 example.com A +time=2 +tries=1
```

Both should return an answer during normal operation. If the first fails, fix Unbound before investigating AdGuard's forwarding. If the first succeeds and the second fails, check AdGuard listeners, access controls, filter logs, and client firewall path.

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

### A controlled filtering test

Use a harmless domain that you control or a reserved test name, rather than deliberately browsing malware infrastructure. For example, temporarily add `||blocked.example^` to the custom filtering rules, apply, and query that name from a test client. Confirm the query log identifies the custom rule; the exact response depends on your configured blocking mode. Remove the temporary rule after the test.

A browser error alone does not prove DNS filtering. The browser may use a cached address, a different resolver, or its own secure-DNS setting. Use a direct query, correlate its timestamp/client with the AdGuard log, and test a known allowed public name too.

### DHCP cutover in a small group first

Change one test scope or client before the entire network. Record its old settings for rollback. On Windows, renew the lease and clear the local DNS cache from an appropriately privileged terminal:

```powershell
ipconfig /renew
ipconfig /flushdns
ipconfig /all
```

On Linux with systemd-resolved, inspect `resolvectl status` and use `sudo resolvectl flush-caches` when testing. Renew the lease using the network manager actually in use; do not apply commands for several competing network managers.

Expected: queries from that client appear in AdGuard and required applications still work. Then repeat for the remaining scopes. A second approved resolver should enforce the same filtering policy; a public backup DNS entry lets clients evade it without any outage.

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

### Back up a small host-network installation

For the directory layout in this article, keep backups in a root-only directory outside the live service folder. The command archives the Compose file, private environment file, and persistent AdGuard directories; adjust names if you used a different layout.

```bash
cd /opt/adguard
sudo install -d -m 0700 /var/backups/adguard
BACKUP_STAMP=$(date -u +%Y%m%dT%H%M%SZ)
docker compose stop adguard
sudo tar -czf "/var/backups/adguard/adguard-${BACKUP_STAMP}.tar.gz" \
  -C /opt/adguard compose.yaml .env data
docker compose start adguard
docker compose ps
```

Check each command's result. If archiving fails, restart DNS promptly and investigate the backup failure; do not leave the network without a resolver. Verify the archive can be listed, copy it to protected off-host storage, and record the image version used. The archive may contain query history, password hashes, certificates, or upstream authentication details.

For restoration, use an isolated host first: install the same compatible image, restore the directory tree and ownership, review old listen addresses, and keep public exposure blocked. Start the service, verify admin login and a controlled query, and compare filtering behavior. Do not run the restored server on the production address until the original is safely removed or the migration is deliberately coordinated.

### Upgrade with a short rollback window

1. Read the target release notes and create the backup above.
2. Change the pinned tag in `.env` after recording the previous one.
3. Run `docker compose config --quiet`, then `docker compose pull` and `docker compose up -d`.
4. Verify container state, admin login, UDP/TCP resolution, and one filtering test.
5. If recovery is required, use the compatible previous image and its matching pre-upgrade configuration/data; do not assume an older binary can read migrated files.

Retest fallback after significant upgrades and keep a second approved resolver available if DNS downtime is unacceptable.

**Unverified locally:** installed AdGuard/OPNsense versions, host listener conflicts, actual fallback behavior, IPv6 policy, and client source visibility. Complete the tests before describing this as a validated deployment.
