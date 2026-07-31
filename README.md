# strategicdennis.github.io

Dennis Murphy's personal academic website. Built with [Hugo](https://gohugo.io/) and deployed via GitHub Pages using GitHub Actions.

## Structure

- `content/_index.md` — homepage content and front matter (name, tagline, bio, affiliations)
- `data/` — publications, teaching, presentations, writing, news, awards
- `layouts/` — page templates
- `assets/css/style.css` — stylesheet
- `static/files/cv.pdf` — CV
- `static/images/photo.png` — headshot

See [UPDATING.md](UPDATING.md) for how to make common edits.

## Local development

```bash
hugo server
```

Open `http://localhost:1313/`.

## Deployment

Pushes to `main` trigger `.github/workflows/deploy.yml`, which builds the site with Hugo and publishes it to GitHub Pages. Enable Pages once under **Settings → Pages → Source: GitHub Actions**.
