# Arrsenal Backend

The public DTOs in `src/lib/types.ts` are the fixed contract. Route handlers use
the Node.js runtime and standard Request/Response APIs. Server modules are marked
`server-only`.

## Storage And Security

- Configuration is `config.json` in `ARRSENAL_CONFIG_DIR`, or
  `~/.config/arrsenal` when the environment variable is unset. Its schema is
  `{ version: 1, instances: InstanceConfig[] }`. Each private record contains
  `id`, `name`, `kind`, `url`, and `apiKey`.
- The directory is created with mode `0700`. Writes use an exclusive temporary
  file with mode `0600`, fsync it, and atomically rename it over the configuration.
  A process-wide mutation queue survives development reloads. An exclusive
  `config.lock` also serializes writers in separate Node processes.
- Missing configuration returns empty library, lookup, and queue collections.
  Invalid, unreadable, oversized, or symlinked configuration fails closed.
- A writer killed while holding the lock can leave `config.lock`. Writes then
  return `503` after five seconds. Stop all Arrsenal writers before removing a
  stale lock. Reads remain available. Use a persistent local filesystem, not an
  ephemeral serverless filesystem or a distributed shared-storage deployment.
- API keys are sent only as server-side `X-Api-Key` headers. DTOs do not include
  them. Upstream JSON has credential fields and reflected key values redacted;
  upstream error bodies, headers, and fetch error details are not returned.
- Private/local HTTP(S) instance URLs are intentionally supported, including
  reverse-proxy base paths. URL credentials, query strings, and fragments are
  rejected. An optional trailing `/api/v3` is normalized away. Upstream redirects
  are never followed, including same-origin redirects.
- Every mutation checks a supplied Origin against the request scheme and Host
  header (falling back to the request URL if Host is absent). Standalone Next.js
  request URLs can use the internal bind address rather than the browser's host.
  Cross-site/same-site Fetch Metadata is rejected. Forwarded-host headers do not
  grant permission. No cross-origin CORS permission is emitted. Mutation
  bodies must be `application/json`, no larger than 128 KiB, and complete within
  ten seconds; stalled body reads are canceled and return `408`. The bodyless
  instance DELETE needs no content type; if it has a body, it must be a JSON object.
- This is a single-user, trusted-network backend, not a login system. Origin
  checks are browser CSRF protection, not authentication. Put authentication at
  a reverse proxy or use a VPN before exposing Arrsenal outside a trusted network.
  The proxy must preserve the application's request scheme and host correctly.

## Validation

`schemas.ts` uses the installed Zod 4 package for request objects, query/path
parameters, media identities and target selections, and persisted configuration
on both reads and writes. Unknown request fields are stripped, not forwarded.
Numbers and booleans are never loosely coerced; numeric query IDs must first
match decimal digits. Text retains the existing UTF-16 length limits and rejects
control characters before trimming. Local/private HTTP(S) URLs remain valid.

Schema failures at the request boundary return `400` with a safe `{error}` message,
never serialized Zod issues, paths, or input values. Invalid persisted config
returns the existing generic `500` and is not overwritten. Transport guards still
run before payload validation (`403`, `415`, `413`, `408`); upstream
option checks, and per-target action errors retain their existing behavior.

## Endpoints

| Endpoint | Behavior |
| --- | --- |
| `GET /api/instances` | Tests every configured instance's `/api/v3/system/status`; returns safe summaries, including individual connection errors. An empty config returns `instances: []`, not fictional connections. |
| `POST /api/instances` | Validates `{name, kind, url, apiKey}`, verifies connectivity/application type, then saves. Duplicate normalized URLs return `409`. |
| `POST /api/instances/test` | Same validation/connectivity test; never persists. |
| `DELETE /api/instances/[id]` | Removes only the local configuration record. Never sends a remote media/file DELETE. |
| `GET /api/instances/[id]/options` | Fetches quality profiles and root folders from the selected instance. |
| `GET /api/library` | Merges movies by TMDB ID and series by TVDB ID. Missing provider IDs use instance-scoped remote identities. Preserves all targets, actual file qualities, sizes, profiles, monitoring, statuses, and series episode counts. |
| `GET /api/lookup?term=...&kind=movie\|series` | Looks up and merges results from matching instances. One instance's failure does not hide another's results. As a convenience, omitting `kind` searches both kinds. Empty live searches return `[]`, never live trending claims. |
| `POST /api/media` | Accepts `AddMediaRequest`. Only kind and TMDB/TVDB identity are consumed from client metadata. Each target freshly resolves metadata by `tmdb:<id>` or `tvdb:<id>` and validates the selected profile and root path against its own options. |
| `POST /api/search` | Verifies the media ID, then submits `MoviesSearch` with `movieIds`, or `SeriesSearch` with `seriesId`. |
| `GET /api/releases` | Accepts `instanceId`, `remoteId`, `kind`; uses `movieId` or `seriesId` on the release endpoint. Returns safe release DTOs, including rejection reasons. |
| `POST /api/releases` | Sends only `{guid, indexerId}` to the selected instance's release POST. |
| `GET /api/queue` | Reads every queue page with `includeMovie`/`includeSeries`, includes unknown media downloads, preserves signed queue IDs, progress fields and warnings, and reports instance errors. |
| `DELETE /api/queue` | Requires `{instanceId, id, blocklist, removeFromClient}` with real booleans; forwards both deletion flags. Blocklisting can cause the instance to search for a replacement. |
| `POST /api/queue` | Re-reads the queue, then selects the safe action described below. |
| `GET /api/image` | Proxies raster filenames under `/MediaCover/<id>/` or `/api/v3/MediaCover/<id>/`, with an optional configured application base prefix. An optional `fallback` accepts only an allowed TMDB/TVDB CDN URL and is fetched if the local cover fails. Local paths still reject traversal, query parameters, encoded paths, SVG, and arbitrary API endpoints. |

