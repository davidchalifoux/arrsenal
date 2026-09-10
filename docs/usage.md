# Using Arrsenal

[Back to README](../README.md)

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

## What stays in Sonarr and Radarr

Sonarr/Radarr remain the source of truth. Configure quality profiles, root folders, indexers, and download clients there. Arrsenal communicates with their v3 APIs; it does not replace either application or your download client.

Partial instance failures are shown without hiding healthy instances. Multi-target additions report partial success so only failed targets need retrying. Episode searches use the selected instance’s own episode ID. An accepted search or grab does not guarantee a completed download. If an action times out, refresh before retrying: the upstream service may already have accepted it. Download-client pause/resume controls are not implemented.

## Live updates

Library and queue changes arrive through live connections rather than interval polling. A disconnected stream or instance shows a persistent warning while cached data remains visible and automatic reconnection continues. Use **Refresh data** when needed; if warnings persist, see [networking and reverse proxies](deployment.md#networking-and-reverse-proxies).

## Deleting media safely

Removing a connection only removes Arrsenal’s local configuration; it does not delete remote media or files. Removing a movie or show from a selected instance is a separate action that keeps files by default unless you explicitly choose to delete them. Episode and season file deletion leaves the show and monitoring intact, so automatic redownloads may occur. Read the confirmation for the selected instance and any shared-file warning before proceeding.
