---
layout: post
title: "Microsoft Entra ID and Intune: A Safe Zero Trust Device-Compliance Rollout"
date: 2026-09-28
categories: [CloudSecurity, Security]
tags: [entra-id, intune, conditional-access, device-compliance, zero-trust, windows, microsoft-365]
---

# Microsoft Entra ID and Intune: A Safe Device-Compliance Rollout

## Scope and confidentiality

This walkthrough is a **fictional-tenant reference procedure** informed by device-registration, compliance, and Conditional Access troubleshooting. It is **not** a description or export of an employer's tenant and does not assert that the example policy is active anywhere. Tenant names, identities, groups, devices, licenses, event IDs, and screenshots must be replaced or withheld before publication.

**Outcome:** A pilot Windows device reports its compliance state to Intune, Entra Conditional Access evaluates that state in report-only mode, and an administrator verifies the impact before any enforcement. Device compliance is one signal in a Zero Trust design; it is not a substitute for MFA, least privilege, application controls, or endpoint detection.

## 1. Plan the pilot and recovery path

Prerequisites include the relevant Intune and Entra licensing, administrative roles, an approved managed Windows test device, a test user, a small pilot group, and a documented emergency-access procedure. Confirm licensing and supported platforms in [Microsoft's current documentation](https://learn.microsoft.com/en-us/entra/identity/conditional-access/policy-all-users-device-compliance).

Use **fictional** group names such as `LAB-CA-DeviceCompliance-Pilot` and `LAB-CA-Emergency-Exclude`. Emergency access must be independently secured, monitored, tested, and excluded from policies that could lock out all administrators. Avoid an all-users/all-resources enforcement change as a first experiment. Schedule a rollback owner and a second working administrative session.

```text
Managed Windows endpoint
      | enroll / register
      v
Microsoft Intune ----> evaluated compliance status
      |                         |
      +-------------------------v
                        Microsoft Entra ID
                              |
                 Conditional Access (report-only)
                              |
                    protected test application
```

**Important:** Device registration, Entra join, Intune enrollment, and Intune compliance are different states. An `AzureAdJoined : YES` result does not, by itself, prove the device is enrolled in Intune or compliant.

## 2. Establish an observable device baseline

On the Windows test machine, run the following in a regular terminal. Review results locally; do not publish raw tenant IDs, device IDs, user principal names, certificate thumbprints, or registration URLs.

```powershell
dsregcmd /status
Get-ComputerInfo | Select-Object WindowsProductName, WindowsVersion, OsBuildNumber
```

Record the join state, workplace registration, user/device authentication status, and Intune device record **privately**. In the Intune admin center, compare the device's identity, last check-in, assigned compliance policy, per-setting compliance results, and ownership. A stale device record can be different from the active device being used to sign in.

Do not blindly run `dsregcmd /leave`, delete registration certificates, or re-enroll a production machine to troubleshoot a stale status. Those actions can interrupt SSO, BitLocker recovery workflows, application access, and management. Capture diagnostics and follow the approved recovery process first.

## 3. Assign a narrowly scoped compliance policy

In the Intune admin center, create a Windows compliance policy scoped to the pilot group. Choose settings supported by the exact Windows edition, hardware, management model, and licensing. Common candidates include BitLocker state, Secure Boot, TPM, operating-system version, and appropriate endpoint protection health; do not assume every setting is reported by every enrollment type.

Document for each setting: expected value, applicability, remediation guidance, grace period, and how to recognize “not evaluated” versus “noncompliant.” Assign the policy to the pilot group and let the device check in. Verify the **actual per-setting result** before using that policy as an access gate. A device without an applicable assigned policy should not be treated as proven secure.

## 4. Add Conditional Access in report-only mode

Following the [official Microsoft device-compliance policy procedure](https://learn.microsoft.com/en-us/entra/identity/conditional-access/policy-all-users-device-compliance), create a new policy for the pilot user/group and a test resource:

1. Give it a distinctive lab name, for example `LAB-CA-Require-Compliant-Device-ReportOnly`.
2. Include only the pilot users; exclude approved emergency-access accounts.
3. Target a specific lab or test application where feasible rather than every cloud resource.
4. Choose **Grant access → Require device to be marked as compliant**; verify any additional grant controls and whether they require **all** or **one** of the selected controls.
5. Set the policy to **Report-only**, then create it.

A report-only outcome predicts policy evaluation but does not itself block a user. Review sign-in logs and the Conditional Access evaluation details for a compliant pilot device, a deliberately noncompliant lab device (if safe and available), and an unmanaged test client. Be aware that report-only compliance evaluation can still produce device-certificate prompts on some platforms; check the current platform-specific guidance before expanding scope.

## 5. Verify the decision end to end

Use the Entra sign-in log rather than inferring a decision from the browser error page alone. Inspect the specific sign-in's authentication details, device ID and state, applied Conditional Access policies, report-only result, and correlation ID. Keep identifiers in a private incident/change ticket.

| Test | Expected observation |
|---|---|
| Pilot compliant Windows device | Intune compliance evaluated and report-only policy conditions satisfied |
| Pilot unmanaged device | Report-only result indicates what enforcement would have done; no actual block from this policy |
| Out-of-scope account | Pilot policy not applied |
| Emergency-access account | Excluded as designed; separately protected and monitored |
| Stale or duplicate device | Device identity mismatch investigated before changing policy |

A successful access event is **not** proof that the pilot policy evaluated successfully; look for the individual policy's recorded result. Likewise, sign-in failures can be caused by MFA, app assignments, token/session state, or unrelated policies.

## 6. Troubleshooting playbook

**Entra joined, not compliant:** Verify MDM enrollment, user license, policy assignment, device check-in, and each compliance setting. The join command cannot fix missing assignment or an unsupported policy.

**Device appears compliant but access is denied:** Compare the sign-in's device ID against the Intune record, confirm that the browser or client passed a supported device identity, and inspect *all* applied Conditional Access policies and grant controls. Non-Microsoft browser and cross-platform certificate behaviors vary.

**New enrollment appears blocked:** Check registration/user actions, enrollment restrictions, applicable Conditional Access exclusions, licensing, and the actual failed sign-in. Do not disable every policy as a diagnostic shortcut.

**Registration task fails:** Preserve the full `dsregcmd /status` diagnostic fields and Windows event logs privately. Fix task-scheduler, service, connectivity, or identity issues using vendor-supported steps; do not copy a command sequence from another tenant without checking join type.

## 7. Enforcement decision and rollback

Only after multiple pilot sign-ins match documented expectations should a change owner consider switching the **pilot** policy from report-only to On. Verify emergency access and retain a tested rollback route. Expand by managed group in stages, observing help-desk and sign-in data after each change. If an unintended lockout occurs, disable or narrow the offending policy with the approved emergency-access account and document the change.

## References

- [Microsoft: Require device compliance with Conditional Access](https://learn.microsoft.com/en-us/entra/identity/conditional-access/policy-all-users-device-compliance)
- [Microsoft: Intune device-based Conditional Access policies](https://learn.microsoft.com/en-us/intune/device-security/conditional-access-integration/device-based-policies)
- [Microsoft: Troubleshoot Windows device registration](https://learn.microsoft.com/en-us/entra/identity/devices/troubleshoot-device-dsregcmd)
- [Microsoft: Conditional Access report-only mode](https://learn.microsoft.com/en-us/entra/identity/conditional-access/concept-conditional-access-report-only)
