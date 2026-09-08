# Client data

`queries.ts` defines the REST fetches and cache freshness. `collections.ts`
materializes library, instance, and queue responses into TanStack DB collections,
scoped to the application's QueryClient. Queue keys include the instance ID.

Components read shared rows through `useLibrary`, `useInstances`, `useQueue`, or
live queries from `useCollections`. Collections share fetches; disabled Query
observers expose transport status and response-level partial-failure warnings
without adding fetch schedules. Existing rows remain visible after a failed
background refresh. `useClientReady` prevents live subscriptions from fetching
during server rendering or hydration. Strip DB virtual properties with
`collectionRow` before passing direct live-query rows to API mutation flows.

`useSyncData` owns reconciliation after commands: library refresh, queue refresh,
media changes (library, queue, affected episode queries), or all data after a
connection changes. Sonarr/Radarr commands are asynchronous and can partially
succeed, so they are not optimistic collection CRUD. SignalR notifications update
shared server snapshots, delivered through `/api/events` directly into the Query
cache and its DB collections. Complete upstream movie/series resources can avoid
an upstream fetch; incomplete events share a targeted server-side refresh.

Catalog searches, instance options, episodes, and release searches remain
parameterized TanStack queries. They are request-specific, not shared datasets
that need another collection cache.

Library, instance, queue, calendar, and episode data do not poll on an interval.
`useRealtime` is owned by the persistent layout's `LibraryProvider`. One
`EventSource("/api/events")` remains open across navigation. Library, queue, and
instance snapshots update existing caches, including inactive core queries.
Calendar, episode, and instance-option changes arrive as small invalidation hints.
Hints scope episodes by instance and series when known, options by instance, and
calendar updates to cached ranges. Matching active queries refresh through REST;
inactive queries become stale without fetching, and absent queries are not created.
The browser stream is tracked separately from each upstream connection. The shell
displays a persistent disconnect warning
without clearing cached rows. Manual refresh remains available; a successful REST
fetch does not imply live updates have reconnected. Reconnect and tab visibility
recovery resync data. Changes missed without a detected disconnect wait for the
next event, visibility refresh, or user refresh; no periodic reconciliation runs.

Snapshots contain an allowlisted normalized DTO and `{epoch, revision}` metadata.
`realtime-query.ts` retains REST `_realtime` metadata and arbitrates older responses.
A streamed snapshot cancels a matching in-flight browser request before updating
the cache; older snapshots and obsolete streams cannot overwrite newer data.
Snapshot errors retain cached rows and expose a query error without triggering
per-browser retries. Hidden tabs can receive data without making event-driven
HTTP requests; returning to the tab still performs a recovery refresh.

There are no page-interest registrations, subscription-control POSTs, or stream
capabilities. Navigation does not replace the stream. Bursts coalesce over 250ms;
a hint received during an in-flight request schedules a trailing refresh so an
older response cannot consume the invalidation. Native EventSource reconnects
after connection loss; authentication loss or layout cleanup closes the stream.

Preferences load on demand and update the shared cache after a successful save.
They do not poll or refetch on window focus: changes from another viewer wait
until the query is otherwise refreshed. In-flight requests and explicit user
actions are not canceled by losing focus.

Library and queue endpoints reject total primary-read outages, preserving the
last successful browser snapshot. Partial failures retain the failed instance's
last-known contribution when available, alongside its error; successful empty
responses remain authoritative. Target options prefetch on hover/focus uses the
same five-minute browser query cache as target selection.
