---
layout: post
title: "Bricks Heist TryHackMe Walkthrough"
date: 2026-02-24
categories: [TryHackMe]
tags: [tryhackme, osint, blockchain, web-exploitation, reverse shell, wordpress]
---

# Bricks Heist - TryHackMe Walkthrough

## Overview

**Difficulty:** Easy  
**Platform:** TryHackMe  
**Focus:** Web Exploitation, WordPress,  OSINT, Blockchain

From Three Million Bricks to Three Million Transactions!

Brick Press Media Co. was working on creating a brand-new web theme that represents a renowned wall using three million byte bricks. Agent Murphy comes with a streak of bad luck. And here we go again: the server is compromised, and they've lost access.

Can you hack back the server and identify what happened there?

Note: Add <ip> bricks.thm to your /etc/hosts file.

## Enumeration

With the hosts file updated, pay a visit to bricks.thm while we spin up an nmap scan of the target:

```bash
nmap -sV -sC -Pn -p- <targetip> -oN bricks_heist.txt

Starting Nmap 7.98 ( https://nmap.org ) at 2026-02-24 22:33 -0500
Nmap scan report for bricks.thm (10.66.169.40)
Host is up (0.041s latency).
Not shown: 65531 closed tcp ports (reset)
PORT     STATE SERVICE  VERSION
22/tcp   open  ssh      OpenSSH 8.2p1 Ubuntu 4ubuntu0.11 (Ubuntu Linux; protocol 2.0)
| ssh-hostkey: 
|   3072 9e:b6:ea:fd:ad:79:91:6d:42:81:30:cd:32:f1:0f:d1 (RSA)
|   256 47:cc:26:bb:95:77:e5:d9:67:d3:e9:cc:c9:c3:60:b6 (ECDSA)
|_  256 52:fc:e6:88:5d:b2:cb:28:7e:c8:33:a8:10:a4:9b:01 (ED25519)
80/tcp   open  http     Python http.server 3.5 - 3.10
|_http-server-header: WebSockify Python/3.8.10
|_http-title: Error response
443/tcp  open  ssl/http Apache httpd
|_http-title: Brick by Brick
| tls-alpn: 
|   h2
|_  http/1.1
|_http-server-header: Apache
|_http-generator: WordPress 6.5
| ssl-cert: Subject: organizationName=Internet Widgits Pty Ltd/stateOrProvinceName=Some-State/countryName=US
| Not valid before: 2024-04-02T11:59:14
|_Not valid after:  2025-04-02T11:59:14
| http-robots.txt: 1 disallowed entry 
|_/wp-admin/
|_ssl-date: TLS randomness does not represent time
3306/tcp open  mysql    MySQL (unauthorized)
Service Info: OS: Linux; CPE: cpe:/o:linux:linux_kernel

Service detection performed. Please report any incorrect results at https://nmap.org/submit/ .
Nmap done: 1 IP address (1 host up) scanned in 39.64 seconds
```

From visiting the site while the scan was running, I used Wappalyzer to get an idea of what is driving this site.

![First Glance](/assets/Screenshots/bricks/wapp.png)

I also checked for robots.txt and found a couple options to explore.

![robots.txt](/assets/Screenshots/bricks/robots.png)

Lets also do a wpscan to see what we see. If you haven't already, you can grab an API from wpscan.com to get vulnerability data. It is limited to 25 daily requests but free is free so I can't complain.

```bash
export WP_API=<add your api>
wpscan --url https://bricks.thm --enumerate vp,vt,u --disable-tls-checks --api-token "$WP_API" --output wpscan.output

cat wpscan.output                              
_______________________________________________________________
         __          _______   _____
         \ \        / /  __ \ / ____|
          \ \  /\  / /| |__) | (___   ___  __ _ _ __ ®
           \ \/  \/ / |  ___/ \___ \ / __|/ _` | '_ \
            \  /\  /  | |     ____) | (__| (_| | | | |
             \/  \/   |_|    |_____/ \___|\__,_|_| |_|

         WordPress Security Scanner by the WPScan Team
                         Version 3.8.28
       Sponsored by Automattic - https://automattic.com/
       @_WPScan_, @ethicalhack3r, @erwan_lr, @firefart
_______________________________________________________________

[+] URL: https://bricks.thm/ [10.66.169.40]
[+] Started: Tue Feb 24 22:40:04 2026

Interesting Finding(s):

