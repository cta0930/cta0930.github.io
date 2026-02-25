# Security Walkthroughs

GitHub Pages site for TryHackMe, Hack The Box, and other security walkthroughs using the Chirpy Jekyll theme.

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
categories: [TryHackMe]  # or [HackTheBox], [NetworkLabs], [SecurityProjects]
tags: [tag1, tag2, tag3]
---

# Your Content Here

## Enumeration

## Exploitation

## Privilege Escalation

## Lessons Learned
```

### Categories

- `TryHackMe` - TryHackMe challenges
- `HackTheBox` - Hack The Box machines
- `NetworkLabs` - Network configuration labs
- `SecurityProjects` - Security tools and projects

## 📂 Project Structure

```
.
├── _config.yml           # Site configuration
├── _posts/               # Blog posts (walkthroughs)
├── _tabs/                # Navigation tab pages (about, archives, categories, tags)
├── assets/               # Images and other assets
├── index.html            # Homepage
├── Gemfile               # Ruby dependencies
└── README.md             # This file
```

## 🎨 Theme

This site uses the [Chirpy theme](https://github.com/cotes2020/jekyll-theme-chirpy) which provides a clean, responsive layout with built-in support for categories, tags, archives, and table of contents — well-suited for technical writeups and walkthroughs.

## 📜 License

See [LICENSE](LICENSE) file for details.

## ⚠️ Disclaimer

All walkthroughs are for educational purposes only. Content is only published for:
- Retired/publicly available challenges
- Challenges where writeups are permitted
- Personal lab environments

Always follow responsible disclosure guidelines and obtain proper authorization before testing any system.
