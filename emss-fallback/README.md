# Public EMSS compatibility packages

The public container build substitutes these packages for NASA's private `@emss/*` dependencies.
All application imports remain unchanged. NASA installs use ordinary `npm ci` / `npm install`
and never invoke this workflow.

To run the demo, use `npm run setup:public` and `npm run dev:public`. Containers install their
own dependencies; host packages are optional. For host build, lint, and integration tooling:

```sh
npm run setup:public:packages
```

Use the npm version in the root `packageManager` field. [`setup.mjs`](setup.mjs) creates temporary
copies of the package manifest and lockfile in `.local`, removes private EMSS dependencies through
[`public-manifests.mjs`](public-manifests.mjs), and installs a complete tree. Public optional
dependencies, including platform-native build tools, are retained. It installs the fallbacks
into that tree and replaces `node_modules` only after installation succeeds. The original
`package.json` and `package-lock.json` remain unchanged. The public Docker build uses the same
command, so host and container preparation agree.

[`install.mjs`](install.mjs) is the lower-level fallback wiring step. It copies the ESM packages
from [`packages/`](packages/) into a supplied `node_modules/@emss` directory and refreshes existing
fallbacks while preserving individual registry packages. It is not a lifecycle hook. Running
`node emss-fallback/install.mjs` alone only wires packages; it does not install other dependencies.

- **utils**: `asError` and `assertEnvVarsExist`.
- **logger**: console output; remote logging is disabled.
- **oauth2-proxy-backend / -frontend**: forwarded JWT decoding, login popup, and fetch retry.
- **oauth2-proxy-common / logger/types**: type mirrors.

The decoder qualifies `nasa_employeenumber` with the JWT issuer and trusts the nginx/gateway
boundary to validate the session. See the [public container guide](../docker/public/README.md).
If a new application import needs another EMSS export, add it to the corresponding fallback.
