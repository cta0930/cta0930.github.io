# Quick Start Guide

This guide will help you quickly understand how to use and contribute to this GitHub Pages site.

## For Site Visitors

### Viewing Walkthroughs

- **Homepage:** [cta0930.github.io](https://cta0930.github.io)
- **Categories:**
  - [TryHackMe](https://cta0930.github.io/category/tryhackme/)
  - [Hack The Box](https://cta0930.github.io/category/hackthebox/)
  - [Network Labs](https://cta0930.github.io/category/network-labs/)
  - [Security Projects](https://cta0930.github.io/category/security-projects/)

### Navigation

- Browse all posts from the homepage
- Use category pages to filter by platform
- Each post includes tags for specific topics

## For Contributors

### Adding a New Walkthrough

1. **Create a new file** in `_posts/` directory:
   ```
   _posts/YYYY-MM-DD-title.md
   ```

2. **Add front matter:**
   ```yaml
   ---
   layout: post
   title: "Your Walkthrough Title"
   date: YYYY-MM-DD
   category: tryhackme
   tags: [tag1, tag2, tag3]
   ---
   ```

3. **Write your content** using Markdown

4. **Commit and push:**
   ```bash
   git add _posts/YYYY-MM-DD-title.md
   git commit -m "Add walkthrough: Title"
   git push
   ```

5. **GitHub Pages will build automatically** (usually within 1-2 minutes)

### Available Categories

- `tryhackme` - TryHackMe challenges
- `hackthebox` - Hack The Box machines (retired only)
- `network-labs` - Network configuration projects
- `security-projects` - Security tools and projects

### Post Template

See `_posts/2024-01-15-tryhackme-basic-pentesting.md` for a complete example.

## Site Structure

```
.
├── _config.yml              # Site configuration
├── _posts/                  # Walkthrough posts
├── category/                # Category pages
│   ├── tryhackme/
│   ├── hackthebox/
│   ├── network-labs/
│   └── security-projects/
├── assets/css/              # Custom styles
├── index.md                 # Homepage
├── about.md                 # About page
├── README.md                # Documentation
├── CONTRIBUTING.md          # Contribution guide
└── Gemfile                  # Ruby dependencies
```

## Testing Locally

If you want to test the site locally before pushing:

```bash
# Install dependencies
bundle install

# Run local server
bundle exec jekyll serve

# Visit http://localhost:4000
```

## GitHub Pages Deployment

- **Branch:** Changes pushed to `main` branch are automatically deployed
- **Build Time:** Usually 1-2 minutes after push
- **Theme:** Hacker theme (terminal-style aesthetic)
- **Custom Domain:** Can be configured in repository settings

## Customization

### Changing Site Title/Description

Edit `_config.yml`:
```yaml
title: Your Site Title
description: Your site description
```

### Adding Custom Styles

Edit `assets/css/style.scss` to customize the appearance.

### Modifying Homepage

Edit `index.md` to change the homepage content.

## Troubleshooting

### Site Not Updating

1. Check GitHub Actions for build errors
2. Verify `_config.yml` syntax is correct
3. Wait 2-3 minutes for propagation
4. Clear browser cache

### Post Not Showing Up

1. Verify filename format: `YYYY-MM-DD-title.md`
2. Check front matter YAML is valid
3. Ensure date is not in the future
4. Verify file is in `_posts/` directory

### Theme Not Loading

1. Check `remote_theme` setting in `_config.yml`
2. Verify plugins are listed correctly
3. Check GitHub Actions build logs

## More Information

- [Full Documentation](README.md)
- [Contributing Guidelines](CONTRIBUTING.md)
- [About This Site](about.md)
- [Jekyll Documentation](https://jekyllrb.com/docs/)
- [GitHub Pages Documentation](https://docs.github.com/en/pages)

## Support

For issues or questions:
- Open an issue on GitHub
- Check existing documentation
- Review sample walkthrough in `_posts/`
