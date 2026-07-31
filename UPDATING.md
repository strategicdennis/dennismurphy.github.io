# Updating this site

Everything below can be done directly on GitHub, in the browser — click a file, click the pencil (edit) icon, make your change, and commit to `main`. The site rebuilds and goes live within about two minutes.

## Add a new paper

Open `data/papers.yaml` and add an entry under the right category (`journal`, `preprint`, `rand`, or `conference`):

```yaml
- title: "Your Paper Title"
  authors: ["Dennis Murphy", "Coauthor Name"]
  venue: "Journal or Venue Name"
  date: "Month Year"
  status: "published"   # or "under review", "working paper", etc.
  link: "https://doi.org/..."   # optional
```

If you have a PDF to host locally, upload it to `static/files/` and set `link` (or add a `pdf` field and wire it into `layouts/index.html`) to point at it, e.g. `files/your-paper.pdf`.

## Update your bio

Edit the body text in `content/_index.md` (below the `---` front matter). To change your tagline, title, department, or affiliations, edit the corresponding fields inside the front matter block at the top of that same file.

## Add a teaching entry

Edit `data/teaching.yaml` and add a new entry with `course`, `role`, `institution`, and `term`.

## Add a presentation or talk

Edit `data/presentations.yaml` and add a new entry with `title`, `venue`, and `date`.

## Add a piece of public writing

Edit `data/writing.yaml` and add a new entry with `title`, `venue`, `date`, and optionally `link`.

## Update your CV

Replace `static/files/cv.pdf` with your new file, keeping the same filename (`cv.pdf`), so the CV link in the navigation bar keeps working.

## Change your photo

Replace `static/images/photo.png` with a new image, keeping the same filename.

## Mark a paper as published

In `data/papers.yaml`, change its `status` field to `"published"` and fill in the `venue` field.

## Previewing changes locally (optional)

If you have Hugo installed (`hugo version` to check), run this from the repo root:

```bash
hugo server
```

Then open `http://localhost:1313/` in your browser. Changes to content and data files reload automatically.
