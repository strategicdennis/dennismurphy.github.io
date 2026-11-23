# Updating this site

Most site content can be updated directly on GitHub, in the browser — click a file, click the pencil (edit) icon, make your change, and commit to `main`. The site rebuilds and goes live within about two minutes.

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

## Update the China Security Studies Source Audit

The dashboard HTML holds the paper catalog, shared overview material, thematic memos, and profiles. Detailed records live in `static/chinastudies/sourceaudit-data/`.

- Put claim audits and paper memos in the `batch-NN.json` file under the paper code. Keep `rows` present for each paper, even if it has no claim audits yet. A new paper also needs its catalog entry in the HTML’s `auditDatasetJson` block.
- Put compact footnote records in `batch-NN-footnotes.json`, or a numbered part such as `batch-NN-footnotes-01.json` for large batches. Keep all footnotes for a paper in the same part. Preserve row IDs and claim-to-footnote links when correcting evidence.
- Update each named Shared Sources record in its existing `shared-NN.json` file or numbered part. Put new named records in the file for the earliest citing batch. The `shared-common.json` file holds source families and records without a citing paper. Give a new record the next unused collection position so export order stays stable. A source cited by several batches needs a single record with all relevant paper codes in `cited_by`.
- Rebuild the inline lookup index from the repository root after editing any batch or Shared Sources file. The index supplies counts, cross-links, and file versions.

```shell
python scripts/rebuild_sourceaudit_index.py static/chinastudies/sourceaudit.html
```

Preview through Hugo, check the affected batch and paper views, and test both full exports. For a directly opened copy, keep `sourceaudit-loader.js` and the `sourceaudit-data` folder next to `sourceaudit.html` and select that folder when prompted.
