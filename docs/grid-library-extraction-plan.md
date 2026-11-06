# Extracting Planetary Grid Reference into an npm library

Status: implemented, published, and validated, November 6, 2026.

## Execution record

- Package repository: [bfeist/planetary-grid-reference](https://github.com/bfeist/planetary-grid-reference),
  checked out at `F:\_repos\planetary-grid-reference`.
- Package: `@bfeist/planetary-grid-reference`, initial stable version `0.1.0`.
  Initial publication uses the `latest` distribution tag.
  [GitHub release](https://github.com/bfeist/planetary-grid-reference/releases/tag/v0.1.0).
  [npm package](https://www.npmjs.com/package/@bfeist/planetary-grid-reference).
- AEGIS integration: `feat-planetary-grid-library` in
  `F:\_repos\aegis2-planetary-grid`, branched from refreshed `origin/int` at
  `60cd965b077bb7f3dc2a8ec74af7cc2f7e3ac477`. The original `feat-mgrs`
  checkout remains available in `F:\_repos\aegis2`.
- The package owns the algorithms, independent fixtures, oracle tooling,
  benchmarks, browser example, methodology, and attribution. AEGIS retains its
  mission adapters, bearings, UI, and application integration tests.
- Validation: 1,698 package tests, an isolated packed browser example, a native
  ESM consumer, and a strict TypeScript consumer passed. All 12 reference JSON
  files remained byte-identical to the extraction source.
- AEGIS `npm run test:all` passed against the exact stable dependency: lint,
  TypeScript, frontend/API builds, 2,381 unit tests, and 466 browser tests.
- All 29 benchmark workloads completed in the source and extracted package.
  Representative planner means were 0.033/0.028 ms for source/package south LPS,
  2.166/1.734 ms for the fixed 100 m lunar equirectangular case, and
  0.218/0.182 ms for the small JSC ACC view. These local measurements found no
  extraction slowdown; timing differences are not a speedup guarantee.
- GitHub CI passed on Node 22 and 24. npm Trusted Publishing is configured for
  `bfeist/planetary-grid-reference` and `publish.yml`; future manual workflow
  releases use OIDC without a stored npm automation token.
- AEGIS pins registry version `0.1.0`, with its public tarball URL and SHA-512
  integrity in the lockfile. `proj4` is deduplicated with AEGIS's existing copy.
  A separate clean registry install passed using an isolated npm cache and no
  npm credentials. There is no sibling-checkout or local-tarball dependency.
- The GitHub release includes a tarball whose SHA-512 matches the npm artifact.
  The README identifies the package as primarily used by NASA's public AEGIS
  application and describes the selected LGRS features designed for browsers.

## Recommendation

Extract the reusable coordinate/grid engine into **Planetary Grid Reference**, a
JavaScript/TypeScript library for lunar reference grids and Earth analogs. Host it on the owner's personal GitHub
account, publish it to npm, and consume it from AEGIS. This is feasible with the current architecture:
`LgrsGridSystem` already separates body-specific calculations from grid planning,
and the planner returns geometry and labels for AEGIS to render.

Start with one package containing lunar LGRS/ACC, an Earth analog mode for training
and simulation, and an optional grid-planning entry point. Earth UTM/UPS and MGRS
provide the internal foundation for simulating LGRS-style grids on Earth. Keep mission policy, bearing calculations, React,
OpenLayers rendering, and application state in AEGIS. Preserve existing behavior
during extraction; API expansion and coordinate-methodology changes can follow
as separate releases.

The execution record above tracks implementation of the plan below.

## Source baseline

Use the complete implementation on `feat-mgrs` as the initial extraction source,
including the lunar functionality that supersedes the older implementation on
`int`. Do not build a package by independently combining both directory trees.

At the time of inspection:

| Ref                             | Commit                                     | Relevant state                                                                                 |
| ------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `feat-mgrs`                     | `212d2a4355bd555469722b1c8f082b128b9fd231` | Shared system interface, Moon and Earth implementations, generic grid planner, reference tests |
| Local `int`                     | `d7dc7680172f43a186d0ff54c7ab7f3278a07753` | Earlier `dynamicGrid.ts` and `southLps.ts` implementation                                      |
| Local `origin/int` tracking ref | `60cd965b077bb7f3dc2a8ec74af7cc2f7e3ac477` | Separate tracking snapshot; not fetched during this assessment                                 |

Refresh the refs before implementation and record the actual extraction commit.
Review relevant changes since that commit before migrating AEGIS. Retain useful
legacy compatibility fixtures, especially the south-LPS golden data.

## Package boundary

| Capability                                                              | Standalone package                                                    | AEGIS                                                                            |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Lunar M2025 LTM/LPS classification, projection, LGRS and ACC formatting | Owns algorithms, constants, and numerical boundary behavior           | Selects the system                                                               |
| Earth analog mode backed by WGS84 UTM/UPS, MGRS, and ACC formatting     | Owns internal algorithms, zone exceptions, and area-prefix convention | Selects the analog label scheme                                                  |
| Region geometry, clipping, map/grid transforms, grid planning           | Returns plain geometry, label data, and effective spacing             | Supplies viewport/options and renders the result                                 |
| Mission defaults and overrides                                          | Accepts explicit system and scheme                                    | Resolves mission fields, defaults, user overrides, and persistence               |
| Projection compatibility                                                | Provides projection conversion and any generic validation primitives  | Maps mission projection fields and decides warnings or blocking behavior         |
| Coordinate readouts and exports                                         | Formats explicit coordinates at a requested precision                 | Chooses precision/style and export fields                                        |
| Bearings and navigation                                                 | Provides projections used by callers                                  | Keeps grid bearings, surf-nav compatibility, and range/distance policy initially |
| UI                                                                      | No React, OpenLayers, Redux, DOM, or AEGIS dependencies               | Owns all components, hooks, menus, styles, and state                             |

Bearing calculations stay in AEGIS for the first release. They can already use
the package's classification and projection methods, including projecting both
endpoints into the origin's region. A future generic bearing API is possible if
another consumer needs it; it is not required for this extraction.

### File mapping

- Move `src/utils/lgrs/moon/`, `earth/`, and `common.ts` into the package.
- Move `grid/plan.ts`, `grid/clip.ts`, and `gridBinding.ts` into its grid entry point.
- Split `mapProjection.ts`: move generic proj4 conversion, caching, and fast paths;
  retain `getLgrsMapProjection(mission)` in AEGIS.
- Split `system.ts`: export generic `getGridSystem(id, scheme)` from the package;
  retain mission resolution, defaults, overrides, and readout gating in AEGIS.
- Keep `compatibility.ts` in AEGIS initially. It combines mission policy, radius
  warnings, projection selection, and user-facing messages.
- Keep `bearing.ts` in AEGIS, importing the extracted system types and projection
  methods. Do not move the broader surf-nav module into the package.
- Keep top-level `display.ts` in AEGIS: it contains UI text, application precision,
  and an `AEGISPoint` adapter. Body-specific point formatting stays in the package.
- Split `src/typings/lgrs.d.ts`, `lgrsEarth.d.ts`, and `lgrsGrid.d.ts` into explicit
  exported module types. Keep `Mission`-dependent aliases in AEGIS.
- Keep `Grid.tsx`, `useMissionGridSystem.ts`, `MouseCoordinateDisplay.tsx`, admin
  mission configuration, store calculations, and export integration in AEGIS.

## Public API and package layout

Working project name: **Planetary Grid Reference**. Working repository name:
`planetary-grid-reference`. Working npm name:
`@<npm-user>/planetary-grid-reference`, or unscoped `planetary-grid-reference` if
available and preferred. The package description supplies the JavaScript/TypeScript
context; a `-js` suffix is optional.
Confirm name availability and the GitHub owner/npm scope when implementation
starts. The two account names need not match.

Use a distinct project identity because this implementation covers a subset of
the public Python [LGRS repository](https://github.com/rbeyer/lgrs)'s functionality
and adds its own Earth analog and grid-planning features. Credit that project as
a reference and source where applicable. Document numerical differences and
extensions, and publish a supported-feature comparison before the first release.
The README should describe the actual projection, formatting, and planning APIs
without suggesting a complete Python port or drop-in replacement.

The initial supported bodies are the Moon and Earth. The broader name leaves
room for later implementations; it does not promise arbitrary planetary bodies,
datums, or reference systems in the first release.

Position MGRS as an implementation detail of the Earth analog feature rather than
a separate general-purpose MGRS product. Keep low-level MGRS helpers internal to
the package. Preserve the existing `mgrs` label scheme through the analog system
interface so AEGIS can retain its canonical MGRS display and export behavior.
Describe those outputs accurately as MGRS; Earth analog ACC remains the distinct
LGRS-style simulation format.

Suggested entry points:

| Entry point  | Purpose                                                         |
| ------------ | --------------------------------------------------------------- |
| Package root | System selection and public coordinate/system types             |
| `/moon`      | Lunar classification, projection, LGRS and ACC formatting       |
| `/analogs`   | Earth analog system selection, projection, and label formatting |
| `/grid`      | Map projection binding, clipping, and render-plan generation    |

Keep the first API close to the existing functions. Publish only documented
exports; keep caches, proj4 implementation details, and temporary buffers private
where practical. The root coordinate API should not load the grid planner.
The internal `earth/` source directory can retain its name; it does not require a
public `/earth` or `/mgrs` entry point. AEGIS accesses Earth calculations through
the analog system interface and its supported label schemes.

Replace ambient AEGIS globals with imported/exported types. Use explicit numeric
latitude/longitude inputs or package-owned coordinate types, documenting axis
order, degrees versus radians, metres, null/error behavior, valid precisions,
and the fact that CRS IDs are meaningful only within their grid system.

Keep system identifiers and scheme values compatible with persisted AEGIS data:
`moon-m2025`, `earth-wgs84`, `lunar-acc`, and `mgrs`. Do not rename persisted
mission fields as part of this work.

Build ESM JavaScript and TypeScript declarations with explicit package `exports`.
AEGIS is already ESM, so CommonJS support is not an initial requirement. Set the
supported Node versions based on the selected toolchain and verify browser use.
Declare `proj4` as the runtime dependency, external to the library build; begin
with the version already used by AEGIS to limit numerical changes. Other
tooling and the Python oracle remain development dependencies.

Use a package `files` allowlist for built output, README, license, and attribution
files. Ship compiled JavaScript and declarations so consumers need no special
TypeScript source compilation. Keep fixtures and Python tooling in the GitHub
repository rather than the npm runtime payload.

## README documentation requirements

The package README should introduce the project as a browser-oriented port of
specific aspects of Python LGRS. Suggested opening text:

> Planetary Grid Reference is a JavaScript/TypeScript port of selected aspects of
> the Python [LGRS project](https://github.com/rbeyer/lgrs), designed for use in web
> browsers. It brings lunar LTM/LPS coordinate projection and LGRS/ACC formatting
> to browser applications, with additional grid-planning and Earth analog
> capabilities. It implements a focused subset of Python LGRS; see the feature
> comparison for supported functionality and differences.

The README must include:

- **Ported scope and provenance:** identify the specific lunar classification,
  projection, and formatting aspects carried over from LGRS, link the upstream
  repository and USGS methodology, and record the reference version used for
  validation. Distinguish translated code from implementations of published
  formulas and project-specific extensions.
- **Feature comparison:** list supported aspects, Python LGRS features outside
  the port's scope, and added functionality. Check this comparison against the
  actual implementation before release; include known numerical differences.
- **Browser use:** explain that coordinate calculations run locally in the
  browser without a Python runtime or a calculation server. Include npm install
  instructions and a runnable ESM browser example through a standard bundler,
  showing lunar coordinate formatting and the required input units/axis order.
  Runtime imports must work without Node built-in modules or Node polyfills.
- **Rendering integration:** show how an application obtains grid geometry and
  labels and supplies its own map renderer. Explain that React, OpenLayers, and
  AEGIS are not required to consume the library.
- **Earth analogs:** describe LGRS-style training on Earth, its internal WGS84
  UTM/UPS and MGRS foundation, the custom ACC area prefix, and the distinction
  from published USGS grids with site-specific origins.
- **Development versus runtime:** explain that Python and the pinned LGRS
  reference are used to generate validation fixtures, not shipped as browser
  dependencies. Document browser support verified by the release checks.

## Coordinate conventions and attribution

Carry the methodology and source references from the existing
[implementation README](../src/utils/lgrs/README.md) into the library's docs.
In particular, explain these distinctions:

- Lunar LGRS/ACC follows the USGS M2025 report and uses the documented lunar
  sphere and LTM/LPS parameters.
- Earth analog mode uses WGS84 UTM/UPS and MGRS zone/band and square rules
  internally. This simulates LGRS-style navigation on Earth; it does not apply
  the Moon's projection parameters to Earth coordinates.
- Worldwide Earth ACC area prefixes are an AEGIS-originated convention based on
  MGRS 100 km squares subdivided into sixteen 25 km areas. They are not a
  USGS-defined worldwide terrestrial ACC namespace.
- Published USGS training grids can use site-specific origins. Extracting the
  dynamic engine does not make its coordinates match those grids. Retain
  AEGIS's server-file workflow; custom-origin support is a separate feature.
- Preserve documented point-versus-box label semantics, seam ownership,
  truncation rules, and the deliberate UPS transition at exactly 84 degrees north.

Record which files are ports, independent implementations of published formulas,
or original extensions. Carry relevant source notices and document modifications.
The pinned Python reference has an
[Apache-2.0 license](https://github.com/rbeyer/lgrs/blob/v0.4.0/LICENSE), and
proj4 includes its own [license notices](https://github.com/proj4js/proj4js/blob/main/LICENSE.md).
Include the notices applicable to copied or translated code, including proj4
fast-path formulas. Select and record the library's license with those sources
in view.

Move [the upstream issue notes](lgrs-upstream-issues.md) with the implementation
documentation and preserve the pinned reference version. Describe the library as
an implementation using these sources, without implying USGS endorsement.

## Implementation sequence

### 1. Establish a behavior baseline

- Refresh branch refs, choose the source commit, and inventory all consumers.
- Run the current coordinate/grid unit tests and relevant browser tests. Record
  existing failures before changing imports.
- Record representative lunar, Earth ACC, and MGRS outputs and the current
  performance benchmarks. Use the existing fixtures rather than regenerating
  expected results during the move.

Exit condition: the source implementation and its behavior are reproducible.

Baseline commands from the AEGIS root:

```sh
npm run test:vitest -- src/tests/vitest/utils/lgrs
npm run test:vitest:browser -- Grid.browser MouseCoordinateDisplay AdminMissionGrid
```

### 2. Create and extract the package locally

- Create a sibling working directory with its own package manifest, lockfile,
  TypeScript configuration, linting, build, and independent test configuration.
- Move only the reusable files and split adapters according to the table above.
  Avoid importing the entire AEGIS Git history into the new repository.
- Convert global types and path aliases to ordinary package imports. Extract
  `getGridSystem` without mission-specific helpers or AEGIS defaults.
- Expose the Earth analog system through `/analogs`; keep MGRS implementation
  helpers private while preserving the system methods AEGIS needs for both schemes.
- Preserve algorithms and numerical tolerances. Keep package naming/type cleanup
  separate from behavior changes.
- Add a small runnable usage example for each supported coordinate scheme and
  one geometry-planning example that does not require React or OpenLayers.
- Write the package README using the requirements above and verify its browser
  example against the packed package rather than private source imports.

Exit condition: build, type checking, and engine tests work without AEGIS present,
and the public declarations reference no AEGIS types or private source paths.

### 3. Move independent validation

- Move engine tests from `src/tests/vitest/utils/lgrs/`, splitting mixed
  mission-policy tests where necessary. Bearing tests remain in AEGIS.
- Move `src/tests/vitest/fixtures/lgrs/`, `fixtures/lgrs-earth/v1/`, and
  `scripts/lgrs-reference/` with their metadata, pinned dependencies, and docs.
- Give the package a standalone test setup. The existing AEGIS Vitest config
  imports the application Vite config and setup hooks; copying it would retain
  application coupling.
- Preserve lunar corpus checks and upstream exceptions; Earth projection,
  classification, MGRS/ACC, boundary, grid property, and golden tests; and map
  projection/affine fast-path checks.
- Retain the existing Earth projection tolerance of one micrometre per axis,
  exact projected-coordinate formatting, and documented near-boundary allowance
  for end-to-end strings. Keep the Python oracle independent of TypeScript.
- Move relevant engine benchmarks from `src/tests/vitest/bench/lgrs.bench.ts`.
  Compare representative planning workloads before and after extraction.

Exit condition: independent fixture validation passes without altered expected
outputs or relaxed tolerances, and no material planning regression is unexplained.

### 4. Integrate the packed artifact into AEGIS

- Build and run `npm pack` in the library, inspect the tarball contents, and
  install that tarball into AEGIS for the migration trial. This verifies the
  published shape, declaration paths, and exports.
- Replace engine imports with package imports. Initially, thin local re-exports
  can reduce churn; keep one implementation of each algorithm after migration.
- Update AEGIS adapters and type imports. Keep mission defaults, scheme overrides,
  compatibility messaging, bearing behavior, and export policy in AEGIS.
- Exercise the existing UI integration: dynamic Moon/Earth grids, both Earth
  schemes, custom projections, minimap spacing, readouts, and exports. Preserve
  the server-file path and legacy mission defaults.
- Run the targeted integration tests, then the repository's `npm run test:all`
  before completing the migration. Check the browser build for duplicate proj4
  copies and unwanted grid-planner inclusion in coordinate-only imports.

Exit condition: AEGIS behaves the same while consuming the packed package, and
the standalone package has no reverse dependency on AEGIS.

### 5. Publish and switch to a registry version

- Create the personal GitHub repository and push the extracted source, tests,
  documentation, license/notices, and CI workflow.
- Configure CI to build, type-check, test, and inspect the package contents.
  Start with a deliberate maintainer release; publishing automation can follow.
- Publish the initial scoped stable release, `0.1.0`, under the `latest`
  tag. Scoped public packages require explicit public access when publishing;
  follow the current [npm publishing documentation](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages/)
  for authentication and release commands.
- Install the exact registry version in AEGIS, commit the lockfile, and rerun
  relevant checks against that artifact. Replace the temporary tarball dependency.
- Document API and coordinate-output changes in release notes, including changes
  to custom ACC conventions. Future engine fixes belong in the library first.

Exit condition: a clean AEGIS install resolves the published version and passes
validation without a sibling checkout, symlink, or local tarball.

## Completion criteria and rollback

- The package works in a minimal Node consumer and a browser build, with usable
  TypeScript declarations and no application setup.
- Existing lunar, Earth MGRS, and Earth ACC reference results remain compatible.
- AEGIS keeps its UI, mission policy, readout/export policy, and bearing adapters.
- Published docs present Planetary Grid Reference as a library for lunar grids and
  Earth analogs, state its supported subset relative to Python LGRS, and explain
  the internal MGRS basis, custom Earth ACC prefix, and training-grid origins.
- The README identifies the selected LGRS aspects being ported and demonstrates
  browser use without a Python runtime, calculation server, or Node polyfills.
- GitHub source, npm version, extraction commit, and attribution are traceable.
- The AEGIS migration is isolated from coordinate behavior changes. If integration
  reveals a regression, revert the migration commit and dependency/lockfile update
  together while fixing the library; do not retain a permanent second engine.

Decisions needed when implementation begins: final project/package name and its
availability, GitHub owner, npm scope, package license, and supported runtime versions. The proposed
first-release boundary keeps bearings in AEGIS and includes reusable grid planning.
