# Public container demo

The public workflow runs nginx, AEGIS, a small mock JWT gateway, and AEGIS's PostgreSQL database.
No identity database, account administration, password storage, NASA npm registry access, or Bash
is required. NASA deployments keep their existing Compose files and real `@emss/*` packages.

## Start locally

Install Node.js 24 and Docker with Docker Compose, clone the repository, then run:

```sh
npm run setup:public
npm run dev:public
```

`setup:public` creates `.env.public` with random secrets, validates its HTTPS settings, and
creates the `STATIC_DIR/missionFiles` directory. Running it again preserves existing settings
and secrets. It does not install host packages or modify a native development `.env`.

`dev:public` builds the public images, removes obsolete containers belonging to this demo
project, starts the four services, and waits for their health checks. The images install public
dependencies and local EMSS fallbacks. No host `npm install` is needed. Schema and Automerge
migrations run before the API starts, and an empty database is seeded with Apollo 14.

Open `https://localhost:8443` and accept the self-signed preview certificate. Choose a button:

| Button     | Identity        | Access                                                                                                                      |
| ---------- | --------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Superadmin | Neil Armstrong  | The current Neil mock's five EMSS roles, including `AEGIS-Superuser` and `EMSS-Superuser`; all missions and administration. |
| User       | Buzz Aldrin     | `AEGIS-Editor`; mission access is assigned through AEGIS grants or groups.                                                  |
| Guest      | Michael Collins | No elevated roles; receives the Public-user mission baseline.                                                               |

Choose Neil first to see Apollo 14. To compare the other identities, use Mission Management's
permissions screen to grant Buzz access and grant the reserved Public user viewer access.
Michael is a distinct identity; the Public row supplies the baseline. Visit `/logout` to return
to the buttons and switch identities. No username or password is needed.

## Commands

Run these from the repository root. Public commands use `.env.public` and
`docker-compose.public.yml`; they do not select the NASA Compose stack.

| Command                                 | Behavior                                                                                                                        |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `npm run setup:public`                  | Create or validate demo settings and asset directories; preserve existing secrets.                                              |
| `npm run dev:public`                    | Build and start the demo, waiting until healthy.                                                                                |
| `npm run docker:public`                 | Alias for `dev:public`.                                                                                                         |
| `npm run docker:public:build`           | Build the public images without starting services.                                                                              |
| `npm run docker:public:rebuild`         | Rebuild and start the demo.                                                                                                     |
| `npm run docker:public:rebuild:nocache` | Build without cache; then use `dev:public` to start.                                                                            |
| `npm run docker:public:status`          | Show service status.                                                                                                            |
| `npm run docker:public:logs`            | Follow service logs; append `-- apiv1` to select one service.                                                                   |
| `npm run docker:public:stop`            | Stop services, preserving containers and data.                                                                                  |
| `npm run docker:public:down`            | Remove demo containers and network, preserving database and TLS volumes.                                                        |
| `npm run docker:public:exec -- sh`      | Open a shell in the running API container.                                                                                      |
| `npm run migration:public`              | Apply compiled relational and Automerge migrations in the running API. Startup also applies them.                               |
| `npm run seed:demo`                     | Add Apollo 14 through the running API container without dropping tables; skip an existing Apollo 14 mission.                    |
| `npm run test:auth:public`              | Run dependency-free gateway, fallback, setup, and manifest tests.                                                               |
| `npm run test:public`                   | Run those checks and browser checks in a disposable stack with its own database and static volume; requires host tooling below. |

`docker:services:public` is a compatibility alias for `dev:public`; it now starts the complete
demo. For direct Compose options, use
`node docker/public/compose.mjs <command> [args]`. `bash appcompose public <command>` delegates to
the same wrapper for users who already use `appcompose`.

In PowerShell, use `npm.cmd` when forwarding flags, for example
`npm.cmd run docker:public:exec -- node --version`, so the `--` separator reaches npm.

