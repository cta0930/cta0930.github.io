---
layout: default
title: Home
---

# Security Walkthroughs & Lab Projects

Welcome to my cybersecurity documentation site! Here you'll find detailed walkthroughs and writeups for:

- 🚩 **TryHackMe** challenges and rooms
- 📦 **Hack The Box** machines and challenges  
- 🌐 **Network Lab** configurations and projects
- 🔒 **Security** tools and techniques

## Latest Walkthroughs

<ul>
  {% for post in site.posts limit:10 %}
    <li>
      <a href="{{ post.url | relative_url }}">{{ post.title }}</a>
      <span class="post-date">{{ post.date | date: "%b %-d, %Y" }}</span>
      {% if post.category %}
        <span class="post-category">[{{ post.category }}]</span>
      {% endif %}
    </li>
  {% endfor %}
</ul>

## About

This site documents my journey through various cybersecurity challenges, capture the flag (CTF) competitions, and hands-on lab exercises. Each walkthrough includes:

- Challenge overview
- Enumeration and reconnaissance findings
- Exploitation techniques
- Post-exploitation steps
- Lessons learned

**Note:** All writeups follow responsible disclosure guidelines and are published only after challenges have been retired or permission has been granted.
