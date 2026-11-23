# Lessons from porting AEGIS from Automerge to the history store

Notes from replacing AEGIS's Automerge backend with a port of Maestro's history store
(`../maestro/app/history`). The design itself is in `docs/history-store.md`; this document
records what was learned doing the port, including what was surprising and what to watch for
next.

## 1. The seam that made it tractable: keep `DocHandle`, swap what is under it

The Maestro history store is a Redux action log: every edit is a named action and a reducer.
Converting AEGIS to that model literally would have meant turning about 400 `change()` call
sites (and every `apply*`/`stage*`/`op*` function) into reducers.

That was unnecessary. AEGIS already had a strong convention: every mutation goes through
`DocHandle.change(fn)` with a synchronous `apply*` mutator, and exactly one `change()` per
logical operation (`src/operations/README.md`). That convention is what made Automerge's
"one patch per operation" atomicity work, and it is exactly the boundary a history store needs.

So the port kept the `DocHandle` interface (`doc()`, `change()`, `on("change")`,
`whenReady()`, `url`/`documentId`) and replaced the implementation:

- `change(fn)` runs `fn` on an Immer draft and turns the mutations into JSON patches.
- The patches become one generic history action, `document/patch`.
- The reducer is `applyPatches`.

The history store stays generic over actions, and AEGIS's domain code did not change.
**Lesson:** a disciplined mutation boundary is worth more than the sync engine behind it. If
the `apply*` layering had not existed, this would not have been a one-shot port.

## 2. Patches are a fine action payload, but array indices are not

Immer patches address array elements by index (`["evas", id, "sequence", 3]`). The history
store rebases pending actions onto newer confirmed state, and an index patch rebased over a
concurrent insert lands on the wrong element. The patches still apply cleanly, so the error is
silent.

The first fix collapsed every edit inside an array into a whole-array `replace`. That is safe,
but it turned the most collaborative arrays into last-writer-wins:

- `rex.posEntries` (several operators logging crew positions at once)
- `eva.sequence`
- `folder.items`
- `actionOrderUuids`

With that fix, two simultaneous crew-position adds would lose one of them. That was a real
regression from Automerge, and it was only caught by asking "which arrays are actually edited
concurrently?"

The final design adds an identity-keyed `list` patch. When every element has an id (a `uuid`,
`layerUuid` or `key` field, or unique strings), the patch records removed ids, added or changed
elements with their neighbors, and the order if the author reordered. The patch is applied by
id. In a live test, three clients each added five positions simultaneously and all 15 survived.

Things found by tests rather than by design:

- **Numbers are not ids.** Treating unique numeric arrays as identity lists made concurrent
  edits to a coordinate tuple produce three numbers. Only string primitives count as ids now.
- **Whole-array assignment is the common case.** Many `apply*` functions write
  `x.items = [...x.items, id]` or `= arr.filter(...)`, which Immer reports as a `replace` of the
  array, not as element patches. Those must be diffed too, or most list edits bypass the merge.
- **Insert placement needs two neighbors.** Placing an insert only "after X" sends it to the end
  of the list when X was deleted concurrently. Recording both `after` and `before` keeps it in
  place.
- **The author-replay invariant is the key test.** For any edit, reducing the emitted patches
  onto the base must equal the optimistic state the author already sees. A seeded fuzz test of
  this caught every normalization mistake quickly.

**Lesson:** "patches as actions" is general, but merge semantics live in the patch
normalization. Decide them per data shape: object maps merge per key, identity lists merge by
id, and geometry and numeric series are replaced whole.

## 3. Immer drafts are revoked; Automerge proxies did not fail the same way

After `produce()` finishes, every draft proxy is revoked. Any value read from the draft and kept
after the callback returns throws `Cannot perform 'get' on a proxy that has been revoked`. That
includes values returned from the callback or assigned to an outer variable.

AEGIS code did this in places, for example `let normalized; handle.change(m => { normalized =
records.map(r => normalizeSublayerInput(m, r)) })` in the layer and sublayer routes, and it
worked under Automerge. The sublayer route returned HTTP 500 after the swap. Only a test that
serialized the response caught it.

Mitigations:

- `produceDocumentChange` snapshots drafts in the callback's return value (`current()`), so
  `withMissionChange(...)` return values are safe.
- Closure leaks cannot be fixed generically. A scan of every `change(...)` callback for writes to
  outer variables, outer `.push`/`.set`, and `dispatch`/timer/logger calls found only the two
  routes.

**Lesson:** when swapping proxy-based engines, audit for references escaping the mutation
callback. Prefer returning values from `change()` over assigning outer variables.

## 4. "Change" event identity matters more than you would think

