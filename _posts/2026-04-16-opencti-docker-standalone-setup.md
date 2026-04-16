---
layout: post
title: "OpenCTI with Docker: Standalone Setup for Threat Intelligence and IOC Workflows"
date: 2026-04-16
categories: [HomeLab, Security]
tags: [opencti, docker, threat-intelligence, ioc, mitre-attack, elasticsearch, rabbitmq, redis, minio, security-operations]
---

# OpenCTI with Docker: Standalone Setup for Threat Intelligence and IOC Workflows

## Overview

This is a full standalone guide for deploying OpenCTI with Docker. It is designed for home labs, security testing environments, and small SOC workflows that need a local threat-intelligence platform.

This walkthrough includes:

- complete OpenCTI Docker stack deployment
- secure environment configuration and secrets handling
- initial admin setup and first login
- connector setup for threat feeds and enrichment
- IOC lifecycle workflow basics
- maintenance, backups, upgrades, and troubleshooting

---

## What OpenCTI Provides

OpenCTI helps you manage and operationalize threat intelligence by correlating entities such as:

- indicators (IPs, domains, hashes, URLs)
- malware families
- threat actors and intrusion sets
- campaigns and attack patterns
- reports and external intelligence sources

Core value in a lab:

- central place for intel data curation
- local IOC searching and scoring
- feed ingestion and enrichment workflows
- mapping to MITRE ATT&CK for analyst context

---

## Architecture (Single-Host Docker)

OpenCTI depends on several services:

- OpenCTI platform API/UI
- worker service (background jobs)
- Redis (task/cache)
- RabbitMQ (queue)
- Elasticsearch (search/index)
- MinIO (object storage)

Core ports in this guide:

| Service | Port |
|---|---|
| OpenCTI web UI/API | 8080 |
| Elasticsearch (internal) | 9200 |
| MinIO (internal unless exposed) | 9000 |
| RabbitMQ mgmt (optional expose) | 15672 |

For security, expose only OpenCTI (8080) unless you explicitly need admin UIs for other services.

---

## Prerequisites

Recommended host minimum:

- 4 vCPU (8 preferred)
- 8 GB RAM minimum (16 GB preferred)
- 100 GB SSD minimum
- Ubuntu 22.04/24.04 or comparable Linux host

Install Docker Engine and Compose plugin (official repository):

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
  sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) \
  signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin

sudo usermod -aG docker $USER
newgrp docker
```

Verify:

```bash
docker --version
docker compose version
```

Set Elasticsearch kernel requirement:

```bash
sudo sysctl -w vm.max_map_count=262144
echo "vm.max_map_count=262144" | sudo tee -a /etc/sysctl.conf
```

---

## Step 1: Prepare Project Directory

```bash
sudo mkdir -p /opt/opencti
sudo chown -R $USER:$USER /opt/opencti
cd /opt/opencti
```

Create data directories for persistent volumes:

```bash
mkdir -p data/{redis,elasticsearch,minio,rabbitmq}
```

---

## Step 2: Create Environment File

Create `.env` with strong credentials:

```bash
nano /opt/opencti/.env
```

Example values:

```dotenv
# OpenCTI app
OPENCTI_ADMIN_EMAIL=admin@lab.local
OPENCTI_ADMIN_PASSWORD=ReplaceWithStrongPassword!
OPENCTI_ADMIN_TOKEN=replace-with-random-uuid
OPENCTI_BASE_URL=http://10.10.100.10:8080
APP__PORT=8080

# RabbitMQ
RABBITMQ_DEFAULT_USER=opencti
RABBITMQ_DEFAULT_PASS=ReplaceRabbitStrongPass

# MinIO
MINIO_ROOT_USER=opencti
MINIO_ROOT_PASSWORD=ReplaceMinioStrongPass

# SMTP (optional, for email notifications)
SMTP_HOSTNAME=
SMTP_PORT=587
SMTP_USERNAME=
SMTP_PASSWORD=
SMTP_TLS=true

