# Security Walkthroughs

GitHub Pages site for TryHackMe, Hack The Box, and other security walkthroughs using the Hacker Jekyll theme.

## 🚀 Live Site

Visit the site at: [https://cta0930.github.io](https://cta0930.github.io)

## 📝 About

This site documents cybersecurity challenges, walkthroughs, and lab projects including:

- **TryHackMe** rooms and challenges
- **Hack The Box** machines (retired only)
- **Network Lab** configurations
- **Security Projects** and tools

## 🛠️ Local Development

### Prerequisites

- Ruby 2.7 or higher
- Bundler

### Setup

```bash
# Install dependencies
bundle install

# Run local server
bundle exec jekyll serve

# View site at http://localhost:4000
```

## ✍️ Adding New Walkthroughs

### Create a New Post

1. Create a new file in `_posts/` directory
2. Use the naming format: `YYYY-MM-DD-title.md`
3. Add front matter with metadata

### Post Template

```markdown
---
layout: post
title: "Your Walkthrough Title"
date: YYYY-MM-DD
category: tryhackme  # or hackthebox, network-labs, security-projects
tags: [tag1, tag2, tag3]
---

# Your Content Here

## Enumeration

## Exploitation

## Privilege Escalation

## Lessons Learned
```

### Categories

- `tryhackme` - TryHackMe challenges
- `hackthebox` - Hack The Box machines
- `network-labs` - Network configuration labs
- `security-projects` - Security tools and projects

## 📂 Project Structure

```
.
├── _config.yml           # Site configuration
├── _posts/               # Blog posts (walkthroughs)
├── category/             # Category pages
│   ├── tryhackme/
│   ├── hackthebox/
│   ├── network-labs/
│   └── security-projects/
├── index.md              # Homepage
├── Gemfile               # Ruby dependencies
└── README.md             # This file
```

## 🎨 Theme

This site uses the [Hacker theme](https://github.com/pages-themes/hacker) which provides a terminal-style aesthetic perfect for cybersecurity content.

## 📜 License

See [LICENSE](LICENSE) file for details.

## ⚠️ Disclaimer

All walkthroughs are for educational purposes only. Content is only published for:
- Retired/publicly available challenges
- Challenges where writeups are permitted
- Personal lab environments

Always follow responsible disclosure guidelines and obtain proper authorization before testing any system.
