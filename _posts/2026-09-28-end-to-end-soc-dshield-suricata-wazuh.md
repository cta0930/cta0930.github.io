---
layout: post
title: "End-to-End Home Lab SOC: From Honeypot and IDS Events to a Wazuh Investigation"
date: 2026-09-28
categories: [HomeLab, Security]
tags: [soc, wazuh, suricata, dshield, cowrie, opnsense, detection-engineering, incident-response]
---

# End-to-End Home Lab SOC: From Sensor to Investigation

## Scope, evidence, and privacy

This companion to the [home lab architecture](/posts/homelab-network-setup/), [DShield sensor](/posts/dshield-honeypot/), [Suricata validation](/posts/opnsense-suricata-ids-ips-validation/), and [Wazuh deployment](/posts/wazuh-docker-standalone-setup/) describes a **reference integration and test procedure**. It does **not** assert that every illustrated feed, rule, or correlation has been deployed or passed validation on my live lab. Record actual outcomes only after reproducing the tests.

All network addresses, hostnames, users, event IDs, and timestamps in this article are illustrative. Do not publish full honeypot session transcripts, downloaded attacker files, actual source IPs tied to a victim, authentic user names, Wazuh agent keys, cloud identifiers, or screenshots showing infrastructure administration.

**Objective:** Preserve native evidence from each sensor, normalize selected event fields, and investigate a reproducible alert without turning an untrusted honeypot into a trusted SIEM management client.

## 1. Architecture and trust boundaries

```text
Untrusted Internet traffic
         |
    OPNsense WAN ---- Suricata eve.json (IDS telemetry)
         |                          |
    restricted NAT                  | protected log transport
         |                          v
   isolated DShield/Cowrie ----> log relay / collector ----> Wazuh manager
         |                                |                     |
  no access to MGMT/WORK          source tags + timestamps   indexer/dashboard
                                                               |
                                                         analyst investigation
```

The diagram shows **two independent observation paths**, not a promise that Suricata observes traffic decrypted inside Cowrie. A firewall event and a honeypot event may have matching source addresses and nearby timestamps yet represent different sessions. Keep native event IDs and source attribution.

| Zone | Illustrative subnet | Allowed direction |
|---|---|---|
| Management | `10.77.90.0/24` | Analyst to dashboards and approved administration ports |
| Security services | `10.77.100.0/24` | Approved sensor logs to a dedicated collector/manager |
| Honeypot | `10.77.110.0/24` | Restricted outbound logging and maintenance only |

Avoid unrestricted honeypot-to-SIEM connectivity. Where possible, a relay accepts logs on a narrowly scoped destination and then forwards them to Wazuh; use authentication and encryption for transport crossing trust boundaries. Do not expose Wazuh enrollment, dashboard, or API ports to the Internet.

## 2. Define an observable detection case

Use a **controlled, authorized** test against the lab sensor rather than testing a third party. A useful case is a connection and failed login against Cowrie from a dedicated lab client. The expected evidence is a Cowrie connection/login event and, only if the firewall/IDS actually sees the relevant packets, a corresponding network event.

Before testing, write down privately: test window (UTC), source test system, target sensor, sensor and collector time-sync state, expected event types, and a rollback plan. Do not publish the real test IP or complete command history. A negative result is useful: it may indicate sensor placement, a log-path error, clock skew, or a rule that does not match.

## 3. Ingest Cowrie logs without weakening isolation

Cowrie commonly produces structured JSON events; confirm the path from the sensor's **installed configuration**, not a guessed distribution path. Use a dedicated, minimally privileged account to read only the intended log file. On a lab machine, inspect a small sample locally:

```bash
# Replace with the configured location on your own sensor.
sudo tail -n 3 /path/to/cowrie.json | jq '{eventid, timestamp, session, src_ip}'
```

Do not forward a whole Cowrie download directory, keystroke transcript, or credentials submitted by attackers into a broadly accessible log index. Apply a collection allowlist and retention policy. If forwarding across the honeypot boundary, use an authenticated collector/relay and allow outbound traffic only to its logging port; do not give the honeypot access to the Wazuh Docker socket or indexer.

For a file-based Wazuh agent on a **trusted log relay**, configure a `localfile` entry using the path on that relay (not a path that exists only inside the honeypot):

```xml
<localfile>
  <location>/var/log/lab-sensors/cowrie.json</location>
  <log_format>json</log_format>
</localfile>
```

