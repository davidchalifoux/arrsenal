# Arrsenal landing site

The marketing site for Arrsenal, built with Next.js, Panda CSS, and Biome. It is a separate project from the app: it has its own dependencies and lockfile and is never part of the app's Docker image or standalone build.

## Develop

```sh
cd site
bun install --frozen-lockfile
bun run dev
```

Open [localhost:3100](http://localhost:3100). The port differs from the app's 3000, so both can run together.

## Check and build

```sh
bun run lint    # Biome, extending the repository's root biome.json
bun run format
bun run build   # Static export to site/out
```

The site is a static export, so `out/` can be deployed to any static host. Set `SITE_URL` (for example `SITE_URL=https://arrsenal.example.com bun run build`) so Open Graph images resolve to absolute URLs.

The **Site** GitHub Actions workflow lints and builds pull requests that touch `site/`.

## How it stays out of the app

- The root `tsconfig.json` excludes `site`, and the app's Panda config only scans `src/`.
- The app's `next.config.ts` excludes `site/` from output file tracing.
- `.dockerignore` excludes `site`.
- `release-please-config.json` excludes `site` from the app package, so site changes do not cut app releases. Still use Conventional Commit titles, such as `docs(site): ...` or `feat(site): ...`.

## Assets

`public/library.png` is a copy of `docs/images/library-demo.png`. Update it when the README screenshot changes.
