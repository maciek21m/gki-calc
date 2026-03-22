# GKI Ketosis Calculator

A simple, offline-first PWA for calculating and tracking your **Glucose Ketone Index (GKI)** over time.

**Live demo:** [maciek21m.github.io/gki-calc](https://maciek21m.github.io/gki-calc/). Use a mobile browser to add it to your homescreen.

## What is GKI?

The Glucose Ketone Index compares blood glucose and ketone levels to estimate how deeply your body is in ketosis. The formula:

```
GKI = Glucose (mmol/L) / Ketones (mmol/L)
```

If you measure glucose in mg/dL, the app converts automatically (mg/dL / 18 = mmol/L).

| GKI | Level | Meaning |
|-----|-------|---------|
| >9 | No Ketosis | Body running on sugar |
| 6-9 | Light Ketosis | Mild fat-burning |
| 3-6 | Nutritional Ketosis | Ideal for fat loss & metabolic health |
| 1-3 | Deep Ketosis | Strong fat-burning |
| <1 | Extreme Ketosis | Used in medical therapies |

## Features

- **Live GKI calculation** as you type glucose and ketone values
- **Supports mg/dL and mmol/L** glucose units (default: mg/dL)
- **Record history** with date, time, and optional notes
- **Interactive chart** with colored ketosis zone backgrounds
- **CSV import/export** (semicolon-separated; auto-computes missing GKI on import)
- **Duplicate detection** on CSV import
- **Edit and delete** saved entries
- **Installable PWA** for Android (add to home screen from Chrome)
- **Works offline** via service worker caching

## CSV Format

Export and import use semicolon-separated values:

```csv
date;time;timezone;glucose;glucose_unit;ketones;gki;note
2026-03-09;07:35;CET;72;mgdL;2.4;;
2026-03-08;06:45;CET;88;mgdL;0.8;;Morning fast
```

- The `gki` column can be left empty; the app will compute it on import.
- Time accepts both `h:mm` and `hh:mm` formats.
- A sample file is included: `sample-import.csv`.

## Tech Stack

- Vanilla HTML/CSS/JS (no framework)
- [Chart.js](https://www.chartjs.org/) for the GKI chart
- [Vite](https://vitejs.dev/) for build/bundling
- Service Worker for offline caching
- localStorage for data persistence
- Deployed via GitHub Pages

## Development

```bash
# Install dependencies
npm ci

# Start dev server (http://localhost:8080)
npm run dev

# Production build (output: dist/)
npm run build

# Bump patch version (updates package.json + index.html, rebuilds)
npm run bump:patch
```

## Project Structure

```
index.html          Main app HTML
app.js              App logic (calculator, chart, records, CSV import/export)
app-utils.js        Storage and CSV export utilities
style.css           Styles (dark theme, compact mobile-first layout)
sw.js               Service worker (offline caching)
manifest.json       PWA manifest
public/             Static assets (icons, manifest, SW)
  icon-192.png      App icon 192x192
  icon-512.png      App icon 512x512
  icon-maskable-512.png  Maskable icon for Android
sample-import.csv   Example CSV for import testing
scripts/            Build helper scripts
  bump-version.cjs  Semantic version bump utility
  copy-404.cjs      Cross-platform 404.html copy for SPA routing
```

## Versioning

The app uses semantic versioning (x.y.z). The current version is displayed in the app subtitle.

## ⚡ Zap me if you like it: 
maciek@minibits.cash

## License

Creative Commons Zero 1.0 Universal

---

[![Edit with Shakespeare](https://shakespeare.diy/badge.svg)](https://shakespeare.diy/clone?url=https%3A%2F%2Fgithub.com%2Fmaciek21m%2Fgki-calc)
