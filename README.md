# Arrsenal

One home for your Sonarr and Radarr libraries. Every title, every quality, every instance.

Arrsenal is a self-hosted Next.js client for Sonarr and Radarr's v3 APIs. It combines movies by TMDB ID and shows by TVDB ID, preserving each instance's quality profile, actual file quality, availability, and episode counts.

## Features

- Poster and list views, title search, sorting, and filters for instances, quality, and availability.
- Unified titles with independent quality targets across HD and 4K instances.
- Dedicated movie and show pages with bookmarkable URLs, metadata, and quality targets.
- Expandable show seasons and episode availability per Sonarr instance, with automatic and manual episode searches.
- Catalog lookup and multi-instance adding with a quality profile and root folder per target.
- Automatic search and manual release search, including rejection reasons and confirmed release grabs.
- Combined download queues with progress, removal/blocklisting, pending-release grabs, and import retries.
- UI-managed connections, server-side API keys, and Zod-validated local configuration. No database.
- Real instance data only; your library stays empty until you connect an instance.
- Optimized, responsive posters served through Next.js Image, preferring Sonarr/Radarr's cached covers. Missing local artwork falls back server-side to an allowed TMDB/TheTVDB source; discovery results without local covers use CDN artwork directly.

## Development

Use [Bun](https://bun.sh/) 1.4.2, the pinned runtime, package manager, and test runner.

```sh
bun install --frozen-lockfile
bun run dev
```

Open [localhost:3000](http://localhost:3000). Select **Connect an instance**, enter its URL and API key, and test the connection. API keys are in **Settings > General > Security** in Sonarr/Radarr. Quality profiles, root folders, indexers, and download clients are configured in those applications.

The interface uses Base UI, PandaCSS, Phosphor icons, Geist, and TanStack Query. React Compiler is enabled. Validation uses Zod and tests use Bun with React Testing Library and jsdom.

## App Structure

Explicit App Router pages live under `src/app/(library)/`: the library index,
movies, shows, missing media, discovery, queue, settings, and separate
`movies/[id]` and `shows/[id]` detail routes. The shared layout keeps navigation
and global dialogs mounted between pages; it does not select or render screens.

Pages render their shell without waiting for Sonarr/Radarr. Client components
fetch unified data through Next.js API routes using one persistent TanStack
Query client. The library categories share a cached library query; episode
details, queue activity, and instance options load independently. Library and
connection data remain fresh for one minute, queue data for ten seconds, and
inactive queries remain cached for thirty minutes. Active views poll as needed;
background refetches retain existing content. Mutations invalidate affected
queries rather than refreshing the entire Next.js route.

Media data loads after JavaScript initializes on a cold visit; it is not embedded
in server-rendered HTML. Detail routes validate URL encoding on the server and
show unavailable-title states after client fetching. API keys, configuration,
merging, and all upstream requests remain exclusively server-side.

## Docker

Published releases are available at `ghcr.io/davidchalifoux/arrsenal` for `linux/amd64` and `linux/arm64`. Use `:latest` for the most recently published release or pin a version such as `:0.2.0` (image version tags omit the `v` prefix).

To use a published image, replace `build: .` in `compose.yaml` with `image: ghcr.io/davidchalifoux/arrsenal:latest`, then run:

```sh
docker compose pull
docker compose up -d
```

To build locally with the checked-in Compose configuration:

```sh
docker compose up --build -d
```

The multi-stage image runs as a non-root user and persists configuration in the `arrsenal-config` volume at `/config`. The default published address is `127.0.0.1:3000`. Stop any existing dev server on that port or change the host port in `compose.yaml`.

- For Sonarr/Radarr on the host machine, use `http://host.docker.internal:8989` or `http://host.docker.internal:7878`, not `localhost`.
- For services on a shared Docker network, use their service names and internal ports, and attach Arrsenal to that network.
- Reverse-proxy base paths are supported, for example `http://media-server:8989/sonarr`.
- A bind mount can replace the named volume. Ensure its directory is writable by UID/GID `1000:1000`.
- Building requires network access to the package registry and Google Fonts. The built application serves Geist locally.

## Configuration

On a local installation, the file is `~/.config/arrsenal/config.json`. Set `ARRSENAL_CONFIG_DIR` to choose another directory. Docker uses `/config/config.json`.

The file is created when the first instance is saved. Writes are serialized and atomic, with directory permissions `0700` and file permissions `0600`. API keys are stored in this file in plaintext and are never returned to the browser. Protect the directory and its backups. Removing a connection only removes local configuration; it does not delete remote media or files.

A corrupt or unreadable config produces an error rather than being silently replaced. A process killed during a write can leave `config.lock`; stop all Arrsenal processes before removing a stale lock. See [backend details](src/lib/server/README.md) for the data contract, limits, and recovery instructions.

## Verification

```sh
bun run test
bunx --bun next typegen
bunx --bun tsc --noEmit
bun run lint
bun run build
```

Bun tests cover configuration persistence, request validation, origin checks, secret redaction, instance merging, search/add/release actions, queue pagination and actions, and connection/queue UI behavior. Backend tests use isolated config directories and local HTTP mocks, not your real media services.

Use `bun run test --watch` for watch mode or `bun run test tests/backend.test.mjs` for a focused suite. The test script passes `--isolate` so module mocks and DOM globals cannot leak between files; use it instead of bare `bun test`.

## Releases

[Release Please](https://github.com/googleapis/release-please) runs on pushes to `main` and can also be run manually from the Actions tab. It maintains a release PR that updates `package.json`, `.release-please-manifest.json`, and `CHANGELOG.md`. Merge that PR to create the corresponding `vX.Y.Z` tag and GitHub Release. A dependent job builds that exact release commit and publishes the multi-platform Docker image to GitHub Container Registry with `X.Y.Z` and `latest` tags. It does not publish to npm.

Squash-merge feature PRs with a [Conventional Commit](https://www.conventionalcommits.org/) message, using the PR title as the squash commit title:

- `fix: correct queue status` triggers a patch bump.
- `feat: add calendar filters` triggers a minor bump.
- `feat!: change configuration format` (or a `BREAKING CHANGE:` footer) triggers a minor bump while below `1.0.0`, and a major bump afterward.
- Routine `chore:`, `docs:`, and `refactor:` commits without breaking changes do not trigger releases on their own.

The first automated release uses `0.1.0` as its version baseline and only considers commits after `e5f0eb2ec4ed5a5f4fac302c67df5ebf08331316`. This avoids including the earlier development history. The `bootstrap-sha` setting is ignored after the first release. A setup-only chore commit will not open a release PR until a releasable change is merged.

The workflow uses the built-in `GITHUB_TOKEN`; no additional secret is required. Under **Settings > Actions > General > Workflow permissions**, **Allow GitHub Actions to create and approve pull requests** must be enabled. Review the generated release PR and run the verification commands above before merging.

PRs and release tags created with `GITHUB_TOKEN` do not automatically trigger other GitHub Actions workflows. Image publishing therefore runs in the same workflow using Release Please's outputs. If required PR checks are added, use a GitHub App token for Release Please so its PRs trigger those checks.

The image publishing job has `packages: write` permission and uses `GITHUB_TOKEN` to authenticate to GHCR. After the first successful publish, check the `arrsenal` package settings on GitHub and set its visibility to **Public** if anonymous image pulls are desired; new packages default to private. The image's source label links it to this repository.

If image publishing fails after the GitHub Release is created, use **Re-run failed jobs** on that workflow run. This preserves the successful release job's version and commit outputs. Do not start a new manual workflow run to retry publication: Release Please will not report the existing release as newly created. When retrying an older release after a newer one has shipped, note that publishing also moves `latest` to the retried version.

## Security And Scope

Arrsenal is intended for a single user on a trusted local network. It has no built-in login. Do not publish it to the internet without an authenticated reverse proxy or VPN. Same-origin mutation protection is not authentication. Reverse proxies must preserve the request host and scheme.

Sonarr/Radarr remain the source of truth. Partial instance failures are shown without hiding healthy instances. Multi-target additions report partial success so only failed targets need retrying. Episode searches use the selected instance's own episode ID. An accepted search or grab does not guarantee a completed download. Media/file deletion and download-client pause/resume controls are not implemented.

Arrsenal is not endorsed by TMDB, TheTVDB, Sonarr, or Radarr.
