---
layout: post
title: "Hardening a Docker-Based Security Server: Wazuh, OpenCTI, and Host Controls"
date: 2026-09-28
categories: [HomeLab, Security]
tags: [docker, ubuntu, hardening, wazuh, opencti, secrets, backups, linux, container-security]
---

# Hardening a Docker-Based Security Server

## Scope and assumptions

This article is a **security-hardening checklist with reproducible validation steps**, not a claim that every item has already been implemented. It complements the [Wazuh Docker deployment](/posts/wazuh-docker-standalone-setup/) and [OpenCTI Docker deployment](/posts/opencti-docker-standalone-setup/). Apply changes first in a test environment and record release-specific exceptions: some security products genuinely need elevated capabilities, persistent storage, kernel tuning, or privileged networking.

Examples use synthetic service names and paths. Never publish `docker inspect` output, live Compose environment files, certificate private keys, authentication hashes, database backups, real public DNS names, private registry tokens, or internal IP inventories. A published architecture may deliberately omit operationally sensitive detail.

## 1. Threat model and minimum host baseline

A container boundary is not a substitute for securing the host. Relevant threats include an exposed dashboard, leaked API token, compromised container image, excessive Linux capabilities, a writable Docker socket, weak backup protection, and denial of service against co-hosted DNS or logging.

```text
Management client -> VPN / restricted MGMT firewall -> admin interface
                                                   |
                                              Ubuntu host
                                               |   |   |
                                              SIEM CTI backups
                                               |
                               restricted inbound collector ports
```

Use a maintained Ubuntu LTS release, vendor-supported Docker Engine and Compose, automatic security-update policy appropriate for availability, NTP, and encrypted administrative access. Prefer a dedicated security server; if DNS shares the host, document the impact of CPU, RAM, or disk exhaustion on the whole network. Restrict SSH to a management network or VPN and use individual keys; disable password authentication only after a tested recovery path exists.

