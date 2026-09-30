# Using Arrsenal

[Back to README](../README.md)

Arrsenal uses a Sonarr/Radarr-style layout. The sidebar holds **Library**, **Calendar**, **Activity**, **Wanted**, and **Settings**, with each section's pages beneath it, and lists every connected instance with its health. On phones, the sidebar becomes a bottom tab bar. Every page has an action bar at the top.

Your library stays empty until you connect an instance. Arrsenal shows only real data from your Sonarr and Radarr instances.

## Search and add titles

- Press **⌘K** (or **Ctrl+K**), or select the search bar, to search. Recently added titles appear first, then library matches as you type, followed by movies and shows you can add. Use the arrow keys and **Enter** to open a result.
- **Add new** opens the same search, limited to movies and shows you can add.
- **Add to library** lets you add a title to several instances at once, with its own quality profile and root folder for each. Each instance starts from the profile and root folder you last used there, or its only option. **Start searching after adding** is on by default.
- If some targets fail, Arrsenal reports which ones, so you only need to retry those.

## Library

- Browse **All titles**, **Movies**, or **Shows** in **Posters** or **Table** view.
- Matching titles on different instances combine into one entry. Each instance, such as your HD and 4K libraries, keeps its own availability and quality, shown as chips on posters and in the **Targets** column.
- **Sort** by date added, title, release year, rating, size on disk, missing episodes, or monitoring, ascending or descending. In Table view, you can also sort by selecting a column header.
- **Filter** offers:
  - **Availability** (Available, Incomplete, Downloading)
  - **Presets** such as Missing, Unmonitored, and Added in the last 30 days
  - Quick filters by instance and quality profile
  - Your saved custom filters
