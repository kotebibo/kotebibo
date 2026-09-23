# How the card is built

Two scripts, no npm dependencies.

## `generate.mjs` → `assets/header.svg`

Renders the whole card as one self-contained animated SVG.

```bash
node scripts/generate.mjs                      # uses the cached contribution data
GITHUB_TOKEN=$(gh auth token) node scripts/generate.mjs   # refreshes it
```

GitHub strips `<script>` and sanitises CSS in READMEs, but it renders SVGs embedded via `<img>`
and runs their SMIL animations — so all the motion (the typing line, the portrait scanning in
row by row) lives inside the SVG. Nothing is fetched at view time.

A GitHub Action reruns this daily and commits the result only if it changed.

### Why the canvas is small

The card is rendered at `width="100%"`, so it scales to the README column — roughly 890px on a
desktop. **A smaller canvas therefore renders larger type**, not smaller: at 620 units wide
every element appears ~1.4x the size it would at 880.

That is the whole reason the card carries so little text. Each line costs height, height costs
width-per-unit, and width-per-unit is legibility. Detail belongs in the README prose directly
underneath, where it can be as long as it likes and is selectable, searchable and linkable.
If you add a row here, expect to take one out.

### The contribution grid is currently off

`SHOW_MESH = false` at the top of the script.

The contribution calendar reports **41** contributions for the year. The commit search API
reports **647** authored in the same window:

```bash
gh api -H "Accept: application/vnd.github.cloak-preview+json" \
  "search/commits?q=author:kotebibo+author-date:>2025-09-23&per_page=1" --jq .total_count
```

The gap is the **"Include private contributions on my profile"** setting at
[github.com/settings/profile](https://github.com/settings/profile). The commits are here and
correctly attributed — 78 to `routehub-v2` in five days, linked email, default branch — GitHub
just isn't displaying them. A grid showing 41 would say "doesn't ship", which is the opposite
of true, so the card carries a track record instead.

Turn the setting on, then flip the flag. Everything else is already wired up.

## `portrait.mjs` → `assets/portrait.txt`

One-off. Only rerun when the photo changes.

```bash
node scripts/portrait.mjs path/to/headshot.jpg --cols 43 --rows 34 --crop 390:510:80:50
```

Decoding goes through `ffmpeg` to raw grayscale, so there's no image library to install. A
studio headshot sits on a blown-out white sweep; thresholding alone would also erase the
brightest parts of the face, so the background is found by **flooding inward from the border**
and only bright pixels connected to an edge are cut. What survives is stretched across the
glyph ramp.

`--crop` is `w:h:x:y` in source pixels. Pick the grid so `cols/rows ≈ (crop_w/crop_h) × 1.67`,
since a character cell is roughly 0.6 as wide as it is tall.

The source photo is gitignored — only the ASCII render is published.
