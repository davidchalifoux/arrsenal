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
bun run build
bun run start   # Serve the production build on localhost:3100
```

## Deploy

The site is meant to run on Vercel at [www.arrsenal.com](https://www.arrsenal.com). Set the Vercel project's **Root Directory** to `site`. It runs as a regular Next.js app rather than a static export, so `next/image` can optimize images from `public/` on request.

The production URL lives in `src/lib/site.ts` and feeds the canonical URL, Open Graph tags, `robots.txt`, `sitemap.xml`, and the JSON-LD structured data. Update it there if the domain changes.

`/v1/releases/latest.json` is the update feed that Arrsenal installs check. It is generated at build time from the newest `X.Y.Z` image tag on GitHub Container Registry, and the release workflow redeploys the site after each image is published. Its address and response shape (`version` and `url`) are permanent, because every install from the first release with this check onward requests it. If GHCR can't be reached, the build fails and Vercel keeps serving the previous deploy.

The **Site** GitHub Actions workflow lints and builds pull requests that touch `site/`.

## How it stays out of the app

- The root `tsconfig.json` excludes `site`, and the app's Panda config only scans `src/`.
- The app's `next.config.ts` excludes `site/` from output file tracing.
- `.dockerignore` excludes `site`.
- `release-please-config.json` excludes `site` from the app package, so site changes do not cut app releases. Still use Conventional Commit titles, such as `docs(site): ...` or `feat(site): ...`.

## Assets

`public/library.png` is a copy of `docs/images/library-demo.png`. Update it when the README screenshot changes.
