---
layout: post
title: "OpenCTI with Docker: Standalone Setup for Threat Intelligence and IOC Workflows"
date: 2026-04-16
categories: [HomeLab, Security]
tags: [opencti, docker, threat-intelligence, ioc, mitre-attack, elasticsearch, rabbitmq, redis, minio, security-operations]
---

# OpenCTI with Docker: Standalone Setup for Threat Intelligence and IOC Workflows

## Scope and example conventions

This guide covers a private single-host deployment, connector validation, analyst workflow, and recovery planning. It complements the [OPNsense homelab guide](/posts/homelab-network-setup/). Documentation was reviewed on 2026-09-28; no live stack or restore was tested.

The server `10.77.100.10`, administrator `10.77.90.10`, and account `admin@example.com` are synthetic examples. Keep operational addresses, account identifiers, tokens, environment files, encryption keys, webhook URLs, logs, and screenshots private. Intelligence records may contain victim identities or confidential evidence; sanitize exported examples separately from configuration.

OpenCTI relates intelligence entities and evidence. Installing it does not automatically correlate Wazuh alerts or push firewall blocks. Those require separately tested integrations and decisions about which data may leave the platform.

## 1. Select a supported release

Start with the [official installation guide](https://docs.opencti.io/latest/deployment/installation/) and [Docker distribution](https://github.com/OpenCTI-Platform/docker). Select compatible platform, worker, connector, and dependency versions. Record the repository commit and image digests privately. Do not combine an old platform example with moving `latest` dependencies.

Typical components include the platform/API, workers, a search backend, Redis, RabbitMQ, and S3-compatible object storage. The distribution evolves and may include additional integration-management services. Review every service, mount, capability, and published port before starting; upstream examples do not necessarily expose only the UI.

Size CPU, memory, disk, and retention from the selected release's requirements and expected ingestion. A generic 8 GB minimum is not validated for a combined OpenCTI/Wazuh/DNS host. Leave resources for the operating system and dependencies. Consider a separate DNS host to prevent resource exhaustion from interrupting the network.

Install Docker Engine and Compose through [Docker's supported Ubuntu instructions](https://docs.docker.com/engine/install/ubuntu/). Docker-group membership grants powerful host control. Set search-backend kernel requirements, including `vm.max_map_count`, to the selected version's documented values and persist them appropriately; do not assume an older tuning value remains sufficient.

## 2. Obtain complete deployment files

Use a new private directory outside the website checkout. Do not overwrite an existing deployment:

```bash
mkdir -p ~/private-deployments
cd ~/private-deployments
umask 077
git clone https://github.com/OpenCTI-Platform/docker.git opencti
cd opencti
read -r -p "Reviewed Docker repository commit: " OPENCTI_DOCKER_REF
git checkout --detach "${OPENCTI_DOCKER_REF:?A reviewed commit is required}"
git rev-parse HEAD
```

Select a reviewed commit compatible with your chosen release. Retain its companion configuration mounts and environment templates. Pin each image to a compatible reviewed version/digest; a repository commit does not pin images using moving tags.

## 3. Configure credentials and persistence

Copy the selected release's sample environment file to `.env` and replace every required placeholder. Do not use an abbreviated environment block from another release.

| Value | Handling |
|---|---|
| Administrator email/password | Private real account and unique generated password |
| Tokens/connector IDs | Generate in the required format; preserve stable connector IDs |
| Application encryption keys | Generate as documented and retain securely for recovery |
| Backend credentials | Unique per service and consistent at both ends |
| External URL | Actual browser-facing URL, distinct from internal service URLs |
| SMTP/provider credentials | Configure only for intended integrations |

Generate secrets locally with a password manager or the release's documented method. `.env` is not an encrypted secret store; Docker access and diagnostics may reveal values. Never publish expanded Compose configuration.

```bash
chmod 600 .env
git check-ignore .env
```

If the second command shows nothing, add `.env` to this private checkout's `.git/info/exclude` or an appropriate ignore rule. Do not commit credentials. Review named volumes and bind mounts, ownership, and free space. Avoid world-writable data directories. Archiving only the project directory does not include Docker named-volume contents.

## 4. Restrict exposure before startup

For a simple private lab, publish the platform on host loopback and use SSH. In the selected Compose file, **replace** the platform's existing port mapping with:

```yaml
# Within the existing opencti service; not a complete Compose file.
ports:
  - "127.0.0.1:8080:8080"
```

This assumes container port 8080 for the selected release. Do not merely add another mapping or an override that merges with the original wildcard mapping. Inspect effective mappings privately.

Remove unnecessary host publication of search, Redis, RabbitMQ, and object-store ports. Internal Docker-network communication does not require publishing them. If your selected release needs browser access to an auxiliary endpoint, follow its documented routing/TLS design and restrict that endpoint too.

From the administrator workstation:

```bash
ssh -N -L 18080:127.0.0.1:8080 labadmin@10.77.100.10
```

Open `http://127.0.0.1:18080` locally; the remote connection is inside SSH. Configure the browser-facing base URL accordingly using the release's variables and test redirects. Internal container URLs still use service names. For regular multiuser access, use a properly configured HTTPS reverse proxy with a matching external URL and private backend access.

On OPNsense, allow administrator-to-server SSH on MGMT ingress. With a reverse proxy, permit only intended management/VPN clients to its address/port. Do not create WAN forwards to the stack.

Ordinary UFW input rules may not protect Docker-published bridge ports. Verify loopback binding, routed restrictions, and backend-appropriate filtering using [Docker's firewall guidance](https://docs.docker.com/engine/network/packet-filtering-firewalls/). Do not rely on the old UFW-only example.

If an integration manager mounts the Docker socket, it gains extensive Docker/host control. Review that trust boundary and use only the documented deployment mode you intend. Do not add the socket to ordinary feed connectors for convenience.

## 5. Start and validate

After reviewing versions, credentials, persistence, and exposure:

```bash
docker compose config --quiet
docker compose pull
docker compose up -d
docker compose ps
docker compose logs --tail=100 opencti worker
```

Adjust service names to the selected distribution. Inspect dependency health and logs privately. A running container is not necessarily ready. Verify administrator login, create a non-admin analyst, and save/search a small test record. Check persistence after restart and authorized file import/export.

Scale workers only when queue/resource measurements justify it:

```bash
docker compose up -d --scale worker=3
```

The worker must not have a fixed `container_name`; Compose cannot scale that configuration. Remove the earlier tutorial's fixed worker name when adapting an existing file. Scaling also needs dependency capacity and will not fix exhausted memory or slow storage. See [Compose service configuration](https://docs.docker.com/reference/compose-file/services/).

## 6. Add one connector at a time

Use the selected connector's README and [OpenCTI deployment documentation](https://docs.opencti.io/latest/deployment/connectors/). A connector runs as a configured process/container, or through a supported integration manager in releases offering one. A dashboard entry alone does not deploy arbitrary feed software.

1. Choose a relevant source, such as MITRE ATT&CK reference data or one IOC feed. Check current authentication, terms, and rate limits.
2. Use a compatible image/configuration, stable unique connector ID, and dedicated identity with required permissions. Prefer scoped credentials where supported.
3. Configure platform URL, scope, credentials, and connector-specific schedule/state options. Interval formats and historical-import defaults vary.
4. Start it and verify registration, completed work, source provenance, and expected records. Registration alone is not successful ingestion.
5. Add more feeds only after checking storage growth, duplication, marking handling, and API usage.

Separate Compose projects need deliberately shared networking; `http://opencti:8080` does not resolve across unrelated networks automatically. Permit required feed egress without broad access to trusted internal systems.

## 7. Triage intelligence before automation

Use an ingest -> review provenance -> enrich -> assess relevance/confidence -> decide -> document workflow. A domain or hash observable is not automatically a malicious indicator. Use supported confidence, marking, validity, and relationship fields. Labels help organization but do not replace structured semantics or access control.

Create views for new records, pending review, and expiring indicators. Record the rationale for blocking or dismissal. Test downstream export schemas and expiry/removal behavior before connecting SIEM, EDR, or firewall automation. Do not automatically block every imported record.

SMTP, webhook, and notification behavior depends on the release and configuration. Test the exact trigger and recipient privately. Review payloads for sensitive entities, tokens, and internal URLs. Setting SMTP variables alone does not establish a complete alert workflow.

## 8. Use supported backups and test recovery

The previous stop-and-tar recipe for Elasticsearch data directories was not a supported backup method. Use its native snapshot/restore API and a configured snapshot repository. Elastic explicitly states that copying data directories is unsupported even when nodes are stopped. See [Elastic snapshot and restore](https://www.elastic.co/docs/deploy-manage/tools/snapshot-and-restore).

Create a recovery plan covering the whole selected deployment:

- Search-backend snapshots with verified completion and compatible restore versions.
- Object storage through its supported backup/versioning/export method, including uploaded files.
- Pinned deployment files/images, private environment secrets, encryption keys, and connector identities/state.
- Other required stateful services, using their documented recovery methods.

Coordinate a maintenance window or ingestion quiescence where needed for a recoverable cross-service point. A search snapshot is not an atomic backup of every component. Record timing and recovery-point expectations. Encrypt/restrict backups and retain off-host copies.

Restore into an isolated environment with outbound connectors/notifications disabled. Verify login, representative entities/relationships, attachments, connector state, and controlled new ingestion. Do not remove named volumes during routine maintenance. Keeping backup files without a restore test does not prove recoverability.

## 9. Upgrade with a recovery point

1. Review release notes, supported upgrade paths, dependency changes, and migrations.
2. Verify backups and record the working image digests/configuration.
3. Test on a restored isolated copy where practical.
4. Update the pinned platform, worker, connector, and dependency versions as required; validate configuration before pulling/recreating services.
5. Recheck health, login, search, attachments, connector work, and resource usage.

Pulling images alone does not upgrade a pinned tag to another release. Moving tags can change unexpectedly. Database migrations may prevent rollback by selecting an older image; retain compatible pre-upgrade data and configuration.

## 10. Validation and troubleshooting

| Symptom | Check |
|---|---|
| UI unavailable | Dependency health, tunnel/proxy, bind address, external URL |
| Search backend fails | Version-specific kernel requirements, memory, disk, permissions |
| Connector registered but idle | Credentials/scope, queue/worker health, scheduling, API limits |
| Scaling fails | Fixed container_name, Compose configuration, resources |
| Backend reachable from another zone | Published ports, Docker filtering, earlier firewall pass rules |
| Restore loses attachments | Object-store backup and coordinated recovery point |

- [ ] Installed versions/digests and private configuration are recorded.
- [ ] Only authorized users reach the UI; backend ports are not unintentionally published.
- [ ] Non-admin permissions and data markings behave as intended.
- [ ] A controlled import and worker task complete successfully.
- [ ] Restart preserves records and attachments.
- [ ] Supported snapshots and all required state restore successfully.
- [ ] No live credentials, identifying logs, or operational screenshots enter the website repository.

**Unverified locally:** installed release/edition, optional integration-manager requirements, resource capacity, connector compatibility, external URL/proxy behavior, and complete restoration. This review does not attest a tested production deployment.
