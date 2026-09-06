# Client data

`queries.ts` defines the REST fetches and polling cadence. `collections.ts`
materializes library, instance, and queue responses into TanStack DB collections,
scoped to the application's QueryClient. Queue keys include the instance ID.

Components read shared rows through `useLibrary`, `useInstances`, `useQueue`, or
live queries from `useCollections`. The collections own polling; disabled Query
observers expose transport status and response-level partial-failure warnings
without adding fetch schedules. Existing rows remain visible after a failed
background refresh. `useClientReady` prevents live subscriptions from fetching
during server rendering or hydration. Strip DB virtual properties with
`collectionRow` before passing direct live-query rows to API mutation flows.

`useSyncData` owns reconciliation after commands: library refresh, queue refresh,
media changes (library, queue, affected episode queries), or all data after a
connection changes. Sonarr/Radarr commands are asynchronous and can partially
succeed, so they are not optimistic collection CRUD. Keep polling to observe
external changes and command completion; this REST adapter is not push sync.

Catalog searches, instance options, episodes, and release searches remain
parameterized TanStack queries. They are request-specific, not shared datasets
that need another collection cache.

Queue polling runs every 15 seconds while the Queue screen is mounted, and
every 60 seconds for sidebar-only subscriptions. The collection remains the
only polling observer. Window blur or a hidden tab pauses all query polling;
focus restores polling without an extra focus-triggered refetch. In-flight
requests and explicit user actions are not cancelled by losing focus.

Library and queue endpoints reject total primary-read outages, preserving the
last successful snapshot in the query cache. Empty successful responses and
partial successes remain authoritative snapshots. Target options prefetch on
hover/focus uses the same five-minute query cache as target selection.
