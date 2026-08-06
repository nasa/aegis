# Automerge Mutation Architecture

All mutations of the `Mission` Automerge document go through one of these layers.

## The four layers

| Layer    | Location              | Purpose                                                                                                           | I/O allowed? | Calls `.change()`? | Client + Server? |
| -------- | --------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------ | ------------------ | ---------------- |
| `apply*` | `apply/*.ts`          | Inner draft mutator. Receives `(m: Mission, …args)` and mutates the draft.                                        | ❌ Pure sync | ❌ Never           | ✅ Both          |
| `stage*` | `stage/*.ts`          | Plan builder. Receives a `Mission` snapshot, returns a typed `*StageData`.                                        | ⚠ Restricted | ❌ Never           | ✅ Both          |
| `op*`    | `src/operations/*.ts` | Orchestrator usable on client **or** server. Calls `.change()` directly. No Redux dependency.                     | ✅ Yes       | ✅ Typically once  | ✅ Both          |
| `thunk*` | `src/store/thunk/*`   | Client-only Redux orchestrator. Will delegate to `op*` functions. Runs **one** `.change()` per logical operation. | ✅ Yes       | ✅ Typically once  | ❌ Client only   |

## The atomicity boundary

`op*` functions own the `.change()` call for operations that must work on both client and server. On the client side, `withMissionChange((m) => applyFoo(m, args))` remains available for simple single-layer mutations directly from components.

**Exactly one `.change()` call per logical user operation**, regardless of which layer it originates from.

Composing multiple applies atomically inside an `op*` function:

```typescript
export function opDeleteStation(
  missionDocHandle: DocHandle<Mission>,
  args: DeleteStationArgs
): void {
  missionDocHandle.change((m) => {
    applyDeleteActions(m, actionUuids);
    applyDeleteStations(m, stationUuids);
  });
}
```

### Calling an `op*` from the client vs. the server

`op*` functions receive a `DocHandle<Mission>` as their first argument.

- **Server side** — call the op directly with an explicit handle (usually looked up from `globalValues.maestro.docHandles`):

  ```typescript
  opUpdateMdau(docHandle, mdau);
  ```

- **Client side** — use `withMissionOp` from `client/automergeDocHandles.ts`. It fetches the current mission doc handle, guards for null, and forwards the caller-supplied args to the op. Components must not touch the handle directly (ESLint-enforced):

  ```typescript
  withMissionOp(opUpdateStationName, stationUuid, newName);
  ```

For simple single-layer mutations that don't warrant promotion to an op, components may also use `withMissionChange`:

```typescript
withMissionChange((m) => {
  applyUpdateStationByField(m, { stationUuid, fieldName: "name", value: newName });
});
```

## When to use each layer

Promote orchestration to an `op*` function if any of:

- it is needed on the server side (not just in a Redux/React context),
- it reads non-trivial state from the doc before mutating (e.g. staging traverses when renaming a station),
- the logic is reused across multiple call sites or across client and server.

Promote to a `thunk*` if additionally:

- it needs Redux `dispatch` context (e.g. UI selection updates after the mutation),
- it needs async I/O that is client-specific (e.g. Redux-managed elevation fetch).

Thunks will eventually delegate their core doc mutation to the corresponding `op*` function.

## Hard rules (ESLint-enforced)

1. `apply*` may only call other `apply*`. No `.change()`. No `getMissionDocHandle`. No thunks.
2. `stage*` receives a `Mission` parameter; never calls `.change()`; may only import the allow-listed read-only thunks (currently `thunkFetchElevation`).
3. `op*` functions in `src/operations/` own the `.change()` call for shared client/server operations. They receive a `DocHandle<Mission>` directly.
4. Outside `src/store/thunk/**`, `src/operations/**`, and `automergeDocHandles.ts`, `missionDocHandle.change()` is forbidden in components. Use `withMissionChange` instead.
5. An `op*` function or thunk runs at most one `.change()` per logical operation.

### Op / Thunk atomicity checklist

Before committing an `op*` function or thunk, verify:

- [ ] The body contains exactly **one** `missionDocHandle.change(...)` call.
- [ ] No called `op*` or sub-thunk also calls `.change()` (trace the full call tree).
- [ ] No `.change()` call appears inside a `for`, `forEach`, `map`, or other loop body (directly or via a called function).
- [ ] All async I/O (`await dispatch(thunkFetchElevation(...))`, REST fetches) runs **before** the `.change()`.
- [ ] UI dispatches (Redux slice setters, non-Automerge side-effects) run **after** the `.change()` (thunks only — `op*` functions have no Redux context).

## Two tiers of `stage*` functions

Most stages are **pure sync** (`stageDuplicateEva`, `stageDeleteRex`, etc.) — they read the passed-in `Mission`, allocate uuids, and return a plain data plan. This is the default tier and should be preferred whenever possible.

A small number of stages are **async** because they need to enrich the stage data with values from a read-only API (currently: elevation profile from `thunkFetchElevation`). `stageTraverseUpdate` and `stageLanderLocationUpdate` are the canonical examples. Async stages still:

- Receive `mission: Mission` as a parameter (no `getMissionDocHandle()` calls).
- Never call `.change()` themselves.
- Never call any mutation thunk — only the explicit allow-list of read-only data thunks.