[+] Headers
 | Interesting Entry: server: Apache
 | Found By: Headers (Passive Detection)
 | Confidence: 100%

[+] robots.txt found: https://bricks.thm/robots.txt
 | Interesting Entries:
 |  - /wp-admin/
 |  - /wp-admin/admin-ajax.php
 | Found By: Robots Txt (Aggressive Detection)
 | Confidence: 100%

[+] XML-RPC seems to be enabled: https://bricks.thm/xmlrpc.php
 | Found By: Direct Access (Aggressive Detection)
 | Confidence: 100%
 | References:
 |  - http://codex.wordpress.org/XML-RPC_Pingback_API
 |  - https://www.rapid7.com/db/modules/auxiliary/scanner/http/wordpress_ghost_scanner/
 |  - https://www.rapid7.com/db/modules/auxiliary/dos/http/wordpress_xmlrpc_dos/
 |  - https://www.rapid7.com/db/modules/auxiliary/scanner/http/wordpress_xmlrpc_login/
 |  - https://www.rapid7.com/db/modules/auxiliary/scanner/http/wordpress_pingback_access/

[+] WordPress readme found: https://bricks.thm/readme.html
 | Found By: Direct Access (Aggressive Detection)
 | Confidence: 100%

[+] The external WP-Cron seems to be enabled: https://bricks.thm/wp-cron.php
 | Found By: Direct Access (Aggressive Detection)
 | Confidence: 60%
 | References:
 |  - https://www.iplocation.net/defend-wordpress-from-ddos
 |  - https://github.com/wpscanteam/wpscan/issues/1299

[+] WordPress version 6.5 identified (Insecure, released on 2024-04-02).
 | Found By: Rss Generator (Passive Detection)
 |  - https://bricks.thm/feed/, <generator>https://wordpress.org/?v=6.5</generator>
 |  - https://bricks.thm/comments/feed/, <generator>https://wordpress.org/?v=6.5</generator>
 |
 | [!] 6 vulnerabilities identified:
 |
 | [!] Title: WP < 6.5.2 - Unauthenticated Stored XSS
 |     Fixed in: 6.5.2
 |     References:
 |      - https://wpscan.com/vulnerability/1a5c5df1-57ee-4190-a336-b0266962078f
 |      - https://wordpress.org/news/2024/04/wordpress-6-5-2-maintenance-and-security-release/
 |
 | [!] Title: WordPress < 6.5.5 - Contributor+ Stored XSS in HTML API
 |     Fixed in: 6.5.5
 |     References:
 |      - https://wpscan.com/vulnerability/2c63f136-4c1f-4093-9a8c-5e51f19eae28
 |      - https://wordpress.org/news/2024/06/wordpress-6-5-5/
 |
 | [!] Title: WordPress < 6.5.5 - Contributor+ Stored XSS in Template-Part Block
 |     Fixed in: 6.5.5
 |     References:
 |      - https://wpscan.com/vulnerability/7c448f6d-4531-4757-bff0-be9e3220bbbb
 |      - https://wordpress.org/news/2024/06/wordpress-6-5-5/
 |
 | [!] Title: WordPress < 6.5.5 - Contributor+ Path Traversal in Template-Part Block
 |     Fixed in: 6.5.5
 |     References:
 |      - https://wpscan.com/vulnerability/36232787-754a-4234-83d6-6ded5e80251c
 |      - https://wordpress.org/news/2024/06/wordpress-6-5-5/
 |
 | [!] Title: WP < 6.8.3 - Author+ DOM Stored XSS
 |     Fixed in: 6.5.7
 |     References:
 |      - https://wpscan.com/vulnerability/c4616b57-770f-4c40-93f8-29571c80330a
 |      - https://cve.mitre.org/cgi-bin/cvename.cgi?name=CVE-2025-58674
 |      - https://patchstack.com/database/wordpress/wordpress/wordpress/vulnerability/wordpress-wordpress-wordpress-6-8-2-cross-site-scripting-xss-vulnerability
 |      -  https://wordpress.org/news/2025/09/wordpress-6-8-3-release/
 |
 | [!] Title: WP < 6.8.3 - Contributor+ Sensitive Data Disclosure
 |     Fixed in: 6.5.7
 |     References:
 |      - https://wpscan.com/vulnerability/1e2dad30-dd95-4142-903b-4d5c580eaad2
 |      - https://cve.mitre.org/cgi-bin/cvename.cgi?name=CVE-2025-58246
 |      - https://patchstack.com/database/wordpress/wordpress/wordpress/vulnerability/wordpress-wordpress-wordpress-6-8-2-sensitive-data-exposure-vulnerability
 |      - https://wordpress.org/news/2025/09/wordpress-6-8-3-release/