# Elasticsearch memory tuning
ES_JAVA_OPTS=-Xms1g -Xmx1g
```

Generate a UUID for `OPENCTI_ADMIN_TOKEN`:

```bash
cat /proc/sys/kernel/random/uuid
```

Security notes:

- do not commit `.env` to git
- use unique, long passwords
- rotate credentials if this host is exposed or shared

---

## Step 3: Create Docker Compose File

```bash
nano /opt/opencti/docker-compose.yml
```

Use this baseline stack:

```yaml
services:
  redis:
    image: redis:7.2
    container_name: opencti-redis
    restart: unless-stopped
    volumes:
      - ./data/redis:/data

  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.13.0
    container_name: opencti-elasticsearch
    restart: unless-stopped
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=false
      - ES_JAVA_OPTS=${ES_JAVA_OPTS}
    ulimits:
      memlock:
        soft: -1
        hard: -1
    volumes:
      - ./data/elasticsearch:/usr/share/elasticsearch/data

  minio:
    image: minio/minio:latest
    container_name: opencti-minio
    restart: unless-stopped
    command: server /data
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD}
    volumes:
      - ./data/minio:/data

  rabbitmq:
    image: rabbitmq:3.13-management
    container_name: opencti-rabbitmq
    restart: unless-stopped
    environment:
      RABBITMQ_DEFAULT_USER: ${RABBITMQ_DEFAULT_USER}
      RABBITMQ_DEFAULT_PASS: ${RABBITMQ_DEFAULT_PASS}
    volumes:
      - ./data/rabbitmq:/var/lib/rabbitmq

  opencti:
    image: opencti/platform:6.1.10
    container_name: opencti-platform
    restart: unless-stopped
    environment:
      APP__PORT: ${APP__PORT}
      APP__BASE_URL: ${OPENCTI_BASE_URL}
      APP__ADMIN__EMAIL: ${OPENCTI_ADMIN_EMAIL}
      APP__ADMIN__PASSWORD: ${OPENCTI_ADMIN_PASSWORD}
      APP__ADMIN__TOKEN: ${OPENCTI_ADMIN_TOKEN}
      REDIS__HOSTNAME: redis
      ELASTICSEARCH__URL: http://elasticsearch:9200
      MINIO__ENDPOINT: minio
      MINIO__ACCESS_KEY: ${MINIO_ROOT_USER}
      MINIO__SECRET_KEY: ${MINIO_ROOT_PASSWORD}
      RABBITMQ__HOSTNAME: rabbitmq
      RABBITMQ__USERNAME: ${RABBITMQ_DEFAULT_USER}
      RABBITMQ__PASSWORD: ${RABBITMQ_DEFAULT_PASS}
      SMTP__HOSTNAME: ${SMTP_HOSTNAME}
      SMTP__PORT: ${SMTP_PORT}
      SMTP__USERNAME: ${SMTP_USERNAME}
      SMTP__PASSWORD: ${SMTP_PASSWORD}
      SMTP__TLS: ${SMTP_TLS}
    depends_on:
      - redis
      - elasticsearch
      - minio
      - rabbitmq
    ports:
      - "8080:8080"

  worker:
    image: opencti/worker:6.1.10
    container_name: opencti-worker
    restart: unless-stopped
    environment:
      OPENCTI_URL: http://opencti:8080
      OPENCTI_TOKEN: ${OPENCTI_ADMIN_TOKEN}
      WORKER_LOG_LEVEL: info
    depends_on:
      - opencti
```

If you need more ingestion throughput, scale worker replicas:

```bash
docker compose up -d --scale worker=3
```

---

## Step 4: Start and Validate Stack

Start:

```bash
cd /opt/opencti
docker compose up -d
```

Check services:

```bash
docker compose ps
docker compose logs -f opencti
```

First startup may take several minutes while dependencies initialize.

Open UI:

- `http://<opencti-host-ip>:8080`

Log in with values from `.env`:

- email: `OPENCTI_ADMIN_EMAIL`
- password: `OPENCTI_ADMIN_PASSWORD`

---

## Step 5: Initial OpenCTI Configuration

After first login:

1. Verify timezone and platform settings in administration.
2. Create a dedicated non-admin analyst account.
3. Keep admin account for configuration only.
4. Set organization name and labeling conventions.

Recommended label model:

- source labels: `otx`, `cisa`, `urlhaus`, `manual`
- confidence labels: `high-confidence`, `medium-confidence`, `low-confidence`
- status labels: `new`, `triaged`, `blocked`, `false-positive`

---

