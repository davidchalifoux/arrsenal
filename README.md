# Arrsenal

One home for your Sonarr and Radarr libraries. Every title, every quality, every instance.

Arrsenal is a self-hosted Next.js client for Sonarr and Radarr's v3 APIs. It combines movies by TMDB ID and shows by TVDB ID, preserving each instance's quality profile, actual file quality, availability, and episode counts.

## Features

- Poster and list views, title search, sorting, and filters for instances, quality, and availability.
- Unified titles with independent quality targets across HD and 4K instances.
- Catalog lookup and multi-instance adding with a quality profile and root folder per target.
- Automatic search and manual release search, including rejection reasons and confirmed release grabs.
- Combined download queues with progress, removal/blocklisting, pending-release grabs, and import retries.
- UI-managed connections, server-side API keys, and Zod-validated local configuration. No database.
- A clearly labeled sample library when no instances are configured. Demo actions never contact real instances; preview changes reset on refresh.

## Development

Use Node.js 24+ and the pinned pnpm version.

```sh
pnpm install
pnpm dev
```

Open [localhost:3000](http://localhost:3000). Select **Connect an instance**, enter its URL and API key, and test the connection. API keys are in **Settings > General > Security** in Sonarr/Radarr. Quality profiles, root folders, indexers, and download clients are configured in those applications.

The interface uses Base UI, PandaCSS, Phosphor icons, Geist, and TanStack Query. React Compiler is enabled. Validation uses Zod and tests use Vitest with React Testing Library.

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

Sonarr/Radarr remain the source of truth. Partial instance failures are shown without hiding healthy instances. Multi-target additions report partial success so only failed targets need retrying. An accepted search or grab does not guarantee a completed download. Manual episode-level selection, media/file deletion, and download-client pause/resume controls are not implemented.

Sample poster artwork is served by TMDB. Arrsenal is not endorsed by TMDB, Sonarr, or Radarr.
