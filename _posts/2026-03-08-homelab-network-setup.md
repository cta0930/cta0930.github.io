---
layout: post
title: "Home Lab Network Setup: Protectli + OPNsense + Netgear VLANs"
date: 2026-03-08
categories: [HomeLab]
tags: [homelab, opnsense, protectli, netgear, vlan, networking, firewall, managed-switch]
---

# Home Lab Network Setup: Protectli + OPNsense + Netgear VLANs

## Overview

This post walks through the full setup and configuration of a home lab network using:

- **Protectli Vault FW4B** – a compact, fanless x86 appliance used as the firewall/router
- **OPNsense** – open-source firewall/router OS installed on the Protectli
- **Netgear GS308E / GS316E** (or similar ProSAFE Plus managed switch) – for VLAN-segmented switching

The goal is to segment the home lab environment into isolated VLANs so that lab traffic, IoT devices, trusted workstations, and a management network never mix unnecessarily.

**Network Design:**

| VLAN ID | Name        | Subnet           | Purpose                              |
|---------|-------------|------------------|--------------------------------------|
| 1       | Default     | *(unused/blocked)*| Native untagged – disabled in lab   |
| 10      | MANAGEMENT  | 10.0.10.0/24     | Firewall management, switch OOB      |
| 20      | TRUSTED     | 10.0.20.0/24     | Main workstations, daily-driver hosts|
| 30      | LAB         | 10.0.30.0/24     | VMs, attack machines, test hosts     |
| 40      | IOT         | 10.0.40.0/24     | Smart devices, cameras, printers     |
| 50      | GUEST       | 10.0.50.0/24     | Guest Wi-Fi, isolated internet-only  |

---

## Hardware & Prerequisites

### Hardware

- **Protectli Vault FW4B** (quad-core, 4 × Intel i225/i226 NICs, 8 GB RAM, 120 GB mSATA SSD)  
  *Any Protectli model with at least 2 NICs works; 4 ports gives flexibility for a dedicated management port.*
- **Netgear GS308E** or **GS316E** (8 or 16-port managed switch with 802.1Q VLAN support)
- At least one workstation or laptop for initial setup
- USB flash drive (≥ 1 GB) for OPNsense installation media
- Cat5e/Cat6 Ethernet cables

### Software / Downloads