[+] WordPress theme in use: bricks
 | Location: https://bricks.thm/wp-content/themes/bricks/
 | Readme: https://bricks.thm/wp-content/themes/bricks/readme.txt
 | Style URL: https://bricks.thm/wp-content/themes/bricks/style.css
 | Style Name: Bricks
 | Style URI: https://bricksbuilder.io/
 | Description: Visual website builder for WordPress....
 | Author: Bricks
 | Author URI: https://bricksbuilder.io/
 |
 | Found By: Urls In Homepage (Passive Detection)
 | Confirmed By: Urls In 404 Page (Passive Detection)
 |
 | [!] 5 vulnerabilities identified:
 |
 | [!] Title: Bricks < 1.9.6.1 - Unauthenticated Remote Code Execution
 |     Fixed in: 1.9.6.1
 |     References:
 |      - https://wpscan.com/vulnerability/8bab5266-7154-4b65-b5bc-07a91b28be42
 |      - https://twitter.com/calvinalkan/status/1757441538164994099
 |      - https://snicco.io/vulnerability-disclosure/bricks/unauthenticated-rce-in-bricks-1-9-6
 |
 | [!] Title: Bricks < 1.9.6.1 - Unauthenticated Remote Code Execution
 |     Fixed in: 1.9.6.1
 |     References:
 |      - https://wpscan.com/vulnerability/afea4f8c-4d45-4cc0-8eb7-6fa6748158bd
 |      - https://cve.mitre.org/cgi-bin/cvename.cgi?name=CVE-2024-25600
 |      - https://www.wordfence.com/threat-intel/vulnerabilities/id/b97b1c86-22a4-462b-9140-55139cf02c7a
 |
 | [!] Title: Bricks < 1.10.2 - Authenticated (Bricks Page Builder Access+) Stored Cross-Site Scripting
 |     Fixed in: 1.10.2
 |     References:
 |      - https://wpscan.com/vulnerability/e241363a-2425-436d-a1b2-8c513047d6ce
 |      - https://cve.mitre.org/cgi-bin/cvename.cgi?name=CVE-2023-3410
 |      - https://www.wordfence.com/threat-intel/vulnerabilities/id/ba5e93a2-8f42-4747-86fa-297ba709be8f
 |
 | [!] Title: Bricksbuilder < 1.9.7 - Authenticated (Contributor+) Privilege Escalation via create_autosave
 |     Fixed in: 1.9.7
 |     References:
 |      - https://wpscan.com/vulnerability/d4a8b4de-a687-4e55-ab71-2784bef3fc55
 |      - https://cve.mitre.org/cgi-bin/cvename.cgi?name=CVE-2024-2297
 |      - https://www.wordfence.com/threat-intel/vulnerabilities/id/cb075e85-75fc-4008-8270-4d1064ace29e
 |
 | [!] Title: Bricks Builder < 2.0 - Unauthenticated SQL Injection via `p` Parameter
 |     Fixed in: 1.12.5
 |     References:
 |      - https://wpscan.com/vulnerability/c3bed5af-5f31-4993-9d37-dd843a48e57c
 |      - https://cve.mitre.org/cgi-bin/cvename.cgi?name=CVE-2025-6495
 |      - https://www.wordfence.com/threat-intel/vulnerabilities/id/5ac49a00-dabc-4cd9-9032-c038ede3fd8f
 |
 | Version: 1.9.5 (80% confidence)
 | Found By: Style (Passive Detection)
 |  - https://bricks.thm/wp-content/themes/bricks/style.css, Match: 'Version: 1.9.5'


[i] No plugins Found.


[i] Theme(s) Identified:

