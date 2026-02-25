---
layout: page
title: Contributing
permalink: /contributing/
---

# Contributing to Security Walkthroughs

Thank you for your interest in contributing to this security walkthroughs repository!

## Adding a New Walkthrough

### Step 1: Create a New Post File

Create a new markdown file in the `_posts` directory with the following naming convention:
```
YYYY-MM-DD-title-of-walkthrough.md
```

For example:
```
2024-01-20-tryhackme-blue.md
```

### Step 2: Add Front Matter

At the top of your file, add the YAML front matter:

```yaml
---
layout: post
title: "TryHackMe - Blue"
date: 2024-01-20
categories: [TryHackMe]
tags: [windows, eternalblue, metasploit]
---
```

**Categories:**
- `TryHackMe` - TryHackMe rooms
- `HackTheBox` - Hack The Box machines (retired only)
- `NetworkLabs` - Network configuration projects
- `SecurityProjects` - Security tools and projects

### Step 3: Write Your Walkthrough

Use the following structure for consistency:

```markdown
# [Platform] - [Challenge Name]

## Overview

**Difficulty:** Easy/Medium/Hard  
**Platform:** TryHackMe/HackTheBox/etc  
**Focus:** Main topics covered

Brief description of the challenge.

## Enumeration

### Nmap/Initial Reconnaissance
- Findings
- Services discovered
- Interesting ports

### Web/Service Enumeration
- Additional enumeration steps
- Tools used
- Findings

## Initial Access

### Exploitation
- Exploit method used
- Commands/payload
- Results

### User Flag
- Location of flag
- How to retrieve it

## Privilege Escalation

### Enumeration
- Post-exploitation enumeration
- Findings

### Root/Administrator Access
- Privilege escalation technique
- Commands used

### Root Flag
- Location of flag
- How to retrieve it

## Lessons Learned

1. Key takeaways
2. Important techniques
3. Common mistakes to avoid

## Mitigation Recommendations

- Security recommendations
- How to protect against these attacks

---

**Disclaimer:** This walkthrough is for educational purposes only.
```

### Step 4: Code Formatting

Use proper syntax highlighting for code blocks:

````markdown
```bash
nmap -sC -sV -oN scan.txt 10.10.10.1
```

```python
import socket
# Python code here
```
````

### Step 5: Preview Your Changes

If you have Jekyll installed locally:
```bash
bundle exec jekyll serve
```

Visit `http://localhost:4000` to preview your changes.

### Step 6: Commit and Push

```bash
git add _posts/YYYY-MM-DD-your-post.md
git commit -m "Add walkthrough: [Title]"
git push origin main
```

## Important Guidelines

### Responsible Disclosure

- **TryHackMe**: Can publish walkthroughs immediately after completing
- **Hack The Box**: Only publish after machines are retired
- **Other platforms**: Follow their specific disclosure policies

### Content Quality

- Use clear, descriptive language
- Include all relevant commands and outputs
- Explain *why* you're doing each step, not just *what*
- Redact sensitive information (IPs, hashes, flags if required)

### Formatting

- Use proper markdown syntax
- Include syntax highlighting for code blocks
- Keep line lengths reasonable for readability
- Use headers to organize content

### Images

If you want to include screenshots:

1. Save images in `assets/Screenshots/` with descriptive names
2. Reference in markdown:
```markdown
![Description](/assets/Screenshots/machine-name/screenshot.png)
```

## Questions?

If you have questions about contributing, please open an issue.

## Code of Conduct

- Be respectful and professional
- Focus on education and learning
- Follow responsible disclosure practices
- Give credit where credit is due
