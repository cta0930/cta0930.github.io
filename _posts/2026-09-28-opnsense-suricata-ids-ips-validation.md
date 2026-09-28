---
layout: post
title: "Suricata on OPNsense: From IDS Visibility to a Measured IPS Rollout"
date: 2026-09-28
categories: [HomeLab, Security]
tags: [opnsense, suricata, ids, ips, emerging-threats, network-monitoring, wazuh, homelab]
---

# Suricata on OPNsense: From IDS Visibility to a Measured IPS Rollout

## Scope and disclosure

This guide extends the [home lab architecture](/posts/homelab-network-setup/) and documents an operationally conservative sequence: measure traffic, deploy Suricata in **alert-only IDS mode**, tune detections, and enable blocking only where the installed OPNsense release and network driver support it. No throughput measurement or live alert outcome is claimed here. All hostnames, IPs and network diagrams are examples, not a production inventory.

Read the installed version's [OPNsense IPS documentation](https://docs.opnsense.org/manual/ips.html) before applying these steps. Current OPNsense releases expose capture choices including **PCAP live mode (IDS)**, **Netmap (IPS)** and **Divert (IPS)**; the last requires rules in the newer firewall implementation. Availability and labels can vary by release, interface and driver. Do not use a historical screenshot as the source of truth.

## 1. Decide what should be inspected

```text
Internet -- OPNsense -- tagged client-VLAN trunk -- client networks
                       |
                 dedicated service and honeypot segments
```

Start with one supported physical interface and document whether that captures **both directions** of the traffic you intend to inspect. On a trunk, individual VLAN interfaces and their physical parent are not interchangeable for every IPS capture mode. In Netmap IPS mode, follow the OPNsense guidance to select **real interfaces** and, where relevant, the **VLAN parent** rather than assuming a child VLAN interface is supported. Confirm traffic coverage with packet captures before treating an absence of alerts as an absence of threats.

Decide separately whether WAN, the client trunk, service interfaces, and honeypot traffic warrant inspection. Do not assume an IDS on one interface sees east-west traffic on a different interface or same-VLAN switched conversations. Never send an untrusted honeypot directly into the management segment for easier monitoring.

## 2. Baseline the firewall and prepare a rollback

Record CPU load, memory pressure, link speed, packet loss, and latency using private monitoring before changing inspection. Update OPNsense through its supported workflow, make a secure configuration backup, and retain console or out-of-band access. Confirm NIC drivers and offload settings; **IPS mode requires hardware offloading features to be disabled** in OPNsense interface settings according to the upstream manual. Changing offload settings can affect throughput, so baseline before and after.

If Zenarmor is installed, plan interface ownership explicitly. Do not assume that two packet-inspection engines can safely claim the same netmap interface concurrently; check your exact versions and supported operating mode. Begin with Suricata on a non-conflicting interface or disable the competing engine during a controlled maintenance window. Changes to interface selection can briefly interrupt traffic.

## 3. Start alert-only and prove visibility

Under **Services → Intrusion Detection** (or the installed release's corresponding menu), enable Suricata and choose the documented **IDS / PCAP live** capture mode. Select the planned interface and enable alert logging. Configure a supported ruleset, such as a relevant **Emerging Threats Open** subset, using the repository configured for your release. Download/update rules and confirm that the engine starts without rule-parse errors.

Avoid enabling every category without review. Filter rules for the actual lab applications and risk model; categories can generate false positives or carry different licensing/usage conditions. For each changed rule or policy, record its SID/revision, source, action, reason and an owner-only rollback note.

Verify that ordinary DNS, web browsing, SSH administration and VPN access continue working. Check that Suricata actually sees **authorized test traffic** on the selected interface. You may inspect packet counters, engine status and local alerts; do not manufacture a "successful detection" screenshot if none occurred. A clean dashboard is not a detection test.

## 4. Verify alerts without publishing real traffic

Use a sanctioned, non-destructive detection test documented by the selected ruleset in an isolated lab, or replay an approved synthetic PCAP using a separate test instance. Do **not** generate arbitrary hostile traffic against Internet hosts to make an IDS counter increment. Avoid copying real usernames, tokens, client URLs, credentials, complete payloads, or public source IPs into posts or dashboards.

A useful private validation record contains the test's timestamp, capture interface, rule SID/revision, whether the alert appeared, and any false-positive investigation. When expected alerts are missing, inspect the capture interface, traffic direction, HOME_NET definition, rule enablement, rule action, and logging destination. Signature mismatch is not necessarily a sensor failure.

## 5. Promote only justified rules to IPS

After a stable alert-only period, choose the installed release's supported inline option (for example Netmap IPS with compatible physical interfaces). Disable offloading as documented, use a narrow maintenance window and monitor connectivity from a physically local administrator. A rule generally needs a **drop** action to discard matching packets; enabling the IPS engine does not convert all alerts into blocks.

Start with a small reviewed rule set. Test each candidate against legitimate traffic and keep a fast rollback path. Do not turn a broad category into drop mode without reviewing the operational consequences. Recheck VPN, DNS, video calls, updates and management access from each affected zone. If latency, loss or service failures increase, revert the policy or inspection mode before widening deployment.

## 6. Send useful telemetry to Wazuh without overclaiming integration

If centralized analysis is appropriate, enable the supported Suricata EVE syslog output and create a logging target under **System → Settings → Logging / Targets** according to the installed release. Configure the receiving Wazuh/syslog endpoint to accept only the firewall's expected source and protocol, then confirm receipt, parsing, and searchable fields on a sanitized test event. Alert forwarding does **not** mean Wazuh is automatically enforcing firewall blocks.

Consult the [Wazuh standalone deployment](/posts/wazuh-docker-standalone-setup/) for the receiving stack. Decide whether shipping packet metadata outside the firewall is permitted for your lab and apply retention controls. Keep live EVE JSON, user/device identifiers and complete payloads out of public repositories.

## 7. Troubleshooting and acceptance criteria

| Symptom | What to check |
|---|---|
| Engine fails to start | Release compatibility, selected interface, rule syntax, memory and engine logs |
| No alerts | Confirm packets are visible, rules are enabled, HOME_NET and logging are correct |
| VPN or DNS fails after IPS | Interface selection, offloading, dropped rule SID, MTU and firewall states |
| Performance regresses | CPU, interface driver, capture mode, enabled rules, packet loss |
| Wazuh has no events | OPNsense target, transport reachability, receiver listener, decoder/indexing |
| Alerts appear but no traffic is blocked | Verify actual inline mode, selected interface and explicit drop action |

Mark each acceptance check **pass, fail or not tested** based on evidence. At minimum, confirm normal authorized traffic still succeeds, one approved alert test reaches local logging, the centralized event arrives if enabled, and intentional blocks are observable without denying unrelated services. The results belong in private notes until sanitized.

**Related:** [Firewall policy validation](/posts/opnsense-vlan-firewall-validation/) · [WireGuard remote access](/posts/wireguard-opnsense-remote-access-troubleshooting/) · [DShield honeypot](/posts/dshield-honeypot/).