- [OPNsense ISO](https://opnsense.org/download/){:target="_blank"} – download the **dvd** image for your architecture (amd64)
- [Balena Etcher](https://www.balena.io/etcher/){:target="_blank"} or `dd` to write the installer to USB
- [Netgear ProSAFE Plus Utility](https://www.netgear.com/support/product/gs308e/){:target="_blank"} (optional – browser UI works fine)

---

## Step 1 – Create OPNsense Installation Media

Download the OPNsense DVD image and write it to a USB drive.

**Linux / macOS (dd):**

```bash
# Identify your USB device (e.g. /dev/sdb or /dev/disk2)
lsblk          # Linux
diskutil list  # macOS

# Decompress and write (replace X with your device letter/number)
bzip2 -d OPNsense-*-dvd-amd64.iso.bz2
sudo dd if=OPNsense-*-dvd-amd64.iso of=/dev/sdX bs=4M status=progress conv=fsync
```

**Windows:**  
Use Balena Etcher – select the `.iso` (decompress `.bz2` first with 7-Zip), select the USB drive, then click **Flash**.

---

## Step 2 – Install OPNsense on the Protectli

1. Connect a monitor and keyboard to the Protectli (HDMI + USB).
2. Insert the USB drive.
3. Power on and enter the BIOS (press **Delete** or **F2** during POST) to set USB as the first boot device. Save and reboot.
4. OPNsense boots into the live installer. Log in as:
   - **User:** `installer`
   - **Password:** `opnsense`
5. Accept the default keymap.
6. Choose **Install (UFS)** (or ZFS if you prefer).
7. Select the internal drive (usually `ada0` or `nvme0`).
8. Confirm the partition layout and let the installer complete.
9. When prompted, change the root password and reboot (remove the USB).

---

## Step 3 – OPNsense Initial Console Configuration

On first boot, OPNsense presents a menu. Before touching the web GUI, assign interfaces from the console.

### 3.1 – Assign Interfaces

Press **1** at the main menu to assign interfaces.

```
Do you want to configure VLANs now? [y|n]: n   ← skip for now, done in GUI later

Valid interfaces are:
  igb0   00:11:22:aa:bb:01
  igb1   00:11:22:aa:bb:02
  igb2   00:11:22:aa:bb:03
  igb3   00:11:22:aa:bb:04

Enter the WAN interface name: igb0
Enter the LAN interface name: igb1
Enter optional interface names: (press Enter to finish)
```

*In this setup `igb0` faces the ISP modem/ONT and `igb1` connects to the Netgear switch trunk port.*

### 3.2 – Set LAN IP

Press **2** to set the LAN interface IP address.

```
Enter the new LAN IPv4 address: 10.0.10.1
Enter the new LAN IPv4 subnet bit count: 24
```

OPNsense will enable DHCP on the LAN for initial access. After this, connect a laptop to any port on the Netgear switch (which connects back to `igb1` on the Protectli) and browse to `https://10.0.10.1`.

**Default Web GUI credentials:**  
- **User:** `root`  
- **Password:** `opnsense`

---

## Step 4 – OPNsense Web GUI Initial Setup Wizard

Navigate to `https://10.0.10.1` and complete the setup wizard.

1. **General Setup** – Set hostname (e.g. `fw01`), domain (e.g. `lab.local`), DNS servers (e.g. `9.9.9.9`, `1.1.1.1`).
2. **Time Server** – Accept defaults or set your preferred NTP server.
3. **WAN Interface** – Configure as DHCP (for cable modem) or PPPoE (for DSL/fiber), depending on your ISP.
4. **LAN Interface** – Confirm `10.0.10.1/24` (this becomes the MANAGEMENT VLAN gateway).
5. **Set Root Password** – Change from the default immediately.
6. **Reload** – Apply settings.

---

## Step 5 – Create VLANs in OPNsense

Navigate to **Interfaces → Other Types → VLAN**.

Click **+ Add** and create one entry per VLAN:

| Parent Interface | VLAN Tag | Description |
|-----------------|----------|-------------|
| igb1            | 20       | TRUSTED     |
| igb1            | 30       | LAB         |
| igb1            | 40       | IOT         |
| igb1            | 50       | GUEST       |

> **Note on MANAGEMENT (VLAN 10):** There is no VLAN 10 sub-interface in OPNsense. The physical `igb1` interface *is* the MANAGEMENT network – it carries VLAN 10 traffic as **untagged** frames. All other VLANs (20–50) are tagged 802.1Q sub-interfaces on top of `igb1`. The Netgear trunk port must therefore send VLAN 10 frames **untagged** and all other VLAN frames **tagged** (see Step 10.3).

After saving, assign each VLAN as a new interface:

1. Go to **Interfaces → Assignments**.
2. In the **New interface** dropdown at the bottom, select each `vlan0.X` device and click **+ Add**.
3. Rename them to their purpose (OPT1 → TRUSTED, OPT2 → LAB, etc.).

---

## Step 6 – Configure VLAN Interfaces

For **each** VLAN interface (Interfaces → [VLAN Name]):

- **Enable interface:** ✓
- **IPv4 Configuration Type:** Static IPv4
- **IPv4 Address:** Gateway IP for that subnet (see table below)
- **IPv4 Subnet:** `/24`

| Interface | IPv4 Address | Subnet |
|-----------|-------------|--------|
| TRUSTED   | 10.0.20.1   | /24    |
| LAB       | 10.0.30.1   | /24    |
| IOT       | 10.0.40.1   | /24    |
| GUEST     | 10.0.50.1   | /24    |

Save and **Apply Changes** after each interface.

---

## Step 7 – Configure DHCP for Each VLAN

Navigate to **Services → DHCPv4** and configure a DHCP pool for each interface:

| Interface | Range Start  | Range End    | DNS Servers    |
|-----------|-------------|--------------|----------------|
| LAN (MGMT)| 10.0.10.100 | 10.0.10.200 | 10.0.10.1      |
| TRUSTED   | 10.0.20.100 | 10.0.20.200 | 10.0.20.1      |
| LAB       | 10.0.30.100 | 10.0.30.200 | 10.0.30.1      |
| IOT       | 10.0.40.100 | 10.0.40.200 | 10.0.40.1      |
| GUEST     | 10.0.50.100 | 10.0.50.200 | 9.9.9.9, 1.1.1.1 |

Enable **DHCP Server** on each interface and click **Save**.

---

## Step 8 – Firewall Rules

Navigate to **Firewall → Rules** and configure rules per interface.

### MANAGEMENT (LAN) – Admin Access Only

| Action | Protocol | Source      | Destination | Port | Description                  |
|--------|----------|-------------|-------------|------|------------------------------|
| Pass   | TCP/UDP  | 10.0.10.0/24| any         | any  | Full access for admin hosts  |
| Block  | *        | *           | *           | *    | Default deny                 |

### TRUSTED – Workstations

| Action | Protocol | Source       | Destination  | Port     | Description                 |
|--------|----------|--------------|--------------|----------|-----------------------------|
| Block  | *        | TRUSTED net  | 10.0.10.0/24 | *        | No access to management     |
| Pass   | *        | TRUSTED net  | any          | *        | Internet + inter-VLAN OK    |

### LAB – Isolated Lab Machines

| Action | Protocol | Source   | Destination  | Port | Description                        |
|--------|----------|----------|--------------|------|------------------------------------|
| Block  | *        | LAB net  | 10.0.10.0/24 | *    | No access to management            |
| Block  | *        | LAB net  | 10.0.20.0/24 | *    | No access to trusted workstations  |
| Pass   | *        | LAB net  | any          | *    | Internet allowed                   |

### IOT – Isolated IoT Devices

| Action | Protocol | Source   | Destination   | Port | Description                    |
|--------|----------|----------|---------------|------|--------------------------------|
| Block  | *        | IOT net  | 10.0.10.0/24  | *    | No management access           |
| Block  | *        | IOT net  | 10.0.20.0/24  | *    | No workstation access          |
| Block  | *        | IOT net  | 10.0.30.0/24  | *    | No lab access                  |
| Pass   | TCP      | IOT net  | any           | 80,443 | Internet HTTP/HTTPS only     |

### GUEST – Completely Isolated

| Action | Protocol | Source     | Destination   | Port     | Description              |
|--------|----------|------------|---------------|----------|--------------------------|
| Block  | *        | GUEST net  | 10.0.0.0/8    | *        | No access to private IPs |
| Pass   | *        | GUEST net  | !10.0.0.0/8   | *        | Internet only            |

> **Tip:** OPNsense evaluates firewall rules top-to-bottom, first match wins. Place Block rules before Pass rules on each interface.

---

## Step 9 – NAT / Outbound Masquerade

Navigate to **Firewall → NAT → Outbound**.

Set mode to **Hybrid Outbound NAT** so you can add custom rules while keeping automatic rules for the WAN.

Verify that automatic rules cover all VLAN subnets outbound through the WAN interface. If any subnet is missing:

1. Click **+ Add**.
2. Interface: `WAN`
3. Source: `<VLAN subnet>` (e.g. `10.0.30.0/24`)
4. Translation / target: **Interface address**
5. Save and apply.

---

## Step 10 – Netgear Switch VLAN Configuration

The Netgear GS308E/GS316E is configured via its web UI. Connect a laptop directly to any switch port and browse to `http://192.168.0.239` (default IP) or use the ProSAFE Plus utility to discover it.

### 10.1 – Set a Static Management IP on the Switch

1. Log in (default password is on the label, typically `password`).
2. Go to **System → Management → IP Configuration**.
3. Disable DHCP and set:
   - IP Address: `10.0.10.2`
   - Subnet Mask: `255.255.255.0`
   - Default Gateway: `10.0.10.1`
4. Apply. Reconnect to `http://10.0.10.2`.

### 10.2 – Enable 802.1Q VLAN Support

Go to **VLAN → 802.1Q → Advanced → VLAN Configuration**.

Add each VLAN ID:

| VLAN ID | VLAN Name   |
|---------|-------------|
| 10      | MANAGEMENT  |
| 20      | TRUSTED     |
| 30      | LAB         |
| 40      | IOT         |
| 50      | GUEST       |

Click **Add** for each entry.

### 10.3 – Configure Port Membership (Tagged / Untagged)

Navigate to **VLAN → 802.1Q → Advanced → VLAN Membership**.

**Port 1 – Uplink (Trunk to OPNsense `igb1`):**

| VLAN ID | Port 1    |
|---------|-----------|
| 10      | Untagged  |
| 20      | Tagged    |
| 30      | Tagged    |
| 40      | Tagged    |
| 50      | Tagged    |

> VLAN 10 is sent **untagged** on the trunk so that OPNsense's physical `igb1` interface (which has no VLAN sub-interface for MANAGEMENT) receives it as plain Ethernet frames. VLANs 20–50 are sent tagged so OPNsense can distinguish them via the `.20`/`.30`/`.40`/`.50` sub-interfaces.

**Access Ports (examples):**

| Port | VLAN | Tagged/Untagged | Use                    |
|------|------|-----------------|------------------------|
| 2    | 10   | Untagged        | Management workstation |
| 3    | 20   | Untagged        | Trusted workstation    |
| 4    | 20   | Untagged        | Trusted workstation    |
| 5    | 30   | Untagged        | Lab VM host / server   |
| 6    | 30   | Untagged        | Lab device             |
| 7    | 40   | Untagged        | IoT device             |
| 8    | 50   | Untagged        | Guest device           |

> Set untagged ports to carry only their single VLAN; end devices do not need to understand 802.1Q tagging.

### 10.4 – Set PVID (Port VLAN ID) for Access Ports

Navigate to **VLAN → 802.1Q → Advanced → Port PVID**.

Set the PVID of each access port to match the untagged VLAN above:

| Port | PVID |
|------|------|
| 2    | 10   |
| 3    | 20   |
| 4    | 20   |
| 5    | 30   |
| 6    | 30   |
| 7    | 40   |
| 8    | 50   |

The trunk port (Port 1) PVID should be set to **10** so that any untagged frames arriving from OPNsense are placed in the MANAGEMENT VLAN.

Click **Apply**.

---

## Step 11 – Final Physical Topology

```
Internet (ISP modem/ONT)
        |
     [igb0] WAN
   ┌─────────────────────────────┐
   │     Protectli FW4B          │
   │     OPNsense                │
   │     igb1 (LAN/trunk)        │
   └──────────┬──────────────────┘
              │  802.1Q trunk (all VLANs tagged)
   ┌──────────┴──────────────────┐
   │   Netgear GS308E Switch     │
   │  Port 1: Trunk → OPNsense  │
   │  Port 2: VLAN 10 (MGMT)   │
   │  Port 3: VLAN 20 (TRUSTED) │
   │  Port 4: VLAN 20 (TRUSTED) │
   │  Port 5: VLAN 30 (LAB)     │
   │  Port 6: VLAN 30 (LAB)     │
   │  Port 7: VLAN 40 (IOT)     │
   │  Port 8: VLAN 50 (GUEST)   │
   └─────────────────────────────┘
```

---

## Step 12 – Verification & Testing

### 12.1 – Verify DHCP Leases

On a device connected to a specific port, confirm it receives the correct IP from the expected subnet.

```bash
ip addr show
# Should show 10.0.X.Y/24 matching the port's VLAN
```

Check active leases in OPNsense under **Services → DHCPv4 → Leases**.

### 12.2 – Test Inter-VLAN Isolation

From a **LAB** host, try to ping the **TRUSTED** gateway – it should fail:

```bash
ping 10.0.20.1
# Expected: 100% packet loss (blocked by firewall rule)
```

From a **TRUSTED** host, ping the **LAB** gateway – confirm allowed or denied per your rules:

```bash
ping 10.0.30.1
```

### 12.3 – Test Internet Access

From any non-GUEST host:

```bash
curl -I https://example.com
# Expected: HTTP/2 200
```

From a **GUEST** host, verify private IPs are unreachable:

```bash
ping 10.0.20.1
# Expected: 100% packet loss

curl -I https://example.com
# Expected: HTTP/2 200 (internet still works)
```

### 12.4 – Verify Firewall Rules Hit Counts

In OPNsense, go to **Firewall → Diagnostics → Statistics** (or hover over rules in the rule list) to confirm the correct rules are being matched.

### 12.5 – Check OPNsense System Logs

```
System → Log Files → Firewall
```

Filter by source IP to trace traffic and confirm drops are expected.

---

## Optional Enhancements

- **DNS Resolver (Unbound):** Enable under **Services → Unbound DNS** for local DNS resolution and DNS-over-TLS to Quad9.
- **IDS/IPS (Suricata / Zenarmor):** Add via **System → Firmware → Plugins** → install `os-suricata` or `os-zenarmor` for inline traffic inspection.
- **pfBlockerNG equivalent (os-unbound-plus):** Block ads and malicious domains at the DNS level.
- **VPN (WireGuard / OpenVPN):** Configure remote access back into the TRUSTED or MANAGEMENT VLAN via **VPN → WireGuard** or **VPN → OpenVPN**.
- **LAGG / Link Aggregation:** If your Netgear switch supports it, bond two uplink ports for redundancy.
- **Captive Portal on GUEST VLAN:** Configure under **Services → Captive Portal** to require acceptance of terms before granting internet.

---

## Key Takeaways

- The Protectli Vault running OPNsense gives you a powerful, x86 firewall with full routing, NAT, DHCP, DNS, and IDS/IPS capability at home lab cost.
- 802.1Q VLANs on the Netgear managed switch allow a single physical uplink to carry multiple isolated networks to OPNsense.
- Proper firewall rules between VLANs ensure lab/IoT/guest traffic cannot reach management or trusted workstations.
- Always assign non-default management IPs to both OPNsense and the switch, and limit management access to the dedicated VLAN.
- Testing isolation with ping and curl after setup catches misconfigured PVID or missing firewall rules early.

---

**Disclaimer:** This walkthrough is for educational and home lab purposes only. Always ensure your lab environment complies with applicable laws and network policies.
