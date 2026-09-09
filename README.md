# Arrsenal

One home for your Sonarr and Radarr libraries. Every title, every quality, every instance.

Arrsenal is a self-hosted Next.js client for Sonarr and Radarr's v3 APIs. It combines movies by TMDB ID and shows by TVDB ID, preserving each instance's quality profile, actual file quality, availability, and episode counts.

## Features

- Poster and list views, title search, sorting, and filters for instances, quality, and availability.
- Unified titles with independent quality targets across HD and 4K instances.
- Dedicated movie and show pages with bookmarkable URLs, metadata, and quality targets.
- Expandable show seasons with compact per-instance availability summaries. Expand a season for a target table with availability, automatic search, manual search, and file deletion, followed by individual episode availability and searches.
- Remove movies or shows from a selected instance, keeping files by default or explicitly deleting them from disk.
- Delete individual episode files or a season's downloaded files without removing the show. Confirmations identify the instance and warn about shared episode files and automatic redownloads.
- Catalog lookup and multi-instance adding with a quality profile and root folder per target.
- Automatic search and manual release search, including rejection reasons and confirmed release grabs.
- Combined download queues with progress, removal/blocklisting, pending-release grabs, and import retries.
- UI-managed connections, server-side API keys, and Zod-validated local configuration. No database.
- Optional single-account authentication in **Settings > Security**, with local password recovery.
- **Settings > About** shows the installed version and project links, and checks GitHub's latest stable release server-side. Results are cached for one hour; an unavailable check does not block Settings.
- Real instance data only; your library stays empty until you connect an instance.
- Responsive posters use Next.js Image optimization and caching, preferring Sonarr/Radarr's cached covers. Missing local artwork falls back server-side to an allowed TMDB/TheTVDB source.

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
inactive queries remain cached for thirty minutes. Shared server-side SignalR
connections receive Sonarr/Radarr updates. Complete movie/series resources update
normalized server snapshots directly; other notifications trigger shared,
affected-instance fetches. An authenticated `/api/events` stream pushes core
library, queue, and instance snapshots without a follow-up browser request.
Each tab keeps one fixed SSE connection in the shared library layout across page
changes, with no subscription-control requests. Calendar, episode, and option
changes arrive as scoped invalidation hints: matching active queries refresh
through REST, while inactive caches become stale without background requests.
Versioned snapshots prevent older REST responses from overwriting newer updates.
REST remains available for loading, manual refresh, and reconnect/tab-return recovery.
Realtime-covered data does not poll on an interval. A disconnected stream or
instance shows a persistent warning with manual refresh and connection settings;
automatic reconnect continues while cached data stays visible. Background
refetches retain existing content; mutations invalidate affected queries rather
than refreshing the entire Next.js route.
Preferences load on demand and update after saving. They do not poll or refresh
on window focus.

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
- Realtime updates require WebSocket upgrades to each instance's `/signalr/messages` endpoint. Browser updates use SSE on Arrsenal's `/api/events`: disable proxy buffering for this route and allow long-lived responses. No additional port is needed. If streaming is blocked, use Refresh data or fix the connection; there is no fallback interval polling.
- A bind mount can replace the named volume. Ensure its directory is writable by UID/GID `1000:1000`.
- Instance changes saved through Arrsenal immediately update its live connections. Configuration discovery does not poll; restart Arrsenal after editing the configuration file externally or through another server process.
- Building requires network access to the package registry and Google Fonts. The built application serves Geist locally.

## Configuration

On a local installation, the file is `~/.config/arrsenal/config.json`. Set `ARRSENAL_CONFIG_DIR` to choose another directory. Docker uses `/config/config.json`.

The file is created when the first instance is saved. Writes are serialized and atomic, with directory permissions `0700` and file permissions `0600`. API keys are stored in this file in plaintext and are never returned to the browser. Protect the directory and its backups. Removing a connection only removes local configuration; it does not delete remote media or files.

A corrupt or unreadable config produces an error rather than being silently replaced. A process killed during a write can leave `config.lock`; stop all Arrsenal processes before removing a stale lock. See [backend details](src/lib/server/README.md) for the data contract, limits, and recovery instructions.

## Verification

The **CI** GitHub Actions workflow runs `test` and `build` as separate parallel checks when pull requests are opened, updated, or reopened. Each check installs the Bun version pinned in `package.json`, installs dependencies with `--frozen-lockfile`, and runs the corresponding script. New commits cancel outdated runs. The workflow can also be run manually from the Actions tab.

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