Review [Docker's Ubuntu install instructions](https://docs.docker.com/engine/install/ubuntu/) and [Docker daemon attack-surface guidance](https://docs.docker.com/engine/security/#docker-daemon-attack-surface) for your release. Membership in the `docker` group is highly privileged; do not grant it to untrusted users.

## 2. Inventory ports before applying firewall rules

On the host, inspect listeners and Docker-published mappings:

```bash
sudo ss -lntup
sudo docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}'
sudo docker compose config --services
```

The last command must run in the directory containing the intended Compose project. Review the fully resolved Compose configuration **locally**; it may contain resolved secret values, so do not post it or paste it into issue trackers.

Create a private port-ownership matrix: service, destination, source subnet, protocol, business/lab purpose, and firewall owner. Bind a dashboard to loopback only if it is accessed through a local reverse proxy or SSH tunnel; otherwise apply explicit trusted-source firewalling. Prefer no published port for backends that are used only by sibling containers on an internal network.

**Critical:** Docker can publish ports in ways that bypass naive expectations about host UFW rules. Verify the packet path and Docker's firewall integration for your exact Engine version; enforce upstream OPNsense restrictions and test from an untrusted zone. Do not declare a port protected solely because `ufw status` shows `deny`.

## 3. Harden images, privileges, and filesystem access

Use official or trusted vendor images, pin compatible version tags and preferably image digests after testing, and record a private update/rollback plan. Scan images and dependencies, read vendor release notes, and rebuild on a supported cadence. Avoid automatically pulling `latest` into a stateful SIEM or intelligence stack.

Assess each container for:

- Unneeded `privileged: true`, `network_mode: host`, host PID namespace, extra capabilities, and device mounts.
- Unnecessary bind mounts, especially `/var/run/docker.sock`, `/`, `/etc`, SSH keys, and whole log directories.
- Whether a non-root UID, read-only root filesystem, `no-new-privileges`, resource limits, and a bounded log rotation policy are **supported by the vendor image**.
- Whether internal database/indexer ports are accidentally published on the host.

A generic pattern for a **compatible stateless application** is shown below. It is **not** a safe blind replacement for Wazuh or OpenCTI service definitions; verify required writes and capabilities first.

```yaml
services:
  example-stateless-app:
    image: example.invalid/vendor/app@sha256:REPLACE_WITH_VERIFIED_DIGEST
    read_only: true
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    tmpfs:
      - /tmp:rw,noexec,nosuid,size=64m
    pids_limit: 128
    restart: unless-stopped
```

Use the official [Compose file reference](https://docs.docker.com/reference/compose-file/) and selected product's supported deployment manifests; some images require writable paths and capabilities not represented by this pattern. A placeholder digest is deliberately non-runnable.

## 4. Handle secrets without committing them

Use secret-management features supported by your orchestration and product. Docker Compose secrets can mount secret material as files for services that support file-based configuration; not every upstream image accepts `_FILE` environment-variable conventions. Treat ordinary environment variables as potentially visible through process inspection and tooling. Keep secret source files outside the repository with restrictive permissions and excluded backups as appropriate.

```bash
# Run from the repository root and review before committing.
git ls-files | grep -Ei '(^|/)(\.env|.*\.key|.*\.pem|.*secret.*|.*backup.*)$' || true
# Additional local review; do not upload matching lines to an online scanner.
git grep -n -I -E '(AKIA[0-9A-Z]{16}|BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY|password[[:space:]]*[:=])' || true
```

These checks are **not a comprehensive secret scan** and can flag examples or miss other token formats. Run an approved offline secret scanner against the working tree and Git history before publishing. Removing a leaked value from the current file does not remove it from history; rotate exposed credentials and follow the repository owner's history-rewrite process if required.

## 5. Protect logging, storage, and backups

Separate application, indexer, and backup access. Use named volumes or documented bind mounts with the appropriate UID/GID and restrictive permissions. Avoid logging raw auth headers, tokens, private intelligence records, or attacker-uploaded payload contents. Set retention and disk-capacity alerts so full disks do not silently stop the SIEM or DNS service.

For stateful platforms, a raw copy of live volume files may be inconsistent. Follow each product's supported backup procedure and include configuration, named-volume inventory, keys/certificates **in separately protected storage**, index/database snapshots as required, and a compatible restore version. Encrypt backups and test a restore on an isolated machine. Do not publish backup paths, bucket names, or restoration secrets.

Suggested private validation record:

| Control | Validation |
|---|---|
| Administrative access | SSH and web UIs reachable from approved management source only |
| Network isolation | Backend database/indexer ports unreachable from client and untrusted zones |
| Docker privileges | No unexpected privileged containers or Docker socket mounts |
| Resource resilience | Disk, memory, and log growth alert before service disruption |
| Backups | Clean test restore yields usable application data and verified access controls |
| Secrets | No live credentials in current tree, image layers, CI logs, or published history |

## 6. Operational verification and rollback

Run `docker compose config -q` to validate Compose syntax locally; then compare the resolved configuration against the previous release. Change one class of control at a time and test ingestion, dashboard access, agent enrollment, connector workers, and recovery. Preserve original config and volume snapshots. If a read-only filesystem or capability drop breaks a supported service, revert that specific change rather than relaxing every container's isolation.

For Wazuh, check manager, indexer, and dashboard health separately. For OpenCTI, test platform/API, ingestion worker, queue, search, and object storage; a working login does not prove background processing or recoverability. Re-run network reachability tests **from the unauthorized network** rather than from the server itself.

## Further reading

- [Docker Engine security](https://docs.docker.com/engine/security/)
- [Docker Compose secrets](https://docs.docker.com/compose/how-tos/use-secrets/)
- [Docker Engine firewalling](https://docs.docker.com/engine/network/packet-filtering-firewalls/)
- [Wazuh documentation](https://documentation.wazuh.com/current/)
- [OpenCTI documentation](https://docs.opencti.io/latest/)
