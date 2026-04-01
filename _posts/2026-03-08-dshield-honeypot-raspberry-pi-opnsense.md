---
layout: post
title: "DShield Honeypot on Raspberry Pi with OPNsense: Full Isolation Setup"
date: 2026-03-08
categories: [HomeLab]
tags: [homelab, dshield, honeypot, raspberry-pi, opnsense, firewall, vlan, internet-storm-center, network-security, isolation]
---

# DShield Honeypot on Raspberry Pi with OPNsense: Full Isolation Setup

## Overview

This walkthrough covers the end-to-end setup of a **DShield Honeypot sensor** — a project from the [SANS Internet Storm Center (ISC)](https://isc.sans.edu/){:target="_blank"} — running on a **Raspberry Pi** and connected to an **OPNsense** firewall. The honeypot is intentionally exposed to the public internet to attract and log real-world attack traffic, which is then contributed back to the ISC global threat-intelligence feed.

Because the sensor deliberately invites hostile connections, **strict network isolation is non-negotiable.** This guide creates a dedicated `HONEYPOT` VLAN or interface directly on an OPNSense firewall with strict rules that:

- Allow inbound internet traffic to reach the Pi on specific honeypot ports (1222, 8080, and 8443).
- Prevent the Pi from initiating any connections to internal VLANs.
- Allow only the outbound reporting traffic the sensor needs (HTTPS to ISC and DNS).

**What DShield logs:**

| Service     | Default Port | What it captures                            |
|-------------|-------------|----------------------------------------------|
| SSH Honeypot (Cowrie-based) | 22 | Login attempts, brute-force, command history |
| HTTP Honeypot | 80 | Web scans, exploit payloads, URL enumeration |
| HTTPS Honeypot | 443 | TLS-wrapped web attack traffic              |

Logs are automatically submitted to the Internet Storm Center, feeding the DShield database used by security researchers worldwide.

**Updated Network Design** (building on the [Home Lab Network Setup post](/posts/homelab-network-setup)):

| VLAN ID | Name        | Subnet           | Purpose                                        |
|---------|-------------|------------------|------------------------------------------------|
| 10      | MANAGEMENT  | 10.0.10.0/24     | Firewall management, switch OOB                |
| 20      | TRUSTED     | 10.0.20.0/24     | Main workstations, daily-driver hosts          |
| 30      | LAB         | 10.0.30.0/24     | VMs, attack machines, test hosts               |
| 40      | IOT         | 10.0.40.0/24     | Smart devices, cameras, printers               |
| 50      | GUEST       | 10.0.50.0/24     | Guest Wi-Fi, isolated internet-only            |
| **60**  | **HONEYPOT**| **10.0.60.0/24** | **DShield Pi – internet-facing, fully isolated** |

---

## Hardware & Prerequisites

### Hardware

- **Raspberry Pi 4 Model B** (2 GB RAM minimum; 4 GB recommended) or **Raspberry Pi 5**  
  *A Pi 3B+ also works but offers less headroom for concurrent log processing.*
- MicroSD card (≥ 16 GB, Class 10 / A1 rated)
- USB-C power supply (5V/3A for Pi 4, 5V/5A for Pi 5)
- Ethernet cable (connect directly to a switch port assigned to VLAN 60)
- Existing OPNsense firewall with a free switch port (see the [Home Lab Network Setup](/posts/homelab-network-setup) post)

### Software / Downloads

- [Raspberry Pi OS Lite (64-bit)](https://www.raspberrypi.com/software/operating-systems/){:target="_blank"} – headless, minimal image
- [Raspberry Pi Imager](https://www.raspberrypi.com/software/){:target="_blank"} – for flashing the OS
- [DShield Raspberry Pi Sensor](https://github.com/DShield-ISC/dshield){:target="_blank"} – ISC-maintained installer
- An active [SANS ISC account](https://isc.sans.edu/myaccount.html){:target="_blank"} (free registration) to obtain your API key

---

## Step 1 – Register with the Internet Storm Center

Before installing the sensor you need an ISC API key so your Pi can authenticate its submissions.

1. Browse to [https://isc.sans.edu/myaccount.html](https://isc.sans.edu/myaccount.html){:target="_blank"}.
2. Create a free account or log in.
3. Navigate to **My Account → API Key** and note your **API key** and **User ID**.

Keep these credentials handy — the DShield installer will ask for them.

---

## Step 2 – Flash Raspberry Pi OS Lite

1. Download and install **Raspberry Pi Imager**.
2. Insert the microSD card into your workstation.
3. Open Raspberry Pi Imager:
   - **Device:** Raspberry Pi 4 (or 5)
   - **Operating System:** *Raspberry Pi OS Lite (64-bit)*
   - **Storage:** your microSD card
4. Click the **gear icon** (⚙️) to open Advanced Options before flashing:
   - **Enable SSH:** ✓ (use password authentication or, preferably, an SSH public key)
   - **Set username and password:** choose a non-default username (avoid `pi`)
   - **Set hostname:** e.g. `dshield-sensor`
   - **Configure wireless LAN:** leave blank — the Pi will use wired Ethernet only
5. Click **Save**, then **Write**. Confirm the overwrite prompt.

> **Security note:** Do **not** use the default `pi` / `raspberry` credentials. The sensor will be internet-facing; these defaults are among the very first credentials attackers try.

---

## Step 3 – Add VLAN 60 (HONEYPOT) to OPNsense

Log in to the OPNsense web GUI (`https://10.0.10.1`).

### 3.1 – Create the VLAN Sub-Interface

Navigate to **Interfaces → Other Types → VLAN** and click **+ Add**:

| Field            | Value          |
|------------------|----------------|
| Parent interface | `igc0` (your LAN/trunk port) |
| DShield interface| `igc3` (in my case)          |
| Description      | `HONEYPOT` (keep it simple)  |

Click **Save**.

### 3.2 – Assign and Enable the Interface

1. Go to **Interfaces → Assignments**.
2. In the **New interface** dropdown, select the newly created `vlan0.xx or igcx` device and click **+ Add**.
3. Click the new interface (e.g. `OPT5`) to edit it:
   - **Enable interface:** ✓
   - **Description:** `HONEYPOT or DShield`
   - **IPv4 Configuration Type:** Static IPv4
   - **IPv4 Address:** `10.0.250.1 / 24` (can be whatever works best for you)
4. Click **Save**, then **Apply Changes**.

### 3.3 – Configure DHCP for VLAN xx or igcx

Navigate to **Services → DHCPv4 → HONEYPOT**:

| Field       | Value               |
|-------------|---------------------|
| Enable      | ✓                   |
| Range start | `10.0.250.100`      |
| Range end   | `10.0.250.150`      |
| DNS servers | `9.9.9.9`, `1.1.1.1`|

> **Tip:** Narrowing the DHCP range to a single address (`10.0.250.100`) ensures the Pi always receives the same IP without needing a static assignment, and prevents any unexpected additional device from obtaining an address in this VLAN. Or just assign a static IP to keep things simple. I did this from the PI via SSH (i.e. 10.0.250.100)

Alternatively, add a **Static Mapping** under **Services → DHCPv4 → HONEYPOT → Static Mappings** that ties the Pi's MAC address to `10.0.250.100`.

Click **Save**.

---

## Step 4 – Firewall Rules for Full Isolation

This is the most critical part of the setup. The rules below implement a **default-deny** posture with explicit allow rules for only the traffic the honeypot legitimately needs.

Navigate to **Firewall → Rules**.

### 4.1 – HONEYPOT Interface Rules (outbound from the Pi)

These rules control traffic that originates *from* the Pi.

| # | Action | Protocol | Source           | Destination     | Port / Type | Description                                   |
|---|--------|----------|------------------|-----------------|-------------|-----------------------------------------------|
| 1 | Block  | *        | HONEYPOT net     | 10.0.10.0/24    | *           | Block access to MANAGEMENT VLAN               |
| 2 | Block  | *        | HONEYPOT net     | 10.0.20.0/24    | *           | Block access to TRUSTED VLAN                  |
| 3 | Block  | *        | HONEYPOT net     | 10.0.30.0/24    | *           | Block access to LAB VLAN                      |
| 4 | Block  | *        | HONEYPOT net     | 10.0.40.0/24    | *           | Block access to IOT VLAN                      |
| 5 | Block  | *        | HONEYPOT net     | 10.0.50.0/24    | *           | Block access to GUEST VLAN                    |
| 6 | Block  | *        | HONEYPOT net     | 10.0.250.100    | *           | Block access to HONEYPOT gateway itself       |
| 7 | Pass   | TCP      | HONEYPOT net     | any             | 443 (HTTPS) | Allow ISC log submission (dshield.org API)    |
| 8 | Pass   | UDP      | HONEYPOT net     | any             | 53 (DNS)    | Allow DNS resolution                          |
| 9 | Pass   | TCP      | HONEYPOT net     | any             | 80 (HTTP)   | Allow OS package updates (apt)                |
| 10| Block  | *        | HONEYPOT net     | any             | *           | Default deny — block everything else          |

> **Why allow port 80 (HTTP) outbound?** The Pi needs to reach Debian/Raspberry Pi OS package repositories over HTTP for `apt` updates. If you prefer, you can lock this down further by allowing only specific APT mirror IPs. After the sensor is fully configured and updated, you may optionally tighten this rule.

> **Rule order matters:** OPNsense evaluates rules **top-to-bottom, first match wins**. Always place Block rules above the broad Pass rules.

### 4.2 – WAN Interface Rules (inbound from the internet)

Navigate to **Firewall → Rules → WAN**. By default OPNsense blocks all unsolicited inbound traffic on WAN, which is correct. You only need to add rules if you are exposing the honeypot ports directly via port forwarding (configured in Step 5). OPNsense automatically creates associated WAN rules when you add NAT port-forward entries — you do **not** need to manually add WAN rules here; they are created in Step 5.

### 4.3 – Anti-Spoofing Alias (recommended)

Create a firewall alias that represents all internal RFC 1918 space to make the block rules above easier to maintain:

1. Navigate to **Firewall → Aliases** → **+ Add**:
   - **Name:** `RFC1918_PRIVATE`
   - **Type:** Network
   - **Networks:** `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`
2. Save.

You can now replace the individual per-VLAN block rules (rules 1–5 above) with a single rule:

| # | Action | Protocol | Source       | Destination        | Port | Description                         |
|---|--------|----------|--------------|--------------------|------|-------------------------------------|
| 1 | Block  | *        | HONEYPOT net | RFC1918_PRIVATE    | *    | Block all access to internal networks |

This single alias-based rule is easier to maintain and ensures future VLANs you add are automatically blocked from the honeypot.

---

## Step 5 – NAT Port Forwarding (WAN → Honeypot Pi)

To receive real internet attack traffic, you need to forward the honeypot ports from your WAN IP to the Pi's private IP (`10.0.250.100`).

Navigate to **Firewall → NAT → Port Forward** and click **+ Add** for each rule:

### 5.1 – Forward SSH (Port 22)

| Field                | Value                          |
|---------------------|---------------------------------|
| Interface            | WAN                            |
| Protocol             | TCP                            |
| Destination          | WAN address                    |
| Destination port range | 22 to 22                     |
| Redirect target IP   | `10.0.250.100`                  |
| Redirect target port | `1222`                         |
| Description          | DShield SSH honeypot           |
| Filter rule association | *Create new associated rule*|

### 5.2 – Forward HTTP (Port 80)

| Field                | Value                          |
|---------------------|--------------------------------|
| Interface            | WAN                            |
| Protocol             | TCP                            |
| Destination          | WAN address                    |
| Destination port range | 80 to 80                    |
| Redirect target IP   | `10.0.250.100`                  |
| Redirect target port | `8080` |
| Description          | DShield HTTP honeypot          |
| Filter rule association | *Create new associated rule* |

> **Port translation note:** Internet clients connect to your WAN IP on port **80**; OPNsense NAT translates and forwards those packets to the Pi on port **8080**, where the DShield web honeypot process listens (as configured in the installer prompt in Step 9.2). External clients never see the internal port.

### 5.3 – Forward HTTPS (Port 443)

| Field                | Value                          |
|---------------------|---------------------------------|
| Interface            | WAN                            |
| Protocol             | TCP                            |
| Destination          | WAN address                    |
| Destination port range | 443 to 443                   |
| Redirect target IP   | `10.0.250.100`                 |
| Redirect target port | `8443`                         |
| Description          | DShield HTTPS honeypot         |
| Filter rule association | *Create new associated rule*|

Click **Save** and **Apply Changes** after each entry.

> **Important:** After applying, OPNsense automatically creates matching **WAN pass rules** for each forwarded port. Verify them under **Firewall → Rules → WAN** — you should see three auto-generated rules allowing TCP/22, TCP/80, and TCP/443 inbound from any source to the WAN address.

---

## Step 6 – Configure the Netgear Switch Port for VLAN xx if that is the route you decided to take

If you are using the Netgear GS308E/GS316E switch from the home lab setup, assign an access port to VLAN xx for the Pi.

### 6.1 – Add VLAN xx to the Switch

In the Netgear web UI at `http://10.0.99.50`: (i.e. or whatever IP you use to access the switch)

1. Go to **VLAN → 802.1Q → Advanced → VLAN Configuration**.
2. Add VLAN ID `xx` with name `HONEYPOT`.

### 6.2 – Assign the Pi's Switch Port to VLAN xx

Navigate to **VLAN → 802.1Q → Advanced → VLAN Membership**.

Choose an unused port (e.g. Port 7 if it was formerly unused) and configure:

| VLAN ID | Port 1 (Trunk) | Port 8 (Pi port) |
|---------|---------------|-----------------|
| xx      | Tagged        | Untagged        |

### 6.3 – Set PVID for the Pi's Port

Navigate to **VLAN → 802.1Q → Advanced → Port PVID**.

Set Port 7 PVID to `xx`.

Connect the Raspberry Pi's Ethernet cable to Port 7.

---

## Step 7 – First Boot and SSH Access to the Pi

1. Insert the flashed microSD card into the Pi and power it on with the Ethernet cable connected to the HONEYPOT switch port.
2. Wait ~60 seconds for the Pi to complete its first boot.
3. From a workstation on the **MANAGEMENT** or **TRUSTED** VLAN, check the OPNsense DHCP leases to find the Pi's IP:
   - **Services → DHCPv4 → Leases** — look for the hostname `dshield-sensor` at `10.0.250.100`.
4. SSH into the Pi from your management workstation:

```bash
ssh <your-username>@10.0.250.100
```

> **Can you reach VLAN xx from TRUSTED?** By design, the firewall rules from Step 4 block the Pi from reaching internal VLANs — but they do **not** block inbound SSH *from* internal VLANs *to* the Pi, since those rules live on the `HONEYPOT` interface (controlling traffic originating from the Pi). Traffic from TRUSTED → HONEYPOT is governed by the TRUSTED interface rules, which (from the previous home lab setup) allow all outbound traffic. You can therefore still manage the Pi from your trusted workstation.
>
> If you want to further harden management access, add a dedicated rule on the TRUSTED interface: Block TCP from TRUSTED net to `10.0.250.100` port 22, **except** for your specific management workstation IP.

---

## Step 8 – Harden the Raspberry Pi OS

Before installing the sensor, apply baseline hardening to the Pi.

### 8.1 – Update the OS

```bash
sudo apt update && sudo apt full-upgrade -y
sudo apt autoremove -y
```

### 8.2 – Set the Hostname

```bash
sudo hostnamectl set-hostname dshield-sensor
```

### 8.3 – Configure SSH Key Authentication (if not already done via Imager)

From your management workstation:

```bash
# Generate a key pair if you don't already have one
ssh-keygen -t ed25519 -C "homelab-dshield"

# Copy the public key to the Pi
ssh-copy-id -i ~/.ssh/id_ed25519.pub <your-username>@10.0.60.100
```

Then disable password authentication on the Pi:

```bash
sudo sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo sed -i 's/^#\?ChallengeResponseAuthentication.*/ChallengeResponseAuthentication no/' /etc/ssh/sshd_config
sudo systemctl restart ssh
```

### 8.4 – Enable the Uncomplicated Firewall (UFW) on the Pi

The Pi runs a honeypot, but the OS-level firewall provides a secondary layer of protection.

```bash
sudo apt install ufw -y

# Deny all inbound by default
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Allow inbound SSH only from the management/trusted subnets
sudo ufw allow from 10.0.10.0/24 to any port 22 proto tcp
sudo ufw allow from 10.0.20.0/24 to any port 22 proto tcp

# Allow the honeypot ports from anywhere (the OPNsense NAT forwards these)
sudo ufw allow 1222/tcp comment 'SSH honeypot'
sudo ufw allow 8080/tcp comment 'HTTP honeypot'
sudo ufw allow 8443/tcp comment 'HTTPS honeypot'

sudo ufw enable
sudo ufw status verbose
```

> **Note on duplicate port 22:** The SSH honeypot runs on port 22 (the real SSH service is moved to a non-standard port during DShield installation — see Step 9). Until the installer moves the real SSH port, temporarily both the management access and the honeypot listener share port 22.

### 8.5 – Set the Timezone

```bash
sudo timedatectl set-timezone America/New_York
```

---

## Step 9 – Install the DShield Sensor

The ISC provides an automated installer script that sets up Cowrie (SSH honeypot), a web honeypot, log rotation, and the ISC submission daemon.

### 9.1 – Clone the DShield Repository

```bash
cd ~
git clone https://github.com/DShield-ISC/dshield.git
cd dshield
```

### 9.2 – Run the Installer

```bash
sudo bash bin/install.sh
```

The installer is interactive and will prompt you for the following:

**Prompt 1 — Email Address:**
```
Enter your email address:
```
Enter the email address associated with your ISC account.

**Prompt 2 — API Key:**
```
Enter your API key:
```
Paste the API key from your ISC account (Step 1).

**Prompt 3 — User ID:**
```
Enter your numeric user ID:
```
Enter the numeric User ID from your ISC account page.

**Prompt 4 — Honeypot Ports:**
The installer will ask which ports the honeypot services should listen on. Accept the defaults:

```
SSH honeypot port [22]:          → press Enter (accept 22)
HTTP honeypot port [8080]:       → press Enter (accept 8080)
HTTPS honeypot port [8443]:      → press Enter (accept 8443)
```

**Prompt 5 — Real SSH Port:**
To avoid conflicts, the installer moves the Pi's real SSH service to a different port:

```
Real SSH admin port [12222]:     → press Enter (or choose your own high port)
```

> **Critical:** After the installer completes and reboots the Pi, reconnect on the **new real SSH port** (default `12222`):
> ```bash
> ssh -p 12222 <your-username>@10.0.60.100
> ```
> Update your UFW rules on the Pi (if still accessible) or update the OPNsense HONEYPOT interface rules to allow TCP/12222 from management VLANs.

**Prompt 6 — Interface:**
```
Network interface [eth0]:        → press Enter (accept eth0)
```

The installer will then:

1. Install required packages (Python 3, Cowrie dependencies, nginx, certbot).
2. Configure Cowrie as the SSH honeypot on port 22.
3. Configure an nginx-based web honeypot on ports 8080 and 8443.
4. Set up the `dshield` submission daemon to POST logs to `https://isc.sans.edu`.
5. Configure log rotation and systemd service units.
6. **Reboot the Pi.**

### 9.3 – Update the UFW Rule for Real SSH

After the Pi reboots, the real SSH port has changed. Update the Pi's UFW rules:

```bash
# Connect on the new port
ssh -p 12222 <your-username>@10.0.60.100

# Remove old port 22 admin-access rule and add port 12222
sudo ufw delete allow from 10.0.10.0/24 to any port 22 proto tcp
sudo ufw delete allow from 10.0.20.0/24 to any port 22 proto tcp
sudo ufw allow from 10.0.10.0/24 to any port 12222 proto tcp
sudo ufw allow from 10.0.20.0/24 to any port 12222 proto tcp
sudo ufw reload
```

### 9.4 – Update the OPNsense HONEYPOT Interface Rules for Real SSH

In OPNsense, add an inbound-direction pass rule on the **HONEYPOT** interface so that management workstations can reach the Pi on its new admin SSH port. This step is only required if you chose to restrict TRUSTED→HONEYPOT access during an optional hardening step; if TRUSTED is already allowed to initiate all outbound connections, no change is needed there.

Navigate to **Firewall → Rules → HONEYPOT** and insert the following rule **before** the existing default-deny rule (rule 10):

| # | Action | Protocol | Source              | Destination  | Port  | Description                            |
|---|--------|----------|---------------------|--------------|-------|----------------------------------------|
| insert before 10 | Pass | TCP | `10.0.10.0/24` or `10.0.20.0/24` | `10.0.60.100` | `12222` | Allow management SSH to Pi admin port |

> This rule allows inbound TCP from your management or trusted subnets to reach the Pi on port 12222. Replace `12222` with the custom port you chose during installation if you changed the default.

---

## Step 10 – Verify the Sensor is Running

### 10.1 – Check Systemd Service Status

```bash
sudo systemctl status cowrie
sudo systemctl status dshield
sudo systemctl status nginx
```

All three services should show **active (running)**. If any service is failed, inspect its journal:

```bash
sudo journalctl -u cowrie -n 50 --no-pager
sudo journalctl -u dshield -n 50 --no-pager
```

### 10.2 – Confirm Honeypot Ports are Listening

```bash
sudo ss -tlnp | grep -E '(:22|:8080|:8443|:12222)'
```

Expected output:

```
LISTEN  0  128  0.0.0.0:22     0.0.0.0:*  users:(("cowrie",pid=...,fd=...))
LISTEN  0  128  0.0.0.0:8080   0.0.0.0:*  users:(("nginx",pid=...,fd=...))
LISTEN  0  128  0.0.0.0:8443   0.0.0.0:*  users:(("nginx",pid=...,fd=...))
LISTEN  0  128  0.0.0.0:12222  0.0.0.0:*  users:(("sshd",pid=...,fd=...))
```

### 10.3 – Test SSH Honeypot Locally

From a machine on the TRUSTED VLAN, simulate what an attacker sees on port 22:

```bash
ssh -p 22 root@10.0.250.100
```

Cowrie will accept the connection and present a fake shell. Type a few commands (`ls`, `whoami`, `id`) and then exit. These interactions are logged.

### 10.4 – Inspect Cowrie Logs

```bash
sudo tail -f /srv/cowrie/var/log/cowrie/cowrie.json
```

You should see JSON-formatted log entries for the test session, including the commands typed.

### 10.5 – Test HTTP Honeypot

```bash
curl -v http://10.0.250.100:8080/
```

You should receive an HTTP response (Cowrie/nginx-based web honeypot page). Any URL paths requested are logged.

### 10.6 – Verify ISC Log Submission

The DShield submission daemon sends logs to `https://isc.sans.edu` every few minutes. Check the submission logs:

```bash
sudo tail -f /var/log/dshield.log
```

A successful submission looks like:

```
[INFO] Submitted X records to isc.sans.edu
[INFO] Response: 200 OK
```

You can also verify submissions on the ISC website:

1. Log in to [https://isc.sans.edu/myaccount.html](https://isc.sans.edu/myaccount.html){:target="_blank"}.
2. Under **My Reports**, confirm that recent log entries appear from your sensor IP.

---

## Step 11 – Verify Network Isolation

### 11.1 – Confirm the Pi Cannot Reach Internal VLANs

From the Pi (connected to VLAN xx), attempt to reach resources in other VLANs. All should fail:

```bash
# Should fail — MANAGEMENT VLAN
ping -c 3 10.0.10.1
# Expected: 100% packet loss (blocked by OPNsense rule #1)

# Should fail — TRUSTED VLAN
ping -c 3 10.0.20.1
# Expected: 100% packet loss (blocked by OPNsense rule #2)

# Should fail — LAB VLAN
ping -c 3 10.0.30.1
# Expected: 100% packet loss (blocked by OPNsense rule #3)
```

### 11.2 – Confirm the Pi Can Reach the Internet for Reporting

```bash
# Should succeed — ISC reporting endpoint
curl -s -o /dev/null -w "%{http_code}" https://isc.sans.edu
# Expected: 200 or 301

# Should succeed — DNS resolution
dig @9.9.9.9 isc.sans.edu +short
# Expected: one or more IP addresses
```

### 11.3 – Confirm WAN Port Forwarding is Working

From a device **outside your network** (e.g., a mobile phone on cellular, or a VPS), attempt to connect to your WAN IP on the honeypot ports:

```bash
# Test SSH honeypot from external network
ssh root@<YOUR_WAN_IP>
# Expected: Cowrie fake shell prompt (not a real SSH banner)

# Test HTTP honeypot from external network
curl -v http://<YOUR_WAN_IP>/
# Expected: HTTP response from web honeypot
```

> If you do not have external access, you can temporarily use an online port-checking tool such as [https://www.yougetsignal.com/tools/open-ports/](https://www.yougetsignal.com/tools/open-ports/){:target="_blank"} to verify ports 22, 80, and 443 are open on your WAN IP.

### 11.4 – Review OPNsense Firewall Rule Hit Counts

In OPNsense, navigate to **Firewall → Rules → HONEYPOT**. Hover over each rule to see hit counts. After the isolation tests in 11.1, the Block rules should show increased counters, confirming they are functioning.

### 11.5 – Check OPNsense Firewall Logs

```
System → Log Files → Firewall
```

Filter by source IP `10.0.250.100` to see all blocked outbound traffic from the Pi. You should see blocked entries corresponding to the ping tests above.

---

## Step 12 – Ongoing Maintenance

### 12.1 – Keep the Sensor Updated

```bash
cd ~/dshield
git pull
sudo bash bin/install.sh
```

Re-running the installer script applies any updates to Cowrie and the submission daemon without losing your configuration.

### 12.2 – Keep the OS Updated

Set up unattended security updates to avoid manual patching:

```bash
sudo apt install unattended-upgrades -y
sudo dpkg-reconfigure --priority=low unattended-upgrades
```

Select **Yes** when prompted.

### 12.3 – Monitor Disk Space

Cowrie logs can grow quickly if the sensor is actively attacked. Set up log rotation (the DShield installer configures this, but verify it):

```bash
cat /etc/logrotate.d/cowrie
```

Ensure rotation is set to `daily` with at least 7 days retention and `compress` enabled. Check current disk usage:

```bash
df -h /
du -sh /srv/cowrie/var/log/cowrie/
```

### 12.4 – Review ISC Dashboard Regularly

Log in to [https://isc.sans.edu/myaccount.html](https://isc.sans.edu/myaccount.html){:target="_blank"} periodically to review:

- Total records submitted from your sensor.
- Top attacker IPs reported by your sensor.
- Comparison of your sensor's data with global DShield trends.

---

## Optional Enhancements

- **Elastic Stack (ELK) Integration:** Ship Cowrie JSON logs to Elasticsearch/Kibana for richer visualisation. The DShield project provides Kibana dashboards.
- **GeoIP Enrichment:** Configure Maxmind GeoLite2 in Cowrie to tag attacker IPs with country/ASN data in logs.
- **Alerting:** Use a tool like `logwatch` or a Kibana alert rule to email you when login attempts spike above a threshold.
- **T-Pot Integration:** [T-Pot](https://github.com/telekom-security/tpotce){:target="_blank"} is a multi-honeypot platform that includes DShield as one of many sensors — useful if you want a broader honeypot suite on a single host.
- **Second Honeypot Pi:** Deploy a second sensor on a different public IP (e.g. a cloud VPS) and correlate data across sensors on the ISC dashboard.
- **Centralized Syslog:** Forward the Pi's syslog to OPNsense's syslog receiver for centralized log storage with **System → Log Files → Settings → Remote Logging**.

---

## Key Takeaways

- **Network isolation is the foundation:** By placing the DShield Pi in a dedicated `HONEYPOT` VLAN with strict OPNsense firewall rules, you ensure that a compromised sensor cannot pivot into your internal networks.
- **Default-deny outbound:** The HONEYPOT interface rules block all outbound traffic except the minimum needed (HTTPS for ISC reporting, DNS, and HTTP for OS updates). This limits blast radius if the Pi itself is compromised.
- **Port forwarding targets the VLAN IP:** OPNsense NAT forwards WAN ports 22, 80, and 443 directly to `10.0.250.100`, keeping the real management SSH port (`12222`) invisible to the internet.
- **The RFC 1918 alias simplifies rule maintenance:** A single alias-based block rule covers all internal subnets, future-proofing the isolation as you add VLANs.
- **Contribute and learn:** Every connection logged by your DShield sensor contributes to the ISC global threat-intelligence feed. Regularly reviewing the ISC dashboard turns your honeypot from a passive sensor into an active learning tool.

---

**Disclaimer:** This walkthrough is for educational and home lab purposes only. Intentionally exposing a honeypot to the internet attracts real malicious traffic. Always verify your firewall isolation rules thoroughly before enabling WAN port forwarding, and ensure your setup complies with applicable laws and your ISP's terms of service.