[+] bricks
 | Location: https://bricks.thm/wp-content/themes/bricks/
 | Readme: https://bricks.thm/wp-content/themes/bricks/readme.txt
 | Style URL: https://bricks.thm/wp-content/themes/bricks/style.css
 | Style Name: Bricks
 | Style URI: https://bricksbuilder.io/
 | Description: Visual website builder for WordPress....
 | Author: Bricks
 | Author URI: https://bricksbuilder.io/
 |
 | Found By: Urls In Homepage (Passive Detection)
 | Confirmed By:
 |  Urls In 404 Page (Passive Detection)
 |  Known Locations (Aggressive Detection)
 |   - https://bricks.thm/wp-content/themes/bricks/, status: 500
 |
 | [!] 5 vulnerabilities identified:
 |
 | [!] Title: Bricks < 1.9.6.1 - Unauthenticated Remote Code Execution
 |     Fixed in: 1.9.6.1
 |     References:
 |      - https://wpscan.com/vulnerability/8bab5266-7154-4b65-b5bc-07a91b28be42
 |      - https://twitter.com/calvinalkan/status/1757441538164994099
 |      - https://snicco.io/vulnerability-disclosure/bricks/unauthenticated-rce-in-bricks-1-9-6
 |
 | [!] Title: Bricks < 1.9.6.1 - Unauthenticated Remote Code Execution
 |     Fixed in: 1.9.6.1
 |     References:
 |      - https://wpscan.com/vulnerability/afea4f8c-4d45-4cc0-8eb7-6fa6748158bd
 |      - https://cve.mitre.org/cgi-bin/cvename.cgi?name=CVE-2024-25600
 |      - https://www.wordfence.com/threat-intel/vulnerabilities/id/b97b1c86-22a4-462b-9140-55139cf02c7a
 |
 | [!] Title: Bricks < 1.10.2 - Authenticated (Bricks Page Builder Access+) Stored Cross-Site Scripting
 |     Fixed in: 1.10.2
 |     References:
 |      - https://wpscan.com/vulnerability/e241363a-2425-436d-a1b2-8c513047d6ce
 |      - https://cve.mitre.org/cgi-bin/cvename.cgi?name=CVE-2023-3410
 |      - https://www.wordfence.com/threat-intel/vulnerabilities/id/ba5e93a2-8f42-4747-86fa-297ba709be8f
 |
 | [!] Title: Bricksbuilder < 1.9.7 - Authenticated (Contributor+) Privilege Escalation via create_autosave
 |     Fixed in: 1.9.7
 |     References:
 |      - https://wpscan.com/vulnerability/d4a8b4de-a687-4e55-ab71-2784bef3fc55
 |      - https://cve.mitre.org/cgi-bin/cvename.cgi?name=CVE-2024-2297
 |      - https://www.wordfence.com/threat-intel/vulnerabilities/id/cb075e85-75fc-4008-8270-4d1064ace29e
 |
 | [!] Title: Bricks Builder < 2.0 - Unauthenticated SQL Injection via `p` Parameter
 |     Fixed in: 1.12.5
 |     References:
 |      - https://wpscan.com/vulnerability/c3bed5af-5f31-4993-9d37-dd843a48e57c
 |      - https://cve.mitre.org/cgi-bin/cvename.cgi?name=CVE-2025-6495
 |      - https://www.wordfence.com/threat-intel/vulnerabilities/id/5ac49a00-dabc-4cd9-9032-c038ede3fd8f
 |
 | Version: 1.9.5 (80% confidence)
 | Found By: Style (Passive Detection)
 |  - https://bricks.thm/wp-content/themes/bricks/style.css, Match: 'Version: 1.9.5'


[i] User(s) Identified:

[+] administrator
 | Found By: Rss Generator (Passive Detection)
 | Confirmed By:
 |  Wp Json Api (Aggressive Detection)
 |   - https://bricks.thm/wp-json/wp/v2/users/?per_page=100&page=1
 |  Rss Generator (Aggressive Detection)
 |  Author Id Brute Forcing - Author Pattern (Aggressive Detection)
 |  Login Error Messages (Aggressive Detection)

[+] WPScan DB API OK
 | Plan: free
 | Requests Done (during the scan): 0
 | Requests Remaining: 19