This is a **configuration fragment**, not a complete `ossec.conf`. Ensure the relay actually receives a safely filtered JSON stream and that file ownership permits the agent to read it. Validate its parser with a single sanitized event before broad ingestion. The event field names and nesting must be checked against the installed Cowrie release.

## 4. Ingest Suricata event telemetry

On OPNsense, first validate Suricata's enabled interfaces and EVE output settings using the [IDS/IPS rollout guide](/posts/opnsense-suricata-ids-ips-validation/). Confirm which event families are enabled (`alert`, `flow`, `dns`, or others) and determine where the installed version writes EVE output. Do not assume a Linux path applies to OPNsense.

For a trusted Linux relay that receives a **validated JSON event stream**, a corresponding Wazuh agent fragment is:

```xml
<localfile>
  <location>/var/log/lab-sensors/suricata-eve.json</location>
  <log_format>json</log_format>
</localfile>
```

Send test events over the chosen protected collection path and verify that an EVE `alert.signature_id` remains associated with its original `flow_id`, timestamp, and sensor identity. Keep firewall logs and Suricata logs as distinct sources. If a forwarding mechanism changes or wraps the payload, inspect the resulting JSON before adding rules.

## 5. Verify parsing before writing detections

On the Wazuh manager, use the installed release's log-testing utility to submit a **sanitized** example. For Docker, locate the manager container by its actual Compose service name, then run the relevant utility in the container:

```bash
docker compose ps
# Example only: replace the service name with your Compose service.
docker compose exec wazuh.manager /var/ossec/bin/wazuh-logtest
```

Paste **one synthetic event in the actual observed schema**. Confirm the decoder and dynamic fields, then search for its unique test marker in the dashboard. A JSON parser accepting the event is not evidence that the alert rule, transport, or indexing pipeline is working.

Record the following privately:

| Check | Pass condition |
|---|---|
| Cowrie collection | One test event appears with correct source and UTC timestamp |
| Suricata collection | A locally observed EVE event appears, or its absence is explained by sensor placement |
| Decoder | Expected fields survive parsing without unintended truncation |
| Rule evaluation | Only the intended synthetic event triggers the test rule |
| Dashboard | Same unique marker is searchable after expected indexing delay |
| Retention | Event access and deletion match the lab's data-handling plan |

## 6. Correlate events cautiously

Start with an **analyst hypothesis**, not an auto-block: “A source generated repeated Cowrie authentication failures and a nearby network alert.” Use a bounded UTC time window and compare sensor identity, packet-flow context, destination, and original event IDs. NAT, DHCP reuse, shared public egress, and unsynchronized clocks can make an IP-only correlation misleading.

A useful investigation note contains the initial hypothesis, each event's source and identifier, the precise UTC time, the evidence that links events, alternative explanations, and a final disposition such as confirmed lab test, unrelated events, or inconclusive. Do not label an address malicious solely because it appears in a honeypot record.

For custom Wazuh rules, add a locally unique rule ID within the range reserved for custom rules in your deployed Wazuh version. Develop against a known-good sanitized payload, test with `wazuh-logtest`, reload through the documented supported method, and verify that an unrelated JSON event **does not** trigger it. Never paste a third-party rule into production without checking field names and regex performance.

## 7. Troubleshooting and rollback

- **Cowrie events missing:** Check the original local JSON, rotation, relay authentication, ACLs, file ownership, and Wazuh agent status in that order.
- **Suricata events missing:** Check packet visibility, selected interface, EVE event family, and export path before changing signatures.
- **Events appear but have no alerts:** Inspect the decoded event and actual rule field names; JSON ingestion and alerting are separate stages.
- **Clock discrepancies:** Correct NTP/timezone handling on all systems; retain UTC in evidence.
- **Indexing delay:** Verify manager and indexer health without exposing their APIs publicly.

Rollback by disabling only the new collection fragments or test rules, restoring their known-good configuration, and verifying existing agent telemetry still works. Avoid deleting raw evidence to make a failed test look clean.

## References and next steps

Use [Wazuh documentation](https://documentation.wazuh.com/current/) for your installed version, [Suricata EVE JSON documentation](https://docs.suricata.io/en/latest/output/eve/eve-json-output.html), and [Cowrie documentation](https://docs.cowrie.org/en/latest/) to confirm release-specific fields and paths. The [Docker hardening guide](/posts/docker-security-infrastructure-hardening/) covers the collector and SIEM host's deployment boundary.