Unless listed above, the `dev`, `dev:ci`, `vite:*`, `api:*`, `build`, `lint:*`, `tsc`, `migration:*`,
`automerge:*`, `test:vitest*`, `test:coverage*`, `test:playwright*`, and `test:loadtest*` commands
remain host development tools. They need host dependencies and, when they access the database,
a configured native `.env` and PostgreSQL instance. `seed:demo:local` is the non-destructive
native seed command. `migration:fresh` is an explicit native schema reset; the public demo does
not run it. `docker:services*` and `docker:preview*` without the public suffix are NASA workflows.
`make-dotenv` and `bom` require NASA tooling; `version:*` are maintainer release commands that
push to Git. None is required to run this demo.

## Optional host tooling

To run the integration check, build locally, or work on code outside NASA:

```sh
npm run setup:public:packages
npm run test:public:install-browser
npm run test:public
```

Use the npm version declared by `packageManager` in `package.json`. The public package installer
stages a complete dependency tree using copies of the manifest and lockfile. It removes only
private `@emss/*` optional dependencies, keeps public native optional packages, installs the EMSS
fallbacks, and replaces the local `node_modules` after installation succeeds. The tracked
manifest and lockfile are preserved. Stop host development servers before replacing their
dependencies. The Docker build uses the same installer.

The browser check builds the public images and creates a uniquely named, disposable Compose
project on a free local port. Its database, certificate, and static files use separate named
volumes; it never mounts your `STATIC_DIR` or changes the running demo. All test resources are
removed afterward. Direct invocation of `test-auth.mjs` against the live demo is refused.
Host database test suites use
the native `.env`, not `.env.public`. Native `npm run dev` still uses its single
`MOCK_USER=true` Neil identity; the three-button flow is served through the public gateway.

## Data and configuration

The demo keeps its data in the `public-database` volume and its certificate in `public-tls`.
Restarting or taking down the stack does not erase either. Existing missions are preserved;
startup seeding only runs when the mission listing is empty. Set `PUBLIC_DEMO_SEED=false` to
disable it. `seed:demo` can also add Apollo 14 to a database with other missions.

The [main README](../../README.md#download-the-apollo-14-assets) explains how to obtain the GIS
bundle. Extract it into the `missionFiles` directory under `STATIC_DIR` from `.env.public`.
The mission geometry exists without those files; terrain and imagery require the assets.

`PUBLIC_ORIGIN` is the HTTPS origin without a trailing slash. `PUBLIC_HOST` and `PUBLIC_PORT`
must match it. Only nginx publishes a port, bound to `127.0.0.1` by default. A different HTTPS
hostname needs a matching certificate mounted at `/etc/nginx/certs/tls.crt` and `tls.key`.

## Authentication behavior

The gateway implements the existing `/oauth2/start`, `/oauth2/sign_in`, `/oauth2/auth`,
`/oauth2/userinfo`, and `/oauth2/sign_out` contract. A selection creates an eight-hour signed,
HttpOnly, Secure, SameSite=Lax cookie with the persona and expiry. There is no server-side
identity or session store. nginx validates the session through the gateway and forwards a fresh
five-minute JWT with the expected `nasa_*` claims as `X-Access-Token`. AEGIS runs with
`MOCK_USER=false` and uses its existing identity, ownership, mission grants, and groups.

The fallback qualifies each fixed identifier with the issuer. Keep `PUBLIC_ORIGIN` stable to
preserve grants and ownership. Restarting the gateway preserves sessions while
`PUBLIC_COOKIE_SECRET` stays the same; rotating it invalidates existing cookies. Logout clears
the browser cookie. A copied cookie remains usable until expiry or key rotation.

Client-supplied identity headers are replaced by nginx. Machine routes receive no browser
identity and keep their existing API-key checks. The API and gateway must stay behind nginx.
Anyone who can reach this mock chooser can select Superadmin, so use it for local demos and
trusted collaborators. Both browser socket transports require a session at connection time;
existing sockets survive logout, and Automerge still lacks server-side per-mission authorization.
Maestro's Socket.IO namespace shares that gateway; API-key-only REST routes remain available.