- **Custom filters** combine rules for type, status, target, target status, quality profile, file quality, monitoring, year, rating, genre, size on disk, episode progress, and date added. Rules can match all or any, and can be grouped.
- **Options** follows the current view:
  - In Posters view, it sets the poster size, the details shown on each card, and whether chips show the quality profile or the file quality.
  - In Table view, it chooses and orders columns. See [Table options](#table-options).

Each browser tab remembers its own view, sort, filters, and scroll position. When a tab has nothing saved, it starts from the defaults in **Settings > Personalization > Library defaults**.

## Movie and show pages

Each title has a bookmarkable page with its metadata, a link to TMDB or TheTVDB, and a **Targets** table showing each instance's availability, quality, and monitoring. The action bar offers:

- **Search**: an automatic search on every target.
- **Interactive**: a manual search. See [Manual search](#manual-search).
- **Add release**: send a release you already have. See [Add a release from a file or link](#add-a-release-from-a-file-or-link).
- **Add target**: add the title to another instance.
- **Remove**: remove the title from one instance. See [Deleting media safely](#deleting-media-safely).

On show pages, each season lists its per-instance availability. Expand a season for its target table, with **Auto search**, **Manual search**, and **Delete files**, followed by each episode. Episode rows offer the same actions for a single episode, and selecting an episode opens its details.

## Manual search

Manual search is available from the **Interactive** button, the **Targets** table, season and episode rows, and **Wanted**. It searches the selected instance's indexers and shows the results in a table:

- Columns show the source (torrent or usenet), age, indexer, size, peers, languages, quality, and custom format score. You can choose and order them with **Options**.
- Results start in the instance's own ranking. Select a column header to sort by it, and **Sort by best match** to return to the instance's order.
- Rejected releases show the reasons under their title.
- **Grab** asks for confirmation first. Grabbing a rejected release warns you that it overrides your quality rules.

## Add a release from a file or link

**Add release** on a movie or show page sends a release you already have to that title's instance, which passes it to its download client:

- Paste a magnet link or an HTTP(S) link to a `.torrent` file, or choose or drag in an `.nzb` or `.torrent` file of up to 10 MB. For an NZB link, download the file first and then choose it.
- Arrsenal checks the release name with the instance first. It refuses a release that doesn't match the title, or, for a show, doesn't match any episodes. Select **Override name** to have the instance file the release under this title instead.
- The instance's quality rules still apply. The result says whether the release was sent, held as a pending release (which you can grab from **Activity**), or rejected, and why.

**Uploaded files:** Sonarr or Radarr downloads each uploaded file from Arrsenal once, through a single-use link. That link works without signing in. The instance must be able to reach Arrsenal at the address set in **Settings > Connections**. When no address is set, Arrsenal uses the address you're browsing from.

## Activity

Activity combines every instance's **Queue**, **History**, and **Blocklist**. Each page has a search box, where every word you type must match and **Escape** clears it, and an instance filter. Titles link to their movie or show page when the download matches a title in your library.

### Queue

- Shows every instance's downloads in Sonarr's queue order, with their progress, size, time left, and warnings. Filter by **All**, **Downloading**, or **Warnings**.
- **Grab now** skips the release delay for a pending release, and **Retry import** requests a new import scan for a completed download. A manual import may still be needed.
- **Remove** takes items off the queue. By default this also removes them from the download client; you can also blocklist the release.
- **Grab** and **Remove** also work on selected rows. Shift-click selects a range of rows.

### History

- Shows grabbed, imported, failed, deleted, renamed, and ignored events from every instance, newest first. Filter by **All**, **Grabbed**, **Imported**, **Failed**, or **Deleted**.
- It loads 100 events at a time; use **Load older events** to go further back.
- **Mark as failed**, available on grabbed events, blocklists that release. The instance may then search for a replacement.

### Blocklist

- Shows every instance's blocklisted releases, with the indexer and the reason, newest first. Arrsenal shows the newest 1,000 entries per instance; older entries are still blocklisted.
- Remove entries one at a time or by selection, including shift-click ranges. Sonarr and Radarr may grab those releases again the next time they search.

## Wanted

**Wanted** lists every monitored target that is missing files. Downloading and unmonitored items are hidden. Filter by **Missing**, **Movies**, or **Shows**.

- Search one row automatically or manually, or use **Search selected** or **Search all**.
- Shift-click selects a range of rows.

## Calendar

The calendar shows episode air dates and theatrical, digital, and physical movie releases, in **Month** or **Agenda** view. Busy days show a **more** button that lists every event for that day. Days and air times follow the time zone set in **Settings > Personalization**.

## Table options

The library table, Queue, History, Blocklist, Wanted, and manual search results each have an **Options** button. Use it to show, hide, and reorder columns; the title column is always shown. **Reset to defaults** restores the original columns.

## Settings

- **Connections**: connect, edit, test, and disconnect Sonarr and Radarr instances. This page also sets the **Arrsenal address** that instances use to download uploaded release files.
- **Personalization**: choose one of six themes (Dark, the default; Light; Sonarr; Midnight; Radarr; or Graphite), an accent color, the time zone, and the library's default view, sort, and order.
- **Security**: turn on optional single-account authentication, change credentials, or sign out. See [security and account recovery](security.md).
- **About**: shows your installed version and project links, and checks for updates. Results are cached for 15 minutes, and **Check now** checks again immediately; if the check fails, the rest of Settings still works. When a newer release is out, the sidebar shows **Update available** (a dot on the Settings tab on phones) until you update or dismiss it for that release. Clear **Check for new releases** to turn off update checks. The check sends no data about your install.

Custom filters, view and table options, the add dialog's last-used profiles and root folders, and everything in Personalization are saved in the server configuration, so every browser shares them. API keys stay on the server, and there is no database. See [configuration and backups](configuration.md).

## What stays in Sonarr and Radarr

Sonarr and Radarr remain the source of truth. Configure quality profiles, root folders, indexers, and download clients there. Arrsenal communicates with their v3 APIs; it does not replace either application or your download client. Download client pause and resume controls are not implemented.

- If one instance fails, Arrsenal shows the problem without hiding your healthy instances.
- Episode searches use the selected instance's own episode ID.
- An accepted search or grab does not guarantee a completed download.
- If an action times out, refresh before retrying: the instance may already have accepted it.

## Live updates

Library and queue changes arrive through live connections rather than interval polling. History is the exception: it refreshes every 30 seconds. The Blocklist reloads after you change it or select **Refresh**.

If the live connection or an instance disconnects, a persistent warning appears. Cached data stays visible, and Arrsenal keeps trying to reconnect. Use **Refresh data** when needed. If warnings persist, see [networking and reverse proxies](deployment.md#networking-and-reverse-proxies).

## Deleting media safely

- Removing a connection only removes Arrsenal's local configuration; it does not delete remote media or files.
- Removing a movie or show from a selected instance is a separate action that keeps files unless you explicitly choose to delete them.
- Deleting episode or season files leaves the show and its monitoring intact, so the instance may download them again.

Read the confirmation for the selected instance, and any shared-file warning, before proceeding.
