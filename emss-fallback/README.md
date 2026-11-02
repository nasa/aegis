# `@emss/*` fallbacks (public build)

Minimal stand-ins for the private `@emss/*` packages hosted on NASA's internal
registry. Used by `npm run setup:public` to populate `node_modules/@emss/*`
without registry access.

## How it works

`@emss/*` packages are declared as `optionalDependencies`. `npm run setup:public`
runs `npm install --omit=optional` then [`install.mjs`](./install.mjs), which
copies stubs from [`packages/`](./packages/) into `node_modules/@emss/*`.
`install.mjs` is idempotent — it skips any package already present.

npm silently skips an optional package it fails to download, so a NASA install
without registry access would otherwise "succeed" with no `@emss/*` packages.
[`check-installed.mjs`](./check-installed.mjs) runs on `postinstall` and fails
the install if any are missing, unless optional deps were omitted on purpose
(`--omit=optional`).

Each stub is a real, resolvable ESM package (`index.js`, `index.d.ts`,
`package.json` with `exports` map) mirroring the real package's signatures, so
all `@emss/*` imports work without changes.

## Stubs

- **utils** — `asError` / `assertEnvVarsExist`
- **logger** — console output only (remote sink is a no-op)
- **oauth2-proxy-backend / -frontend** — mock auth for `MOCK_USER=true`
- **oauth2-proxy-common / logger/types** — type-only mirrors

If you add a new `@emss/*` import, add the export to the matching stub in `packages/`.
