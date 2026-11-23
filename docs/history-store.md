# History Store (mission document backend)

AEGIS mission documents are stored and synced with a port of Maestro's **history store**
(`../maestro/app/history`, documented in Maestro's `docs/history-store.md`). It replaced
Automerge. The server keeps one ordered log of actions per mission, and every
client replays that log in the same order.

## Why it fits AEGIS without rewriting the mutation layers

AEGIS already funnels every edit through `DocHandle.change(fn)` with synchronous `apply*`
mutators (see `src/operations/README.md`). The history store is generic over Redux-style
actions, so AEGIS uses a single generic action:

```
{ type: "document/patch", payload: { patches: HistoryPatch[] } }
```

`HistoryDocHandle.change(fn)` runs `fn` on an **Immer draft** of the current document,
captures the resulting JSON patches, and submits them as one history action. The reducer
(`documentReducer`) is `applyPatches`, so any machine can replay any edit without knowing what
it was. Because the handle keeps Automerge's `DocHandle` interface (`doc()`, `change()`,
`on("change")`, `whenReady()`), the `apply*`/`stage*`/`op*`/thunk layers, `withMissionChange`,
`useDocSelector`, and the server consumers (Maestro, DUST, terrain cache, mission catalog) run
unchanged.

## Pieces

| File                                                  | Role                                                                                                                 |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `src/historyStore/HistoryDocHandle.ts`                | DocHandle-shaped base class: `change()` → Immer patches → one action; change/delete events; ready state              |
| `src/historyStore/documentReducer.ts`                 | `document-init` / `document/patch` / `document/replace` reducer; patch normalization                                 |
| `src/historyStore/ClientHistoryStore.ts`              | Port of Maestro's client store: confirmed state, pending (optimistic) actions, out-of-order buffer, rebase           |
| `src/historyStore/LocalDocHandle.ts`                  | In-memory handle that confirms immediately (tests, offline tools)                                                    |
| `src/client/history/ClientHistoryRepo.ts`             | Browser repo + handle; Socket.IO transport on the `/history/v1` namespace                                            |
| `src/client/history/historyReact.ts`                  | `RepoContext`, `useRepo`, `useDocHandle`, `useDocument` (same shape as the Automerge React hooks)                    |
| `src/server/historyStore/ServerHistoryStore.ts`       | Port of Maestro's server store: sequencing, per-document `PromiseQueue`, awaited DB write, snapshots, publish        |
| `src/server/historyStore/historyPersistence.ts`       | SQL for `mission_history_db`                                                                                         |
| `src/server/historyStore/ServerHistoryRepo.ts`        | Server repo (`find`, `create`, `delete`, `flush`, `removeFromCache`, `handles`) and the in-process `ServerDocHandle` |
| `src/server/historyStore/historySockets.ts`           | `/history/v1` handlers: `join`, `leave`, `sendActions`, `requestActions`; broadcasts `confirmActions`                |
| `src/server/historyStore/importAutomergeDocuments.ts` | One-time, idempotent import of every Automerge mission document as history row 0                                     |
| `src/server/historyStore/tools/`                      | Repo factory for the standalone seeder, validator, and integrity check                                               |

## Data flow

```
Browser change(fn) ─▶ Immer patches ─▶ ClientHistoryStore.addPending (visible immediately)
      │                                         │
      │                              socket "sendActions"
      ▼                                         ▼
 Server code change(fn) ─▶ ServerDocHandle ─▶ ServerHistoryStore.insert (per-document queue)
                                                ├─ drop duplicate historyIds
                                                ├─ reduce onto confirmed state (failure ⇒ reject)
                                                ├─ INSERT into mission_history_db (failure ⇒ reject all)
                                                └─ publish ─▶ "confirmActions" to the document's room
                                                          ─▶ ServerDocHandle (Maestro/DUST/terrain listeners)
                                                          ─▶ mission catalog save hook
```

- **Optimistic edits.** A client sees its own edit at once. When confirmations from others
  arrive first, its pending actions are re-applied on top of the new confirmed state; pending
  actions that no longer apply are dropped (the edit is rolled back).
- **Rejections.** The server rejects an action that fails to reduce (for example an edit to an
  entity another user deleted), a duplicate `historyId`, or a batch whose DB write failed.
- **Joining.** `join` returns the latest confirmed state and action count (Maestro's
  partial-hydration path). Clients never download the full history.
- **Reconnecting.** After a dropped socket, the client re-joins, takes the server's latest
  state, re-applies its pending actions, and re-sends them. The server drops any it already
  confirmed by `historyId`.
