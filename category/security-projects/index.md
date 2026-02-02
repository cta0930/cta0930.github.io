---
layout: default
title: Security Projects
---

# Security Projects

This section contains documentation for various security tools, configurations, and projects.

## All Security Project Posts

<ul>
  {% for post in site.posts %}
    {% if post.category == "security-projects" %}
      <li>
        <a href="{{ post.url | relative_url }}">{{ post.title }}</a>
        <span class="post-date">{{ post.date | date: "%b %-d, %Y" }}</span>
        {% if post.tags %}
          <div class="post-tags">
            Tags: {{ post.tags | join: ", " }}
          </div>
        {% endif %}
      </li>
    {% endif %}
  {% endfor %}
</ul>

[← Back to Home](/)