## Action Semantics

`GET /api/episodes?instanceId=...&remoteId=...` loads a Sonarr series' seasons,
episodes, file metadata, and episode-specific queue status. Episode lists are only
fetched on detail pages. File/queue enrichment failures retain useful episode
data with explicit errors; failed episode or series reads fail the request.

Search POST bodies and release GET queries accept an optional `episodeId` for
shows only. The backend verifies that this episode belongs to `remoteId` on the
selected instance before issuing `EpisodeSearch` or `release?episodeId=...`.
Episode IDs are never interchangeable between instances. Whole-title search
behavior is unchanged when `episodeId` is omitted.

- Adds always monitor the media. Movies use `minimumAvailability: released` and
  `searchForMovie: request.search`. Series use season folders, monitor non-special
  seasons, and set `monitor: all`, `searchForMissingEpisodes: request.search`, and
  `searchForCutoffUnmetEpisodes: false`. Client titles, images, seasons, filesystem
  paths, remote IDs, and raw upstream objects are never forwarded as metadata.
- A successful action means the upstream request was accepted, not that a
  download or import completed. Timeouts/network failures on mutations warn that
  the action might have been accepted; refresh before retrying.
- Multi-target adds return `200` when all targets succeed, `207` when only some
  succeed, and an appropriate error status when none succeed. `success` is true
  **only when all targets succeed**. Partial responses include `errors` and a
  message with the confirmed target count. The client must inspect the body even
  for `207`, and should retry only failed targets.
- Input/security/config errors return `{error: string}`. Once an instance action
  is running, failures return an `ActionResponse` with `success: false`, a message,
  and per-instance errors. Read aggregation returns `200` plus an `errors` array
  even when every configured instance is unavailable.
- Queue POST grabs a delayed/pending release with `POST queue/grab/{id}` only
  when no download ID exists. This bypasses the delay and starts a download.
  For completed downloads awaiting import it sends `DownloadedMoviesScan` or
  `DownloadedEpisodesScan` with the upstream-reported `outputPath`, download ID
  as `downloadClientId`, and `importMode: auto`. Active downloads, missing paths,
  and missing download IDs are rejected; manual intervention can still be needed.
- Poster mapping prefers instance-cached covers and includes an allowed TMDB/TVDB
  fallback URL when present. CDN-only lookup results keep their remote URL. Covers at
  the configured instance origin use the server proxy even when supplied as
  absolute `remotePoster`/`remoteUrl` values. Proxy responses forward no upstream cookies,
  auth headers, or redirect locations, and are private-cacheable for one hour.

## Bounds

Connectivity checks time out after four seconds. General upstream requests have
an eight-second timeout covering headers and body. Queue pagination and each
instance's library enrichment have a twenty-second total budget. Release search
and grab allow thirty seconds. JSON responses are limited to 32 MiB, raster images
to 10 MiB, config to 1 MiB, configured instances/selected targets to 32, and queue
pagination to 1,000 pages of 250 requested records. Changed totals, clamped page
numbers, inconsistent page sizes/lengths, and duplicate queue IDs produce a
refresh error rather than a falsely complete queue. The upstream API does not
offer a transactional snapshot, so rapid queue changes can still require refresh.

Sonarr requires per-series `episodefile` requests to report actual file quality;
these run at most four at a time per instance. If profile, queue, or episode-file
enrichment fails, media and episode counts remain visible with explicit service
errors and unknown quality labels rather than invented values. A combined item
is available only when every target is available; an available/missing mix is
partial, and an active download takes precedence.

Unknown instance IDs return `404`; episode reads resolve only configured instances.

## Focused Verification

Run `pnpm exec vitest run tests/backend.test.mjs` with Node 24 or newer. These are
native Vitest tests, using its Node environment and a test-local `server-only`
mock; the project's shared jsdom configuration is unchanged. A small Node loader
is retained only for the separate-process configuration-writer regression test.

The suite uses real local HTTP mock servers and isolated temporary config
directories. It covers API contracts, JSON/Origin validation, key redaction,
redirect and timeout protection, multi-process config serialization, file modes,
invalid request/query/config schemas, aggregation, trusted adds, commands/releases, pagination,
queue retry semantics, unconfigured reads, and image-proxy restrictions. It does not
replace a smoke test against an operator's actual Sonarr/Radarr installations.