Release Please uses the repository Actions secret `RELEASE_PLEASE_TOKEN`. Configure it as a fine-grained personal access token restricted to this repository with **Contents**, **Issues**, and **Pull requests** read/write permissions. Replace the secret before the token expires. Review the generated release PR and ensure its CI checks pass before merging.

Using `RELEASE_PLEASE_TOKEN` instead of the built-in `GITHUB_TOKEN` allows release PR creation and updates to trigger the PR build and test checks automatically. Image publishing still runs in the same workflow using Release Please's outputs and does not use the personal access token.

The image publishing job has `packages: write` permission and uses `GITHUB_TOKEN` to authenticate to GHCR. After the first successful publish, check the `arrsenal` package settings on GitHub and set its visibility to **Public** if anonymous image pulls are desired; new packages default to private. The image's source label links it to this repository.

If image publishing fails after the GitHub Release is created, use **Re-run failed jobs** on that workflow run. This preserves the successful release job's version and commit outputs. Do not start a new manual workflow run to retry publication: Release Please will not report the existing release as newly created. When retrying an older release after a newer one has shipped, note that publishing also moves `latest` to the retried version.

## Security And Scope

Arrsenal defaults to **no account** for trusted local networks. Anyone who can reach an unprotected instance can view data, change settings, and enable authentication themselves. Do not expose it to an untrusted network without authentication or a VPN.

Enable the optional instance-wide account in **Settings > Security** by choosing a username and password. Passwords require at least 8 characters and allow up to 1,024 UTF-8 bytes. Usernames are case-sensitive. Settings also supports changing credentials, signing out, and disabling authentication. Changing or disabling credentials requires the current password; changes sign out other sessions.

Artwork is intentionally public, including when authentication is enabled, so Next.js can resize and cache it. Anyone who obtains or guesses an artwork URL can view it; cached images can remain available after logout or removal from the library. Library metadata, settings, and controls remain authenticated. Image requests retain strict path, destination, size, and raster-format restrictions, and upstream API keys stay server-side.

Only an Argon2id password hash is stored in private `config.json`, alongside the existing instance configuration. Sessions use opaque HttpOnly, SameSite cookies, expire after seven days, and are lost on server restart. Use one Arrsenal server process; sessions are not shared between replicas. Configuration and backups remain sensitive: upstream API keys must remain recoverable and are not password-hashed.

Use HTTPS on untrusted networks. HTTP remains supported for trusted LANs but exposes passwords and session cookies to network interception. Cookies use `Secure` when accessed through HTTPS. Reverse proxies must preserve the public request host and scheme, and direct access must be restricted when proxy authentication is used. Same-origin mutation protection remains enabled and is not a substitute for authentication.

### Forgotten Credentials

Restrict network access first: recovery **disables authentication**, making the instance open again.

1. Stop Arrsenal to prevent concurrent configuration writes and clear all sessions. For Docker Compose, use `docker compose stop arrsenal`.
2. Back up `config.json` in `ARRSENAL_CONFIG_DIR`, or `~/.config/arrsenal` if that variable is unset. In Docker, the file is `/config/config.json` in the persistent configuration volume.
3. Edit the file and remove the entire top-level `account` property, including its username, password hash, and generation. Keep the JSON valid: remove the adjacent comma where necessary. **Remove the property; do not set it to `null`.** Leave `version`, `instances`, and `preferences` unchanged.
4. Save the file with its original ownership and private permissions (`0600`). Protect the backup too: it contains API keys and the old password hash. Restart Arrsenal (`docker compose start arrsenal`).
5. Open **Settings > Security** and configure a new account before restoring wider network access.

For Docker named volumes, edit the file through a temporary maintenance container with the same configuration volume mounted while Arrsenal is stopped. Do not delete the volume or use `docker compose down -v`; that would also remove connections and preferences.

Malformed JSON, an `account` value of `null`, or unreadable configuration fails closed. Correct the file or restore the backup if Arrsenal cannot load it. If a crashed writer left `config.lock`, stop Arrsenal before removing that stale lock.

Sonarr/Radarr remain the source of truth. Partial instance failures are shown without hiding healthy instances. Multi-target additions report partial success so only failed targets need retrying. Episode searches use the selected instance's own episode ID. An accepted search or grab does not guarantee a completed download. Media/file deletion and download-client pause/resume controls are not implemented.

Arrsenal is not endorsed by TMDB, TheTVDB, Sonarr, or Radarr.
