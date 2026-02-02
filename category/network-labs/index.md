---
layout: default
title: Network Labs
---

# Network Lab Projects

This section contains documentation for network configuration labs and projects.

## All Network Lab Posts

<ul>
  {% for post in site.posts %}
    {% if post.category == "network-labs" %}
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