The caller still `await`s the stage and applies it inside a single sync `.change()` callback.

## Why?

Automerge commits each `.change()` call immediately and broadcasts the resulting patch to all peers. Splitting one logical operation across multiple `.change()` calls means peers can observe a half-built state — orphan entities, broken parent references, etc.

By disciplining every mutation through these layers, complex multi-entity operations like duplicating an EVA or deleting a REX collapse to one atomic patch.

### Common violation patterns to avoid

| Anti-pattern                                                               | Why it violates atomicity                  | Fix                                                        |
| -------------------------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------- |
| Calling `await dispatch(thunkFoo(...))` where `thunkFoo` calls `.change()` | Adds a second patch to the same logical op | Inline the inner logic into the outer stage/apply          |
| `for (const x of xs) { await dispatch(thunkFoo({ uuid: x })) }`            | N patches, one per iteration               | Collect all data, then one `.change()` via `applyXxxStage` |
| `.change()` called before all elevation/REST fetches complete              | Doc mutation before data is ready          | Move all async I/O above the `.change()`                   |

## Worked example: renaming a station (op\* layer)

`opUpdateStationName` reads the current doc, builds a stage plan, then applies everything atomically in one `.change()`. A thunk can call this directly:

```typescript
// src/operations/op-station.ts (simplified)
export function opUpdateStationName(
  missionDocHandle: DocHandle<Mission>,
  stationUuid: string,
  newName: string
): void {
  const mission = missionDocHandle.doc();

  // 1. Build the traverse-rename cascade (sync — no I/O, no .change())
  const traverseRenames = stageAdjacentTraverseRenames(mission, { stationUuid, newName });
  if (traverseRenames === undefined) return; // station not found

  // 2. Apply the station rename + all adjacent traverse renames atomically
  missionDocHandle.change((m) => {
    applyUpdateStationByField(m, { stationUuid, fieldName: "name", value: newName });
    for (const { traverseUuid, newName } of traverseRenames) {
      applyUpdateTraverseByField(m, { traverseUuid, fieldName: "name", value: newName });
    }
  });
}
```

## Worked example: duplicating an EVA (thunk layer)

`thunkDuplicateEva` reads a doc mission, builds an `EvaDuplicationStageData` (which itself contains nested `StationDuplicationStageData` and `TraverseDuplicationStageData` items, each with its own `ActionsDuplicationStageData`), then applies the entire stage in one `.change()`:

```typescript
// src/store/thunk/thunkEva.ts (simplified)
export const thunkDuplicateEva = appCreateAsyncThunk(...)
  .async(args, { dispatch }) => {
    const mission = missionDocHandle.doc();

    // 1. Build the full stage (sync — no I/O, no .change())
    const stage = stageDuplicateEva(mission, args);

    // 2. Apply the entire stage atomically (eventually: delegate to opDuplicateEva)
    missionDocHandle.change(m => applyDuplicateEvaStage(m, stage));

    // 3. UI side-effects (after the doc is settled)
    dispatch(selectEva({ uuid: stage.newEvaUuid }));
  };
```

## When to add a new helper

| Adding…                                                                     | Layer                                                  | File                                                           |
| --------------------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------- |
| A simple single-entity field update (client-only)                           | `apply*` + `withMissionChange` at the call site        | `apply/apply-<entity>.ts`                                      |
| A compound multi-entity operation reusable on client and server             | `op*` orchestrating `apply*` / `stage*`                | `src/operations/<entity>.ts`                                   |
| Reusable plan-building logic shared across ops/thunks (pure sync)           | `stage*` builder + matching `apply<Op>Stage`           | `stage/stage-<op>.ts` + new apply in `apply/apply-<entity>.ts` |
| Client-only orchestration needing Redux dispatch or Redux-managed async I/O | `thunk*` delegating core mutation to an `op*` function | `src/store/thunk/*`                                            |

## Naming convention

- Inner mutators: `applyXxx(m: Mission, args)` — verb-form, present tense (`applyUpsertStation`, `applyDeleteActions`).
- Stage-applying helpers: `applyXxxStage(m: Mission, stage)` — explicit `Stage` suffix (`applyDuplicateEvaStage`).
- Stage builders: `stageXxx(mission: Mission, args) => XxxStageData | undefined` (`stageDuplicateEva`).
- Stage type names: end in `StageData` (`EvaDuplicationStageData`).
- Operations: `opXxx(missionDocHandle, args)` — verb-form, present tense (`opUpdateStationName`).
- Thunks: `thunkXxx`, unchanged.

## Detaching from Automerge proxies

Automerge returns _proxy_ objects when reading from the live document. Re-inserting a proxy (e.g. via `m.stations[newUuid] = oldStationProxy`) throws `RangeError: Cannot assign unknown object`. Even `cloneDeep` leaves residual linkage.

**Rule**: when an `apply*` or `stage*` function reads an entity from the doc and intends to re-insert it elsewhere (e.g. duplication), serialise through JSON to fully detach:

```typescript
const newStation: Station = JSON.parse(JSON.stringify(source));
```

This pattern is documented inline in `apply-action.ts` and `apply-traverse.ts`.

## See also

- `src/typings/thunkStageData.d.ts` — stage type definitions.
- `CLAUDE.md` — overall project conventions.