## Step 6: Add Connectors and Threat Feeds

OpenCTI gets most value when connectors are configured.

### Core connectors to enable first

- MITRE ATT&CK
- CISA KEV
- URLhaus
- AlienVault OTX
- OpenCTI data sets

Connector setup path:

1. Settings -> Connectors
2. Add connector package/config (varies by connector type)
3. Supply required API keys
4. Set schedule intervals (start conservative)

Practical schedule baseline:

- critical feeds: every 1-4 hours
- enrichment feeds: every 12-24 hours

Do not enable every connector at once. Start with 2-3 trusted sources, validate data quality, then expand.

---

## Step 7: IOC Workflow and Triage Process

Suggested analyst flow:

1. Ingest IOC from feed or manual report
2. Normalize and tag (source, confidence, status)
3. Enrich IOC (WHOIS, geo, malware context, ATT&CK mapping)
4. Decide action:
   - block
   - monitor
   - dismiss/false-positive
5. Export or sync IOC to downstream controls (SIEM/EDR/firewall as needed)

Create saved views for:

- New high-confidence indicators
- Indicators seen in last 24 hours
- Indicators not yet triaged

---

## Step 8: Notifications and Alerting

OpenCTI notification behavior depends on version and connector choices, but common patterns are:

- Email notifications via SMTP config
- Webhook notifications to automation platform
- Downstream alerting through SIEM (for example Wazuh) after IOC export/correlation

If using SMTP from `.env`, test mail delivery by creating a user action that generates notification email.

For chat notifications (Slack/Teams), preferred pattern is:

1. OpenCTI exports IOC/incident metadata
2. SIEM/SOAR handles thresholding and sends chat alerts

This avoids noisy direct-notification floods.

---

## Step 9: Security Hardening

1. Place OpenCTI behind reverse proxy with TLS (Nginx/Caddy/Traefik).
2. Restrict UI to management subnet or VPN clients.
3. Do not expose Elasticsearch/Redis/RabbitMQ/MinIO ports publicly.
4. Use host firewall to allow only required inbound ports.
5. Rotate `.env` secrets periodically.
6. Keep container images updated with pinned, tested versions.

UFW example:

```bash
sudo ufw allow from 10.10.99.0/24 to any port 8080 proto tcp
sudo ufw default deny incoming
sudo ufw enable
```

---

## Step 10: Backups and Recovery

Back up regularly:

- `/opt/opencti/.env`
- `/opt/opencti/docker-compose.yml`
- `data/elasticsearch`
- `data/minio`
- `data/rabbitmq`
- `data/redis`

Example stop-backup-start approach:

```bash
cd /opt/opencti
docker compose down
tar -czf /opt/backups/opencti-$(date +%F).tar.gz /opt/opencti
docker compose up -d
```

Test restore in a separate environment before trusting backups.

---

## Step 11: Update Procedure

When updating:

```bash
cd /opt/opencti
docker compose pull
docker compose up -d
```

After update:

- confirm all containers healthy
- check connector jobs are still running
- verify user login and recent data ingestion

---

## Common Troubleshooting

1. UI never loads on 8080
- check `docker compose ps`
- check opencti logs
- verify host firewall allows 8080

2. Elasticsearch fails to start
- confirm `vm.max_map_count=262144`
- check disk space and permissions in `data/elasticsearch`

3. Connectors not importing data
- verify API keys
- verify schedule enabled
- verify worker container healthy

4. Performance degrades over time
- increase RAM
- reduce connector frequency
- scale workers (`--scale worker=3` or more)

---

## Integration with Main Homelab Stack

If you are also running the OPNsense lab stack:

- place OpenCTI host in Security Stack segment (`10.10.100.0/24`)
- restrict UI access to Management VLAN and WireGuard clients
- correlate IOC intelligence with Wazuh events for operational detection context

---

## Key Takeaways

- OpenCTI is most effective when connectors and triage workflows are deliberate, not everything-enabled by default.
- Docker deployment makes lab setup fast, but secrets and network exposure still need hardening.
- Start small: core feeds, clean labels, and repeatable triage process.
- Treat backups and restore testing as part of the deployment, not an afterthought.

---

**Disclaimer:** This guide is for educational and lab use. Validate legal, data-handling, and operational policy requirements before production deployment.
