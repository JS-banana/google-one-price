# Google One / Gemini iOS Price Tracker

[简体中文](README.zh-CN.md)

Compare Google One and Gemini subscriptions across 60 iOS App Store markets with a Chinese-language price tracker. [Open the live site](https://googleone.laifuyou.com)

## Features

- Compare plans by introductory monthly price, first-year monthly average, or renewal monthly price. Rankings use CNY equivalents and show the original currency alongside them.
- See the introductory price, offer duration, and renewal price together, with warnings for steep renewal increases.
- Sort the 60-market price matrix by plan, filter by region, and search by market or currency.
- Browse individual markets for plan prices and historical quotes, and check the change log for recent updates.

## Quick start

Use Node.js 22 and the pinned pnpm version. [.nvmrc](.nvmrc) · [package.json](package.json)

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm test
pnpm build
```

Run `pnpm dev` to start the development server and `pnpm build` to generate `dist/`. The shell setting keeps Lefthook setup enabled and uses the prebuilt platform binaries supplied by Wrangler's dependencies.

The site uses Astro, TypeScript, Tailwind CSS v4, and an interactive matrix island. Zod validates the normalized snapshot and Vitest runs the tests. Cloudflare Workers serves the static build.

## Refresh the data

1. Save the new workbook locally as `data/source/prices.xlsx`, or use its existing path. Git ignores `.xlsx` files under `data/source/`.
2. Run `pnpm data:import data/source/prices.xlsx` to validate the workbook and generate `src/data/snapshot.json`.
3. Run `pnpm data:check data/source/prices.xlsx` against the same workbook, then review the snapshot diff.
4. Run `pnpm test` and `pnpm build`. Commit the snapshot and get it onto `main`. A successful CI run on `main` triggers deployment.

CI builds from the checked-in snapshot. For the workbook schema and reconciliation rules, see the [data source guide](docs/data-source.md).

## Project structure

```text
scripts/                 Workbook import and reconciliation
src/data/snapshot.json   Normalized price snapshot
src/lib/data/            Schema, price calculations, and page data
src/pages/               Astro static routes
public/                  Flags, fonts, and other static assets
docs/                    Data, design, and deployment guides
.github/workflows/       Continuous integration and production deployment
```

## Deployment and contributions

GitHub Actions builds and deploys the site to Cloudflare Workers static assets. Setup, manual releases, cache rules, and rollback are covered in the [deployment guide](docs/deployment.md).

Use English Conventional Commits, such as `fix: clarify renewal pricing`. Lefthook checks staged files and commit messages locally. CI checks the commit range on every pull request.

## License and acknowledgments

The project code and the flag SVGs from flag-icons are MIT-licensed. IBM Plex Mono is distributed under the SIL Open Font License. [Project license](LICENSE) · [flag-icons](https://github.com/lipis/flag-icons) · [Flag license](public/flags/LICENSE.txt) · [Font license](public/fonts/OFL.txt)

Prices come from monitoring public iOS App Store listings and are for reference only. The App Store determines the actual charge. Google, Google One, and Gemini are trademarks of Google LLC. This project is independent of Google.
