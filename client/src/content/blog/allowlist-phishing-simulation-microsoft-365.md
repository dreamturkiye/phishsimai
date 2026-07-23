---
title: How to Allowlist Phishing Simulations in Microsoft 365 (Advanced Delivery)
description: Step-by-step guide to configuring Microsoft 365 Advanced Delivery so third-party phishing simulations reach the inbox instead of Junk — without weakening real threat protection.
slug: allowlist-phishing-simulation-microsoft-365
datePublished: 2026-07-22
---

If you run phishing simulations from any third-party platform, you've probably hit the same wall: the test email lands in Junk, or gets stripped by Safe Links, and half your users never see it. That isn't a bug in your simulation tool — it's Microsoft doing exactly what it's supposed to do. A good phishing simulation looks like phishing, so Exchange Online Protection filters it like phishing.

The fix isn't to make your simulations less realistic. It's to tell Microsoft 365 that a specific sender is a sanctioned test. Microsoft built a feature for precisely this: the **Advanced Delivery policy**. Here's how to set it up.

**Why normal allowlisting doesn't work**

Standard mail-flow rules and safe-sender lists don't bypass filtering for messages flagged as high-confidence phishing or malware. Microsoft blocks those overrides on purpose — "secure by default." So adding your simulation domain to a transport allow rule won't reliably work, and it can actually weaken your protection against real mail from spoofed lookalikes. Advanced Delivery is the only supported path that delivers simulations unfiltered *without* opening a hole for real attackers.

**What Advanced Delivery actually does**

When you register a sender as a third-party phishing simulation, Microsoft handles it correctly across the whole stack: filters take no action, Zero-hour Auto Purge (ZAP) leaves it alone, Safe Links wraps the URLs but won't block or detonate them at click time, and Safe Attachments won't detonate files. Critically, when a user reports the simulation with the Outlook Report button, Microsoft doesn't fire a false alert or investigation — the report just lands on the Submissions page where it belongs. Your test runs clean, your users get trained, and your SOC doesn't get noise.

**Step-by-step setup**

1. Sign in to the **Microsoft Defender portal** (security.microsoft.com) as a Security Administrator.
2. Go to **Policies & rules → Threat policies → Advanced delivery**.
3. Select the **Phishing simulation** tab and click **Add** (or **Edit** if one exists).
4. Under **Domain**, add the sending domain your simulations come from.
5. Under **Sending IP**, add the exact IP addresses your platform sends from. Both the domain *and* the IP are required — Advanced Delivery only processes mail matching both.
6. Optionally add **Simulation URLs** if your simulation links live on a domain that would otherwise be blocked at click time.
7. Click **Add**, then **Close**.

Changes take a few minutes to propagate. Send a test to one mailbox and confirm inbox placement before running a full campaign — the same "verify at real load" discipline you'd apply to any control.

**Get the domain and IPs from your vendor**

You need the precise sending domain and IPs from whatever platform you use. With PhishSim AI, these are shown in your dashboard during onboarding, along with a copy-paste checklist for both Microsoft 365 and Google Workspace — because getting simulations to the inbox is the single most common reason a program stalls, and we'd rather you clear it in five minutes than debug spam placement for a week.

**One caution**

Allowlist *only* your simulation sender's domain and IPs. Don't broaden the rule, and don't point it at a live user or admin mailbox. The whole point is a narrow, auditable exception — not a filtering bypass an attacker could ride in on.

Once Advanced Delivery is set, your simulations reach the inbox, your click and report rates reflect real behavior, and the training data you show an auditor or insurer is genuine.

*Related: choosing a tool? See our [honest KnowBe4 alternative comparison for small teams and MSPs](/blog/knowbe4-alternative-small-teams-msps).*

> **Running simulations that keep landing in spam?** PhishSim AI gives you the exact domain and IPs to allowlist during setup, so your first campaign reaches the inbox. [Start a free trial →](/signup)
