# Automerge Mutation Architecture

All mutations of the `Mission` Automerge document go through one of these layers.

## The three layers

| Layer    | Location            | Purpose                                                                     | I/O allowed? | Calls `.change()`? |
| -------- | ------------------- | --------------------------------------------------------------------------- | ------------ | ------------------ |
| `apply*` | `apply/*.ts`        | Inner draft mutator. Receives `(m: Mission, …args)` and mutates the draft.  | ❌ Pure sync | ❌ Never           |
| `stage*` | `stage/*.ts`        | Plan builder. Receives a `Mission` snapshot, returns a typed `*StageData`.  | ⚠ Restricted | ❌ Never           |
| `thunk*` | `src/store/thunk/*` | Async / Redux orchestrator. Runs **one** `.change()` per logical operation. | ✅ Yes       | ✅ Typically once  |

## The atomicity boundary: `withMissionChange`

`withMissionChange((m) => applyFoo(m, args))` is the only sanctioned way for code outside `src/store/thunk/**` to mutate the doc. It centralises the null-guard and the `.change()` call. **Exactly one `withMissionChange` (or `missionDocHandle.change`) call per logical user operation.**

Composing multiple applies atomically is trivial:

```typescript
withMissionChange((m) => {
  applyDeleteActions(m, actionUuids);
  applyDeleteStations(m, stationUuids);
});
```

## When to use a thunk

Promote orchestration to a thunk if any of:

- it needs async I/O (e.g. elevation fetch),
- it needs Redux `dispatch` context (e.g. UI selection updates after the mutation),
- it reads non-trivial state from the doc before mutating (e.g. "find the running REX"),
- the logic is reused across multiple call sites.

Otherwise, call `withMissionChange((m) => applyFoo(m, args))` directly from the component.

## Hard rules (ESLint-enforced)

1. `apply*` may only call other `apply*`. No `.change()`. No `getMissionDocHandle`. No thunks.
2. `stage*` receives a `Mission` parameter; never calls `.change()`; may only import the allow-listed read-only thunks (currently `thunkGetElevation`).
3. Outside `src/store/thunk/**` and `automergeDocHandles.ts`, `missionDocHandle.change()` is forbidden in components. Use `withMissionChange` instead.
4. A thunk runs at most one `.change()` (or `withMissionChange`) per logical operation.

### Thunk atomicity checklist

Before committing a thunk, verify:

- [ ] The thunk body contains exactly **one** `missionDocHandle.change(...)` call.
- [ ] No dispatched sub-thunk also calls `.change()` (trace the full call tree).
- [ ] No `.change()` call appears inside a `for`, `forEach`, `map`, or other loop body (directly or via a called thunk).
- [ ] All async I/O (`await dispatch(thunkGetElevation(...))`, REST fetches) runs **before** the `.change()`.
- [ ] UI dispatches (Redux slice setters, non-Automerge side-effects) run **after** the `.change()`.

## Two tiers of `stage*` functions

Most stages are **pure sync** (`stageDuplicateEva`, `stageDeleteRex`, etc.) — they read the passed-in `Mission`, allocate uuids, and return a plain data plan. This is the default tier and should be preferred whenever possible.

A small number of stages are **async** because they need to enrich the stage data with values from a read-only API (currently: elevation profile from `thunkGetElevation`). `stageTraverseUpdate` is the canonical example. Async stages still:

- Receive `mission: Mission` as a parameter (no `getMissionDocHandle()` calls).
- Never call `.change()` themselves.
- Never call any mutation thunk — only the explicit allow-list of read-only data thunks.

The caller still `await`s the stage and applies it inside a single sync `.change()` callback.

## Why?

Automerge commits each `.change()` call immediately and broadcasts the resulting patch to all peers. Splitting one logical operation across multiple `.change()` calls means peers can observe a half-built state — orphan entities, broken parent references, etc.

By disciplining every mutation through these layers, complex multi-entity operations like duplicating an EVA or deleting a REX collapse to one atomic patch.

### Common violation patterns to avoid

| Anti-pattern                                                               | Why it violates atomicity                         | Fix                                                         |
| -------------------------------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------- |
| Calling `await dispatch(thunkFoo(...))` where `thunkFoo` calls `.change()` | Adds a second patch to the same logical op        | Inline the inner logic into the outer stage/apply           |
| `for (const x of xs) { await dispatch(thunkFoo({ uuid: x })) }`           | N patches, one per iteration                      | Collect all data, then one `.change()` via `applyXxxStage`  |
| `.change()` called before all elevation/REST fetches complete              | Doc mutation before data is ready                 | Move all async I/O above the `.change()`                    |

## Worked example: duplicating an EVA

`thunkDuplicateEva` reads a doc mission, builds an `EvaDuplicationStageData` (which itself contains nested `StationDuplicationStageData` and `TraverseDuplicationStageData` items, each with its own `ActionsDuplicationStageData`), then applies the entire stage in one `.change()`:

```typescript
// src/store/thunk/thunkEva.ts (simplified)
export const thunkDuplicateEva = appCreateAsyncThunk(...)
  .async(args, { dispatch }) => {
    const mission = missionDocHandle.doc();

    // 1. Build the full stage (sync — no I/O, no .change())
    const stage = stageDuplicateEva(mission, args);

    // 2. Apply the entire stage atomically
    missionDocHandle.change(m => applyDuplicateEvaStage(m, stage));

    // 3. UI side-effects (after the doc is settled)
    dispatch(selectEva({ uuid: stage.newEvaUuid }));
  };
```

## When to add a new helper

| Adding…                                                                                            | Layer                                                                    | File                                                           |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------- |
| A simple single-entity field update                                                                | `apply*` + `withMissionChange` at the call site                          | `apply/apply-<entity>.ts`                                      |
| A compound multi-entity operation that's pure sync                                                 | `apply*` composing other `apply*` + `withMissionChange` at call site     | same                                                           |
| Reusable plan-building logic shared across thunks (pure sync)                                      | `stage*` builder + matching `apply<Op>Stage` + `thunk*`                  | `stage/stage-<op>.ts` + new apply in `apply/apply-<entity>.ts` |
| Ad-hoc orchestration that doesn't generalise                                                       | `thunk*` that pre-computes async data then applies via `apply*` in one `.change()` | `src/store/thunk/*`                                   |

## Naming convention

- Inner mutators: `applyXxx(m: Mission, args)` — verb-form, present tense (`applyUpsertStation`, `applyDeleteActions`).
- Stage-applying helpers: `applyXxxStage(m: Mission, stage)` — explicit `Stage` suffix (`applyDuplicateEvaStage`).
- Stage builders: `stageXxx(mission: Mission, args) => XxxStageData | undefined` (`stageDuplicateEva`).
- Stage type names: end in `StageData` (`EvaDuplicationStageData`).
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
