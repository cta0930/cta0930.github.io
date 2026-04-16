---
layout: post
title: "DShield Honeypot Add-On for the OPNsense Homelab"
date: 2026-03-08
categories: [HomeLab, Security]
tags: [homelab, dshield, honeypot, raspberry-pi, opnsense, firewall, nat, cloud, internet-storm-center, network-security]
---

# DShield Honeypot Add-On for the OPNsense Homelab

## Overview

This post is an add-on to the base OPNsense homelab walkthrough and shows how to integrate a DShield honeypot safely.

Base guide this extends:
- [/posts/homelab-network-setup](/posts/homelab-network-setup)

This write-up now supports multiple ways to run DShield:

1. Home lab behind OPNsense firewall (recommended for this series)
2. Cloud VPS with public IP
3. Standalone host on another network/device (Pi, mini PC, VM, or old laptop)

The core security goal is always the same: isolate the sensor, expose only honeypot services, and keep real admin access separate.

## Deployment Model Matrix (Choose First)

| Model | Where It Runs | Internet Exposure Method | NAT Port Forward Needed? |
|---|---|---|---|
| Home lab + OPNsense | Raspberry Pi or other host on isolated honeypot segment | OPNsense WAN -> internal sensor IP | Yes, if ISP gives private LAN behind firewall |
| Cloud VPS | Cloud VM (AWS/Lightsail/DigitalOcean/Linode/etc.) | Public VM IP + cloud security group rules | No OPNsense NAT (not in path) |
| Standalone (no dedicated firewall) | Raspberry Pi/mini PC/VM on existing network | Router/NAT device or directly public host | Depends on upstream router design |

## Quick Start Paths

Use the path that matches your environment and skip the others.

### Path A: Home Lab with OPNsense Firewall

1. Complete Step 1 and Step 2.
2. Use Step 3 (OPNsense honeypot segment placement).
3. Complete Step 4 and Step 5 (interface + isolation policy).
4. Use Step 6 Path A (OPNsense NAT forwards).
5. Complete Step 7, Step 8, and Step 9.

### Path B: Cloud VPS with Public IP

1. Complete Step 1 and Step 2 (Cloud VPS option).
2. Skip Step 4 (no OPNsense interface in path).
3. Use Step 5 cloud/standalone policy model.
4. Use Step 6 Path B (cloud security group/firewall; no OPNsense NAT).
5. Complete Step 7, Step 8, and Step 9.

### Path C: Standalone Host (No OPNsense in Path)

1. Complete Step 1 and Step 2.
2. Use Step 3 cloud/standalone placement guidance.
3. Skip Step 4 unless you still use OPNsense internally.
4. Use Step 5 equivalent host/router isolation controls.
5. Use Step 6 Path C (router NAT only if required).
6. Complete Step 7, Step 8, and Step 9.

Important distinction:

- If OPNsense is in front of the sensor, use OPNsense NAT port forwarding (optional by design, required for internet-facing honeypot traffic in that path).
- If running in cloud with public IP, do not configure OPNsense NAT; expose only required ports in cloud firewall/security groups.

## DShield Port Model

| Service | External Port | Internal Sensor Port |
|---|---|---|
| SSH honeypot | 22 | 1222 |
| HTTP honeypot | 80 | 8080 |
| HTTPS honeypot | 443 | 8443 |
| Real admin SSH | never publicly exposed | 12222 (example) |

---

## Step 1: Register for ISC and Get API Credentials

1. Go to https://isc.sans.edu/myaccount.html
2. Create an account or sign in.
3. Record:
   - User ID
   - API key

You need these during installer setup.

---

## Step 2: Choose Sensor Host Platform

### Option A: Raspberry Pi (Most Common)

- Pi 4 or Pi 5
- 16 GB or larger microSD
- Wired Ethernet preferred

Flash Raspberry Pi OS Lite (64-bit) and enable SSH in imager advanced options.

### Option B: Cloud VPS

- Ubuntu/Debian VM with public IP
- 1 vCPU / 1-2 GB RAM minimum
- Restrict inbound at cloud firewall/security group level

### Option C: Other Devices

You can also run on:

- Intel NUC or mini PC
- Existing Linux VM in Proxmox/ESXi/Hyper-V
- Old laptop/desktop running Linux

As long as Linux dependencies are supported and network exposure is controlled, DShield runs fine.

Baseline OS prep on any Linux host:

```bash
sudo apt update && sudo apt full-upgrade -y
sudo apt autoremove -y
sudo timedatectl set-timezone America/New_York
```

---

## Step 3: Place the Sensor in the Correct Network Zone

### If Using the OPNsense Home Lab (Recommended)

Use the dedicated honeypot segment from the base guide:

- HONEYPOT network: `10.10.110.0/24`
- OPNsense HONEYPOT interface: `10.10.110.1`
- Sensor host IP: `10.10.110.100` (static or DHCP reservation)

Preferred connection model:

- Dedicated igc3 segment from OPNsense, or
- Dedicated HONEYPOT VLAN access port (untagged on sensor port, tagged on trunk)

### If Using Cloud or Standalone (No OPNsense in Path)

You still need isolation, but implemented differently:

- Cloud: enforce at security group + host firewall
- Standalone local network: isolate via dedicated VLAN/router if possible; at minimum lock down with host firewall and router rules

Do not place the honeypot on the same unrestricted segment as trusted workstations.

---

## Step 4: OPNsense Interface and DHCP (Home Lab Path Only)

If using OPNsense path, confirm interface:

1. Interfaces -> HONEYPOT
2. Enable interface
3. Static IPv4: `10.10.110.1/24`

Optional DHCP:

1. Services -> DHCPv4 -> HONEYPOT
2. Enable DHCP
3. Narrow range (example `10.10.110.100` to `10.10.110.110`)
4. DNS server: `10.10.100.10` (AdGuard)

Use static mapping for sensor MAC -> `10.10.110.100`.

If not using OPNsense, skip this step.

---

## Step 5: Isolation Firewall Policy

### OPNsense Policy (Home Lab Path)

On Firewall -> Rules -> HONEYPOT:

1. Block HONEYPOT net -> RFC1918 alias
2. Pass sensor host -> DNS resolver TCP/UDP 53
3. Pass sensor host -> any TCP 443
4. Pass sensor host -> any TCP 80 (only if needed for package repos)
5. Block HONEYPOT net -> any (default deny)

### Equivalent Policy for Cloud/Standalone

Implement same intent in cloud firewall + host firewall:

- Allow inbound only honeypot ports (22/80/443 externally, mapped to service listeners)
- Allow outbound only required update/reporting traffic
- Block outbound lateral movement to private internal ranges where possible
- Keep admin SSH restricted to your management IP(s) on high port (example 12222)

---

## Step 6: Internet Exposure Method (NAT Is Optional by Scenario)

This is where people often get confused. Use only the method that matches your deployment model.

### Path A: Home Lab with OPNsense in Front

Use OPNsense NAT port forwards so internet traffic reaches internal sensor IP.

In Firewall -> NAT -> Port Forward:

- WAN 22 -> `10.10.110.100:1222`
- WAN 80 -> `10.10.110.100:8080`
- WAN 443 -> `10.10.110.100:8443`
- Filter rule association: create associated rule

Do not forward admin SSH port 12222 from WAN.

### Path B: Cloud VPS

No OPNsense NAT needed here.

Instead:

1. Keep VM with public IP.
2. In cloud security group/firewall, allow inbound 22, 80, 443 only.
3. Keep admin SSH restricted by source IP and non-standard port if possible.
4. Use host firewall (UFW/nftables) to enforce same restrictions.

### Path C: Standalone Host Behind Non-OPNsense Router

If the router is doing NAT, configure equivalent port forwards there (22->1222, 80->8080, 443->8443). If host has public IP directly, no NAT is needed.

The requirement is exposure path, not specifically OPNsense.

---

## Step 7: Install DShield

On the sensor host:

```bash
cd ~
git clone https://github.com/DShield-ISC/dshield.git
cd dshield
sudo bash bin/install.sh
```

Installer values:

- ISC email
- ISC API key
- ISC user ID
- Honeypot SSH port: 1222
- Honeypot HTTP port: 8080
- Honeypot HTTPS port: 8443
- Real admin SSH port: 12222 (or your chosen high port)
- Interface: eth0 (or your host NIC)

Reboot if prompted.

---

## Step 8: Lock Down Management Access

Reconnect on real admin SSH port:

```bash
ssh -p 12222 <username>@<sensor_ip>
```

### If Using OPNsense

Add rule on Firewall -> Rules -> HONEYPOT (above default deny):

- Pass TCP from `10.10.99.0/24` (or single admin host) to sensor IP port 12222

### Host Firewall Hardening (All Models)

```bash
sudo apt install -y ufw
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Management SSH (adjust source subnet/IP)
sudo ufw allow from 10.10.99.0/24 to any port 12222 proto tcp

# Honeypot listeners
sudo ufw allow 1222/tcp
sudo ufw allow 8080/tcp
sudo ufw allow 8443/tcp

sudo ufw enable
sudo ufw status verbose
```

For cloud, replace `10.10.99.0/24` with your static public admin IP/CIDR.

---

## Step 9: Validate Services and Isolation

Service checks:

```bash
sudo systemctl status cowrie --no-pager
sudo systemctl status dshield --no-pager
sudo systemctl status nginx --no-pager
sudo ss -tlnp | grep -E '(:1222|:8080|:8443|:12222)'
```

Network behavior checks:

```bash
# DNS and ISC reporting path
curl -I https://isc.sans.edu
```

If OPNsense home-lab path:

```bash
# These should fail from sensor host
ping -c 3 10.10.99.1
ping -c 3 10.10.20.1
```

External reachability test from outside network:

```bash
ssh -p 22 <public_ip>
curl -I http://<public_ip>
curl -k -I https://<public_ip>
```

Expected:

- internet reaches honeypot services
- real admin SSH stays private/restricted
- no unrestricted lateral access from sensor into trusted networks

---

## Step 10: Integrate with Monitoring

For consistency with your main lab:

- Keep sensor DNS through AdGuard where applicable
- Forward logs to Wazuh (optional)
- Use Slack/email notifications for high-severity events

Optional: install Wazuh agent on sensor host for endpoint telemetry.

---

## Common Mistakes to Avoid

- Assuming NAT forwarding is always required (it is not in cloud/public-IP deployments)
- Exposing real admin SSH port on WAN/public internet
- Running honeypot on trusted user VLAN for convenience
- Allowing broad outbound access from sensor to internal private networks
- Skipping verification after rule changes

---

## Key Takeaways

- This post is an add-on to the base OPNsense homelab design, but the same DShield concepts work in cloud and standalone deployments.
- OPNsense NAT forwarding is optional by architecture and only used when OPNsense is the internet edge for your sensor.
- Raspberry Pi is common, but DShield can run on cloud VMs and other Linux hosts.
- Isolation and least-privilege management matter more than host type.

---

**Disclaimer:** This setup is for educational/home-lab use. Any internet-exposed honeypot will receive hostile traffic. Validate segmentation, access controls, and legal/policy constraints before enabling exposure.
