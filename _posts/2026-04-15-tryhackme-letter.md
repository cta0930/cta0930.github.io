---
layout: post
title: "Letter TryHackMe Walkthrough"
date: 2026-04-15
categories: [TryHackMe]
tags: [tryhackme, osint, forensics]
---

# Letter - TryHackMe Walkthrough

[Letter - TryHackMe Room](https://tryhackme.com/room/letter){:target="_blank"}

## Overview

**Difficulty:** Easy  
**Platform:** TryHackMe  
**Focus:** OSINT, Document Analysis, Historical Research

This challenge gives us a damaged envelope, a torn newspaper clipping, and a handwritten note. The objective is to recover the postal code from the delivery address and identify the full name and age of the person mentioned in the note.

The required answers are:

1. The **postal code** of the delivery address
2. The **flag** in the format `THM{Name_Surname_age}`

## Initial File Review

The ZIP archive contains the core artifacts needed to solve the room:

- `letter.png` — the damaged envelope
- `Newspaper_clipping.png` — the torn newspaper clipping
- `Note.png` — the handwritten note

At first glance, the challenge looks like a simple damaged-document recovery task, but the note quickly shows that this is really an OSINT and correlation exercise.

The best approach is to inspect each artifact separately, pull out every clue possible, and then connect them.

## Reviewing the Handwritten Note

The handwritten note gives the most useful context.

![Handwritten Note](/assets/Screenshots/letter/Note.png)

Several lines stand out immediately:

- the person mentioned is **Édouard's great-grandfather**
- he **distinguished himself that day**
- he **wasn't even old enough to have a driving licence**
- he was **the youngest member of the team**
- the writer says he would be proud to see Édouard **on the water too**

These clues tell us a lot before we even touch the clipping.

First, the target person was involved in an important event or act of bravery. Second, the person was very young at the time. Third, the mention of being "on the water" strongly suggests the story is tied to a **maritime event**, likely involving sailors, fishermen, or rescuers.

The phrase **"le benjamin de l'équipe"** is especially important because it tells us to look for the **youngest member of a named group** rather than just any individual mentioned in the article.

## Extracting the Envelope Clues

Next, I examined the damaged envelope.

![Damaged Envelope](/assets/Screenshots/letter/letter.png)

Even though it is heavily worn, the address still provides enough information to work with. The key clue is the destination, which points to **Penmarc'h**. Once that location is identified, the postal code can be confirmed.

The answer for the postal code is:

```text
29760
```

That gives us the first room answer and also provides a geographic anchor for the rest of the research.

## Investigating the Newspaper Clipping

The next artifact is the damaged clipping.

![Newspaper Clipping](/assets/Screenshots/letter/Newspaper_clipping.png)

The newspaper masthead is still recognizable as **L'Ouest-Éclair**, which is enough to use as a historical research pivot. The clipping itself is too incomplete to recover the full article directly, so the practical next step is to correlate:

- the newspaper title
- the Penmarc'h location
- a maritime incident
- a participant who was the youngest in the team

That combination leads to records of the **23 May 1925 Penmarc'h maritime catastrophe**, which is documented in local historical references. Those records include named participants and ages.

## Correlating the Historical Record

At this stage, the wording of the note becomes the deciding clue:

"Le benjamin de l'équipe"

This means we are not just looking for anyone connected to the event. We need the youngest identified participant.

Historical records associated with the 23 May 1925 event list members involved in the rescue effort and include ages. Among them, one person stands out clearly:

- **Yves-Marie Gourlaouen**
- **15 years old**
- listed as **mousse**, which supports the idea that he was the youngest member of the group

This matches the note perfectly:

- he was too young for a driving licence
- he was the youngest on the team
- he was connected to a maritime event
- he was remembered for courage on the water

At that point, the flag can be constructed directly from the required format.

## Answering the Questions

### What is the postal code of the delivery address on the envelope?

`29760`

### What is the flag?

`THM{Yves-Marie_Gourlaouen_15}`

## Key Takeaways

- Start with the handwritten note because it provides the strongest filtering clues.
- Extract location information from the envelope before doing wider research.
- Treat the newspaper name as a pivot point rather than trying to fully reconstruct the clipping itself.
- When a challenge says someone was the youngest, look for a roster, medal list, or participant list that includes ages.
- Historical OSINT challenges are often solved by correlating multiple small clues rather than recovering one single missing document.

# Room Complete!

**Final Answers:**

- Postal code: `29760`
- Flag: `THM{Yves-Marie_Gourlaouen_15}`

**Disclaimer:** This walkthrough is for educational purposes only. Always ensure your research and testing activities are authorized.