The server's in-process handle swapped its optimistic state for the store's confirmed state
when its own edit came back. The two were equal in content but different objects, so every
server edit fired "change" twice. That doubles work for Maestro/DUST emitters and terrain-cache
listeners, and it breaks reference-equality caching such as `useDocSelector`.

Maestro's `ClientHistoryStore` already avoided this: when the confirmed batch is exactly its own
pending actions in order, it keeps the pending state object. The server handle needed the same
rule. Its pending entries' cached states also have to be recomputed on every rebase, or the
"keep our object" shortcut uses stale data.

**Lesson:** for a sync layer under React and listener-heavy server code, "same content" is not
enough. Preserve object identity across the round trip of your own edits.

## 5. Things the history store makes better (and that Automerge could not)

- **The server sees every edit**, so it can validate, attribute, and in future authorize each one.
  The socket now ignores the client-supplied `userId` and stamps the authenticated Launchpad
  `auid`. It also accepts only `document/patch` from browsers; earlier, a client could have sent
  `document/replace` and overwritten a mission.
- **Conflicts are explicit.** An edit to an entity someone else deleted is rejected and rolled
  back on its author's screen, instead of Automerge silently keeping the delete.
- **`mission_history_db` is a complete audit log**: every change with user and time, and
  snapshots every 200 actions. Maestro's timeline and time travel can be built on it later.
- **No WASM, no CRDT metadata.** Documents are plain JSON in memory and in Postgres; the
  largest mission is about 2.6 MB of JSON.

## 6. Things that got worse or need follow-up

- **Text fields** merge last-writer-wins on the whole string instead of character by character.
  This is acceptable for AEGIS's short fields, but it is a change.
- **Arrays without ids** (geometry) are last-writer-wins. This is fine for whole-shape edits.
- **Join sends the whole document** (up to about 2.6 MB) on every connect and reconnect, with no
  compression. Socket.IO's `maxHttpBufferSize` was raised to 50 MB because patch batches for
  layer imports can be large.
- **Document schema migrations** for history documents do not exist yet. Future migrations should
  be confirmed actions written through `ServerHistoryRepo`, so they appear in history. The
  Automerge migrations only run before the import.
- **Not ported from Maestro:** the worker-thread store, background snapshot verification and
  repair, the document-lock UI, disabling actions, and timeline/time travel.
- **Per-mission authorization** on `/history/v1` matches the old Automerge socket (none beyond
  the proxy). Now that the server sees every edit, it is cheap to add.
- **Naming debt:** `automergeUrl`, `doc_listing_db.automerge_url`, `automergeConnectionStatus`,
  the `missionAutomerge` routes, and the `server:automergeDocMetrics:*` log ids were kept to keep
  the diff reviewable.

## 7. Process notes

- **Start with a live end-to-end slice before converting tests.** Getting one browser editing one
  mission through the new socket, DB and broadcast took a fraction of the effort. It validated
  the design before any of the long tail (tests, tooling, routes) was touched.
- **Run against a cloned database.** The original app was running on the same Postgres. Cloning
  `aegis` to `aegis_history` and making the ports configurable (`API_PORT`, `VITE_PORT`,
  `AEGIS_BASE_URL` for Playwright) let both versions run side by side, so pre-existing failures
  could be told apart from new ones. The one failing E2E test (asset placement) fails
  identically on the untouched Automerge app.
- **The importer must be idempotent and keep ids.** Reusing each mission's Automerge URL as its
  history document id meant `doc_listing_db`, routes and clients needed no remapping. Running the
  import at the end of `migration:up` makes cutover a no-op on re-runs.
- **Parallel sub-agents work if file scopes are disjoint.** Converting about 40 test files,
  porting the CLI tools, and writing core tests ran in parallel with explicit per-agent scopes
  and a "report, do not fix, anything outside your scope" rule. That rule surfaced the real
  bugs (the revoked proxy, the double change event, the numeric tuples, whole-array assignment)
  instead of letting them be papered over in tests.
- **Windows line endings:** Python's text-mode writes on Windows produce CRLF, which the
  `linebreak-style` lint rule rejects. Run prettier after scripted edits, or write with
  `newline="\n"`.

## Validation at the time of the port

- `npm run test:all`: lint, tsc, build, vitest 7001/7001, vitest browser 571/571.
- Playwright (chromium): 70 passed, 1 pre-existing failure, 1 skipped.
- Live checks with the real client against the running server:
  - two-browser editing and reload persistence
  - three concurrent clients converge with no lost list inserts
  - delete versus edit conflicts resolve to the delete
  - an offline edit syncs after reconnect
  - a stale-epoch tab is redirected to `/versionCheck`