[+] Finished: Tue Feb 24 22:40:22 2026
[+] Requests Done: 667
[+] Cached Requests: 56
[+] Data Sent: 172.096 KB
[+] Data Received: 194.112 KB
[+] Memory used: 267.305 MB
[+] Elapsed time: 00:00:18
```

## Exploitation — Bricks Theme RCE (CVE-2024-25600)

With a little searching and the RCE hint from the room description, I found a POC that should work for the installed theme on the wordpress site based on our wpscan output:

[GitHub](https://github.com/K3ysTr0K3R/CVE-2024-25600-EXPLOIT/blob/main/CVE-2024-25600.py){:target="_blank"}

Copy or download the POC:
```bash
nano cve-2024-25600.py
chmod +x cve-2024-25600.py
python3 ./cve-2024-25600.py -u https://bricks.thm
```

Worked as promised!

![poc](/assets/Screenshots/bricks/poc.png)

Lets grab a better reverse shell since this isn't ideal. *I did try a couple other rev shells commands to see what would work and nc mkfifo was the winner*

![revshell](/assets/Screenshots/bricks/revshell.png)

![revshell2](/assets/Screenshots/bricks/revshell2.png)

Stabalize:

```bash
python3 -c 'import pty;pty.spawn("/bin/bash")'
```

```bash
export TERM=xterm
```

ctl + z to background session

```bash
stty raw -echo;fg
```

### Question 1 — Hidden Web File
> What is the content of the hidden .txt file in the web folder?

![flag](/assets/Screenshots/bricks/flag.png)

### Question 2 - Suspicous Process Name

> What is the name of the suspicious process?

```bash
systemctl | grep running
```

You might notice a running process with the name *TRYHACK3M* which immediately stands out to me.

```bash
systemctl cat ubuntu.service

[Unit]
Description=TRYHACK3M

[Service]
Type=simple
ExecStart=/lib/NetworkManager/nm-inet-dialog
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

### Question 3 - Suspicous Service Name

> What is the service name affiliated with the suspicious process?

We know this from the previous command that gave us the output of running services...

### Question 4 - Miner Log File

> What is the log file name of the miner instance?

Navigating to the ExecStart location we can see a configuration file that must go with the suspicous process running...

```bash
cd /lib/NetworkManager
ls

VPN             nm-dispatcher           nm-openvpn-service
conf.d          nm-iface-helper         nm-openvpn-service-openvpn-helper
dispatcher.d    nm-inet-dialog          nm-pptp-auth-dialog
inet.conf       nm-initrd-generator     nm-pptp-service
nm-dhcp-helper  nm-openvpn-auth-dialog  system-connections

cat inet.conf

ID: 5757314e65474e5962484a4f656d787457544e424e574648555446684d3070735930684b616c70555a7a566b52335276546b686b65575248647a525a57466f77546b64334d6b347a526d685a6255313459316873636b35366247315a4d304531595564476130355864486c6157454a3557544a564e453959556e4a685246497a5932355363303948526a4a6b52464a7a546d706b65466c525054303d
2025-11-05 21:57:43,607 [*] confbak: Ready!
2025-11-05 21:57:43,607 [*] Status: Mining!
2025-11-05 21:57:47,612 [*] Miner()
2025-11-05 21:57:47,612 [*] Bitcoin Miner Thread Started
2025-11-05 21:57:47,612 [*] Status: Mining!
2025-11-05 21:57:49,613 [*] Miner()
```

### Question 5 - Miner Wallet Address

> What is the wallet address of the miner instance?

With the ID looking decode worthy, I need to jump into cyberchef:

[CyberChef](https://cyberchef.org){:target="_blank"}

Use magic first after copying and pasting the ID value into the input field.

You will see the recipe or just add From Hex -> From Base64 -> From Base64

The final output is the wallet address repeated twice. *That took me a minute to notice*

### Question 6 - Associated Threat Group

> The wallet address used has been involved in transactions between wallets belonging to which threat group?

Now we need to search up the blockchain address using:

[Blockchain Explorer](https://www.blockchain.com/explorer){:target="_blank"}

![Blockchain](/assets/Screenshots/bricks/blockchain.png)

Looking through the transactions, I googled each one to see if any would come up related to threat groups.

![Search](/assets/Screenshots/bricks/search.png)

Check out:
[OFAC](https://ofac.treasury.gov/recent-actions/20240220){:target="_blank"}

We can see which threat group is affiliated with the transaction now: [Press Release](https://home.treasury.gov/news/press-releases/jy2114){:target="_blank"}

## Key Takeaways

- Enumerate WordPress themes and plugins — not just core.
- WPScan + manual checks uncover high-impact vulns quickly.
- Unauthenticated RCE = instant foothold.
- Always hunt for persistence after shell access.
- Miner malware hides behind legitimate-looking services.
- Expect encoded configs (Hex/Base64).
- Blockchain analysis can aid attribution.
- Map findings to the full attack lifecycle.

# Room Complete!

**Disclaimer:** This walkthrough is for educational purposes only. Always obtain proper authorization before testing any system.