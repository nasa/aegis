# AEGIS Zero

## Getting Started

### All install methods

For all install methods, do the following:

1. Create a `.env` file by copying `.env.example`
   1. Pick a strong password for `AEGIS_DB_PASS`
2. **Elevated privileges required:** Add `127.0.0.1 aegis-local.fit.nasa.gov` to your "hosts" file.
   1. Windows: Open the start menu, type "notepad", right-click on "Notepad" and select "open as administrator". In Notepad go to `C:\Windows\System32\drivers\etc`, show all files, and open the `hosts` file.
   2. Mac: Edit `/etc/hosts`
   3. Content to add at the bottom of the file (add CODA/Maestro/Labs while you're at it):
      ```
      127.0.0.1 aegis-local.fit.nasa.gov
      127.0.0.1 coda-local.fit.nasa.gov
      127.0.0.1 maestro-local.fit.nasa.gov
      127.0.0.1 emss-labs-local.fit.nasa.gov
      ```
3. To setup a self-signed certificate, in a terminal run: `./scripts/make-dev-ssl-cert.sh`
4. Perform steps for either "Fully docker-compose" or "Just database via docker-compose" below.

### Fully docker-compose

Perform "All install methods" instructions above before performing the following.

1. In `.env`, set `AEGIS_DB_HOST` to `database`
2. Run Docker Compose:
   1. Dev mode: `npm run docker:dev`
   2. Production preview: `npm run docker:preview`
3. Seed the database with the `admin` user and some content (e.g. Apollo 14): `docker-compose exec nextjs npm run seed`
4. Open [https://aegis-local.fit.nasa.gov](https://aegis-local.fit.nasa.gov) with your browser. In dev, username and password are both `admin`.

To stop, run `docker compose down`.

### Just database via docker-compose

Perform "All install methods" instructions above before performing the following.

1. In `.env`, set `AEGIS_DB_HOST` to `localhost`
2. Run Docker Compose: `docker-compose up -d database` to start only the database.
3. Setup the database: `npm run migrate:up`
4. Seed the database with the `admin` user and some content (e.g. Apollo 14): `npm run seed`
5. Run `npm run dev` to start the frontend.
6. Open [http://aegis-local.fit.nasa.gov:4000](http://aegis-local.fit.nasa.gov:4000) with your browser (lack of https). In dev, username and password are both `admin`.

## Helpful docker commands

### Seeing container logs

```bash
docker logs nginx -f
docker logs nextjs -f
docker logs database -f
```

### Restart individual services

```bash
docker restart nginx
docker restart nextjs
docker restart database
```

## Nuke your local database

Delete your `./.local/database` directory. This directory saves database state on your host, even if you do `docker-compose down` you'll still have the database data saved. By deleting `./.local/database` you remove all data.

## Using the app

- Login with admin/admin
- Select a Mission (such as Apollo 14)
- Choose map imagery from left gutter
- Expand the Map Imagery Detailed Settings and turn on a layer (such as a Basemap)
- The hamburger menu will take you back to the login screen

## Trying out the different methods of starting AEGIS

To try each of the methods of starting AEGIS locally, do the following.

```bash
# 1. Make sure you've got the right deps
npm i

# 2. Get a clean env prior to each test (no containers, nuke database)
docker-compose down --remove-orphans
rm -rf ./.local/database

# 3. TEST "docker:preview"
# ENSURE .env AEGIS_DB_HOST set to "database"
npm run docker:preview:rebuild
npm run docker:preview
docker-compose exec nextjs npm run seed
# VERIFY https://aegis-local.fit.nasa.gov, make note of speed

# 4. Clean env
docker-compose down --remove-orphans
rm -rf ./.local/database

# 5. TEST "docker:dev"
# ENSURE .env AEGIS_DB_HOST set to "database"
npm run docker:dev:rebuild
npm run docker:dev
docker-compose exec nextjs npm run seed
# VERIFY https://aegis-local.fit.nasa.gov, report slowness compared to "preview"

# 6. Clean env
docker-compose down --remove-orphans
rm -rf ./.local/database

# 7. TEST local node, container database
# CHANGE .env AEGIS_DB_HOST set to "localhost"
docker-compose up -d database # just booting database container
# wait about 30 seconds. Database isn't really ready right away.
npm run migrate:up # if this fails, wait a little longer then try again (waiting for database)
npm run seed
npm run dev # note: not docker:dev. Running node locally.
# NOTE following URL is http (not https) and has port 4000, since not behind nginx proxy
# VERIFY http://aegis-local.fit.nasa.gov:4000, report slowness compared to "preview"
```

## Mikro ORM notes

- [Mikro ORM docs](https://mikro-orm.io/docs/defining-entities/)
- [Mikro ORM types](https://mikro-orm.io/docs/types/)
- [Mikro ORM decorators](https://mikro-orm.io/docs/decorators/)
- [Mikro ORM migrations](https://mikro-orm.io/docs/migrations/)
- [Mikro ORM CLI](https://mikro-orm.io/docs/cli/)
- [Mikro ORM CLI commands](https://mikro-orm.io/docs/cli/#commands)

### Helpful Mikro ORM commands

```bash
# Generate a migration
npx mikro-orm migration:create <migration-name>

# Run migrations
npm run migration:up

# Rollback migrations
npm run migration:down

# Seed the database
npm run seed

# Fresh start (drop database, run migrations, seed)
npx mikro-orm migration:fresh --seed
```