- **Server restarts.** `join` carries the page's `serverEpochUuid`; a mismatch makes the client
  reload through `/versionCheck`, which preserves the old Automerge epoch-gate behavior.

## Merge semantics (vs. Automerge)

| Edit                                                                                                         | Automerge                       | History store                                                                               |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------- | ------------------------------------------------------------------------------------------- |
| Different entities / different object keys                                                                   | both kept                       | both kept (patches are per object key)                                                      |
| Same scalar field                                                                                            | deterministic winner            | last action the server sequenced wins                                                       |
| Same text field                                                                                              | character-level merge           | last writer wins (whole string)                                                             |
| Lists with element ids (`posEntries`, `eva.sequence`, `folder.items`, `actionOrderUuids`, `layerOrder`, ...) | element-level CRDT merge        | merged by element id: concurrent adds, removes, and edits of different elements all survive |
| Arrays without ids (coordinates, numeric series)                                                             | element-level CRDT merge        | **whole array, last writer wins**                                                           |
| Edit to an entity concurrently deleted                                                                       | delete wins; edit silently lost | edit is **rejected** and rolled back on its author's screen                                 |

Immer addresses array elements by index, and an index patch rebased over a concurrent insert
would hit the wrong element. `normalizePatches` therefore collapses every patch inside an array
onto the outermost array on its path, then:

- **List patch** — when every element has an identity (unique strings/numbers, or objects with
  a unique `uuid`, `layerUuid`, or `key`), it emits one `list` patch: the removed ids, the added
  or changed elements (each with the id of the element it follows), and the full id order if the
  author reordered. The reducer applies it by id, so it lands on the right elements in whatever
  order the list now has, and keeps elements other users added concurrently.
- **Replace** — otherwise (geometry, `number[][]`, objects without ids, duplicate ids) the whole
  array is replaced. Geometry edits are whole-shape edits anyway.

The entity maps (`stations`, `evas`, ...) are objects, so concurrent work on different entities
always merges per key.

## Persistence

`mission_history_db` (`Migration20261123000000`, model `mission_history.model.ts`):

| column                  | meaning                                                               |
| ----------------------- | --------------------------------------------------------------------- |
| `document_id`           | mission document id (`doc_listing_db.automerge_url`)                  |
| `history_index`         | sequential index assigned by the server; PK with `document_id`        |
| `action`                | the confirmed action (type, patches, `historyId`, `userId`, unixtime) |
| `state_prior_to_action` | snapshot: row 0 always; then every 200th action                       |

`load()` resumes from the newest snapshot and reduces at most ~200 actions. Only action ids are
kept in memory (for duplicate detection); actions are read from the database for catch-up.
A document whose stored history no longer reduces loads **read-only** and is logged
(`history-store:loadFromDatabase:storedHistoryInvalidDocumentLockedReadOnly`).

Every edit is attributed (`userId` = Launchpad `auid`, or `aegis-server` for server code) and
time-stamped, so the table is a complete audit log of each mission.

## Document ids and cutover

`doc_listing_db.automerge_url` now holds a history document id. Imported missions keep their
`automerge:...` URL as their id; new missions get `history:<uuid>`. The column and many
identifiers (`automergeUrl`, `getAutomergeDocListing`, `automergeConnectionStatus`) keep their
old names to keep this change reviewable.

`npm run migration:up` runs the legacy Automerge bootstrap and Automerge migrations, then the
MikroORM migrations, then `importAutomergeDocuments.js`, which writes row 0 for every listed
mission that has no history yet. `automerge_native_db` is left untouched.

## Not ported from Maestro (yet)

- Background snapshot verification and repair, the document-lock UI, disabling actions, and
  history timeline / time travel. The full action log is in the database, so all of these can
  be added later.
- The worker-thread variant (`ServerHistoryStoreThreaded`). Reducing a patch action is cheap.
- Document schema migrations for history documents. Future migrations should be confirmed
  `document/patch` (or `document/replace`) actions written by a migration runner through
  `ServerHistoryRepo`, so they appear in each mission's history. The existing Automerge
  migrations only run before the import.

## Operational notes

- The Socket.IO server's `maxHttpBufferSize` is 50 MB because batches carry patches (layer
  imports can be large). Joining sends the whole mission (up to ~2.6 MB today).
- The history namespace does not add per-mission permission checks, the same as the Automerge
  socket. Unlike Automerge, the server sees every edit and can enforce permissions per action.
