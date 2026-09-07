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

Use Node.js 24+ and the pinned pnpm version.

```sh
pnpm install
pnpm dev
```

Open [localhost:3000](http://localhost:3000). Select **Connect an instance**, enter its URL and API key, and test the connection. API keys are in **Settings > General > Security** in Sonarr/Radarr. Quality profiles, root folders, indexers, and download clients are configured in those applications.

The interface uses Base UI, PandaCSS, Phosphor icons, Geist, and TanStack Query. React Compiler is enabled. Validation uses Zod and tests use Vitest with React Testing Library.

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
pnpm test --run
pnpm exec tsc --noEmit
pnpm lint
pnpm build
```

Vitest covers configuration persistence, request validation, origin checks, secret redaction, instance merging, search/add/release actions, queue pagination and actions, and connection/queue UI behavior. Backend tests use isolated config directories and local HTTP mocks, not your real media services.

## Security And Scope

Arrsenal is intended for a single user on a trusted local network. It has no built-in login. Do not publish it to the internet without an authenticated reverse proxy or VPN. Same-origin mutation protection is not authentication. Reverse proxies must preserve the request host and scheme.

Sonarr/Radarr remain the source of truth. Partial instance failures are shown without hiding healthy instances. Multi-target additions report partial success so only failed targets need retrying. Episode searches use the selected instance's own episode ID. An accepted search or grab does not guarantee a completed download. Media/file deletion and download-client pause/resume controls are not implemented.

Arrsenal is not endorsed by TMDB, TheTVDB, Sonarr, or Radarr.
