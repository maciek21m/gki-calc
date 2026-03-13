# GKI Ketosis Calculator — Project Summary

## What This App Does

Offline-first PWA for calculating and tracking the **Glucose Ketone Index (GKI)**. Formula: `GKI = Glucose (mmol/L) / Ketones (mmol/L)`. If glucose is in mg/dL, divide by 18 first. Users enter glucose + ketones, see live GKI result with color-coded ketosis level, save records, view a chart over time, and import/export CSV.

**Live:** https://maciek21m.github.io/gki-calc/  
**Repo:** https://github.com/maciek21m/gki-calc

## Tech Stack

- **Vanilla HTML/CSS/JS** — no React, no framework (the `src/` folder is legacy boilerplate from the MKStack template and is NOT used)
- **Chart.js 4.x** + chartjs-adapter-date-fns (loaded via CDN)
- **Vite** for bundling (`vite.config.ts` sets `base: '/gki-calc/'` for GitHub Pages)
- **localStorage** for data persistence (key: `gki_records_v1`)
- **Service Worker** (`sw.js`) for offline caching
- Deployed via **GitHub Pages** (`.github/workflows/deploy.yml`)

## Key Files

| File | Purpose |
|------|---------|
| `index.html` | Main app HTML (single page) |
| `app.js` | All app logic: calculator, chart, records, CSV import/export, SW management |
| `app-utils.js` | Storage helpers (`saveRecord`, `loadRecords`, `overwriteRecords`, `exportCSV`) |
| `style.css` | Dark theme styles (black bg, white text, compact mobile-first) |
| `sw.js` | Service worker with precaching and offline fallback |
| `manifest.json` | PWA manifest (icons, start_url, scope) |
| `sample-import.csv` | Example semicolon-separated CSV for testing import |
| `public/` | Static assets copied to dist by Vite (icons, manifest, sw.js, robots.txt) |
| `scripts/bump-version.cjs` | Bumps semver in package.json, updates index.html title+h1, commits |
| `scripts/copy-404.cjs` | Cross-platform copy of index.html → 404.html after build |
| `vite.config.ts` | Vite config with `base: '/gki-calc/'` and dev server on port 8080 |
| `.github/workflows/deploy.yml` | GitHub Actions workflow: build + deploy to Pages on push to main |

## Design Decisions

- **Black & white theme** — black background, white text, no theme toggle
- **Version displayed** in `<title>` and subtitle (not H1). H1 shows just "GKI Ketosis Calculator"
- **Versioning:** semver x.y.z in `package.json`. **Bump patch on every commit.** Update title + subtitle in `index.html` to match. Use `npm run bump:patch` locally or manually edit.
- **CSV format:** semicolon-separated. Columns: `date;time;timezone;glucose;glucose_unit;ketones;gki;note`. GKI column can be empty (auto-computed on import). Time accepts `h:mm` and `hh:mm`.
- **Chart:** GKI-only line chart with colored ketosis zone backgrounds (purple/blue/green/yellow/grey). Default range: "Last 7 entries". No checkboxes. X-axis: `MMM d`. Tooltips: `yyyy-mm-dd HH:mm`.
- **Records:** Sorted newest-first. Show 3 entries with "Show X more entries" / "Show less" toggle. Each entry: GKI + date + time + values on one line; note on separate line if present.
- **Buttons:** "Calculate & Save" (primary, white) and "Calculate only" (outline). Edit/Del buttons are small, inline with each record.
- **Footer:** "Built with Shakespeare" linking to shakespeare.diy
- **PWA icons:** PNG icons in `public/` (192, 512, maskable-512). SVG also included. Firefox Android may not show manifest icons — use Chrome for proper PWA install.
- **Service worker:** Precaches local assets on install. Caches CDN scripts on first fetch. Network-first for navigation. Dev mode (localhost/shakespeare.diy) auto-unregisters SW and clears caches.
- **GitHub Pages base path:** `/gki-calc/` — set in `vite.config.ts`, `manifest.json`, and SW registration uses relative `./sw.js`.

## Build & Deploy

```bash
npm ci              # Install deps
npm run dev         # Dev server at localhost:8080
npm run build       # Production build → dist/
npm run bump:patch  # Bump version, update index.html, rebuild, commit
```

Push to `main` → GitHub Actions auto-deploys to Pages.

## Known Quirks

- The `src/` directory contains React/TypeScript boilerplate from the original MKStack template. It is NOT used by the app. The actual app is `index.html` + `app.js` + `app-utils.js` + `style.css`. Vite builds from `index.html` as entry point.
- `package.json` has `"type": "module"` so all `.js` files are ESM. Helper scripts use `.cjs` extension for CommonJS.
- The `cp` command in npm scripts was replaced with `node scripts/copy-404.cjs` for Windows compatibility.
- Firefox on Android doesn't reliably show PWA manifest icons on home screen shortcuts. Chrome works correctly.
- The Shakespeare preview environment has trouble loading external CSS/JS due to service worker caching. The dev-mode SW clear in app.js mitigates this.
