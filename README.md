# Artemis EVA GIS (AEGIS)

AEGIS is building the EVA composition and execution tool that seamlessly integrates map data into the EVA product development process to plan, train, fly, explore lunar surface EVA

Wiki: https://wiki.jsc.nasa.gov/fod/index.php/Artemis_EVA_GIS

- Production: https://aegis.fit.nasa.gov/
- Integration: https://aegis-int.fit.nasa.gov/
- Development: Any EMSS dev server (see below)

EMSS dev servers all have element names, and are:

- https://carbon-emss-dev.fit.nasa.gov
- https://gold-emss-dev.fit.nasa.gov
- https://iron-emss-dev.fit.nasa.gov
- https://neon-emss-dev.fit.nasa.gov
- https://oxygen-emss-dev.fit.nasa.gov

## First-Time Setup

We need to setup the local environment before spinning up the app.

### Step 1: Setting up the Local Environment

1. Clone this repo to your machine
2. Create a folder for static assets. This is the location where the hundreds of thousands of GIS map assets will be stored.
   - Make an empty folder called `aegis_static` that is next to the folder the AEGIS project was cloned to.
     - For example, if you cloned the AEGIS repo to `C:\aegis`, make an empty folder at `C:\aegis_static`
3. From within this repo, install JavaScript dependencies: `npm i`
4. Get the secret values from another AEGIS developer and paste them into a new file called `env.secret.ts`
5. Create a `./.env` file by running `npm run make-dotenv` in the terminal.
6. Run `./scripts/make-dev-ssl-cert.sh` in a terminal to setup a self-signed certificate.
7. **Workstation Admin privileges required:** Add `127.0.0.1 aegis-local.fit.nasa.gov` to your "hosts" file.
   1. Windows: Open the start menu, type "notepad", right-click on "Notepad" and select "open as administrator". In Notepad go to `C:\Windows\System32\drivers\etc`, show all files, and open the `hosts` file.
   2. Mac: Edit `/etc/hosts`
   3. Content to add at the bottom of the file (add CODA/Maestro/Labs while you're at it):
      ```
      127.0.0.1 aegis-local.fit.nasa.gov
      127.0.0.1 coda-local.fit.nasa.gov
      127.0.0.1 maestro-local.fit.nasa.gov
      127.0.0.1 talkybot-local.fit.nasa.gov
      127.0.0.1 emss-labs-local.fit.nasa.gov
      ```
8. Import a Prod Database Dump
   1. Download a DB dump sql file from the `z:db-export:prod` job in one of the AEGIS pipelines
      1. Visit https://eegitlab.fit.nasa.gov/emss/aegis/-/pipelines
      2. Under the Actions column, download a job artifact for `z:db-export:prod`
      3. The artifact file may be zipped. If so, unzip it. You should end up with a plain text SQL file
      4. Rename the plain text SQL file to `aegis.sql`
   2. If a `.local/db-init` folder does not exist in this repo, create it
   3. Copy/move `aegis.sql` to `.local/db-init/aegis.sql`
   4. If a `.local/database` directory already exists in this repo, delete it
9. Perform steps for either **Step 2: Option 1: Development with service containers** or **Step 2: Option 2: Development with No docker** or **Step 2: Option 3: Preview a Fully Dockerized Application** below.

### Step 2, Option 1: Development with service containers (PREFERRED)

This is for doing local development with the database and Gdal containers running.

1. Run Docker only starting the service containers (gdal and database): `npm run docker:services`
2. Run `npm run dev` to start the API and frontend.
3. Open [http://localhost:4000](http://localhost:4000) with your browser (note lack of https).
4. Continue to **Step 3: Setting up GIS products for local development**

### Step 2, Option 2: Development with No Docker

This is for doing local development when you don't have Docker installed on your laptop yet. Note that `gdal` functions won't work in this mode but those functions are used in limited portions of AEGIS so development is still possible in this mode.

1. Download PostgreSQL Binaries from the official url https://www.enterprisedb.com/download-postgresql-binaries
2. Choose the latest binaries from installer version for Win x86-64 for Windows Operating System. Current latest version available is 17.4. This will be a higher version than the docker container AEGIS uses, but this shouldn't matter.
3. Extract the zip to a location like `C:\Users\{username}\apps\`
4. Add the directory `C:\Users\{username}\apps\pgsql\bin` to the User Environment Variables for `{username}`. Ensure that you do not add it to the System Variables. After adding the pgsql bin directory's path to User Environment variables, click OK.
5. Tests
   1. Test the server installation by opening a new terminal window and typeing `postgres -V`. If postgres is working it will return the version number
   2. Test the client version with `psql -V`
6. Use `gitbash` to run the scripts in `/scripts/non-docker` to start/stop the database
   - To start `scripts/non-docker/start-aegis-db.sh`
     - On first start it will import the sql dump you placed in `db-init` above
   - To stop `scripts/non-docker/stop-aegis-db.sh`
   - **NOTE:** you should use a different `gitbash` session than the one you use to run npm since ctrl-c will quit postgres as well as node if both are run in the same `gitbash` session.\
7. Run `npm run dev` to bring up local env using the newly running DB.
8. Continue to **Step 3: Setting up GIS products for local development**

### Step 2, Option 3: Preview a Fully Dockerized Application

This is for previewing AEGIS in a full docker setup as it would be configured on the pipeline

1. Run Docker for production preview. This will start the service containers plus additional containers: `npm run docker:preview`
2. Open [https://aegis-local.fit.nasa.gov](https://aegis-local.fit.nasa.gov) with your browser.
3. Due to an HSTS policy, the browser will display a security issue and will not let the page load. In chrome, type "thisisunsafe" on the page like a cheat code.

To stop, run `sh appcompose preview down`.

### Step 3: Setting up GIS products for local development

Setup local environment using the instructions above before performing the following.

#### Option 1: Download assets using the AEGIS admin interface

- The `https://aegis-local.fit.nasa.gov/admin` interface allows AEGIS admins to download asset zips from the AEGIS Box source folder to the AEGIS GIS products location.
- Use the interface itself to download assets as needed to match the missions in the system (from the prod dump of `aegis.sql`)
- Example for Apollo 14 mission:
  1.  Head to `Missions`.
  2.  Under `Apollo 14` select `Edit Layers`.
  3.  Under the **Manage files in the /Layers folder for this mission** section, there is a **Download from Box** section.
  4.  Click through to `AEGIS Zips > z_Archived_and_Inactive_Missions > Apollo 14 > Data` (NOTE: the exact path may have changed! If so, ask around.)
  5.  Click the download button next to `NAC_DTM_APOLLO14.zip`
      - Note: you won't see a download start in your browser. The downloads will show under `Directory Listing` and will be visible in the `../aegis_static` folder created during the initial setup
  6.  Go back to `AEGIS Zips > z_Archived_and_Inactive_Missions > Apollo 14 > Layers`
  7.  Download all layers. Again, they will be automatically unpacked to the correct locations within `../aegis_static`

#### Option 2: Manual install assets for Apollo 14 mission

1. Download the [Apollo 14 zips](https://nasa-ext.app.box.com/s/kpisqjexem99biar7h21xt773apcvcm2/folder/198248141077) and extract the contents anywhere on your computer.
2. Open [https://aegis-local.fit.nasa.gov/admin](https://aegis-local.fit.nasa.gov/admin) or [http://aegis-local.fit.nasa.gov:4000/admin](http://aegis-local.fit.nasa.gov:4000/admin) depending on whether you started the full docker-compose or just the database.
3. Under `Missions` select `Add/Edit Missions`.
4. Under the Mission select `Edit Layers`
5. Under `Manage files in the /Layers folder for this mission` section, select browse and navigate to the `Apollo_14/Layers` folder you extracted in step 1.
6. For each zip file in `Apollo_14/Layers` submit and upload them.
7. Under the Mission select `Edit Mission`
8. Under `Manage files in the /Data folder for this mission` section, select browse and navigate to the `Apollo_14/Data` folder you extracted in step 1.
9. Select `NAC_DTM_APOLLO14.zip` and submit and upload it for elevation data.
10. Add `{"dem":"Data/NAC_DTM_APOLLO14.TIF","resolution":10}` to `Measure` object in `mission config.s`

## Helpful App Management Procedures

**Run Tests**

You've made code changes and you want to make sure the application still acts as expected. Make sure you add / update tests to reflect the new behavior(s) that you've coded.

```sh
npm run test:all
```

**Apply migrations**

You've made changes to the database schema or automerge schema and now you want to apply them.

```sh
npm run migration:up
npm run schema:create
npm run automerge:migration:build
npm run automerge:migration
```

**Create or reset to a fresh database (with prod data)**

Refreshing your local database to match prod is a three step process:

1. Stop the aegis database container
2. Perform **Step 1.8** from above
3. Restart the aegis database container
4. If there are any db changes to apply on your current branch, run `npm run migration:up`

The command line procedure would look as follows:

```sh
# stop the aegis database container
sh appcompose services down

# perform step 1.8 in its entirety

# bring the database container back up
npm run docker:services

# run local migrations if necessary
npm run migration:up
```

**Create a blank database (no data)**

This is a completely empty database. Schemas have been applied, but don't expect anything other than a default user to exist.

You are unlikely to want a completely blank database for day-to-day development. However, it could be useful for situations where major changes to the database / database schema are being made and you want as clean of an environment as possible to test.

1. Stop the database container
2. Delete `.local/database` and `.local/db-init`
3. Restart the database container
4. Run migrations with `npm run migration:fresh`

The command line procedure would look as follows:

```sh
sh appcompose services down
rm -rf .local/database
rm -rf .local/db-init
npm run docker:services
npm run migration:fresh
```

## Helpful Docker CLI Commands

```bash
# List all containers.
docker container list

# Viewing container logs in follow mode
docker logs <container name> -f

# Restart individual services
docker restart <container name>
```

## Load Testing

The pipeline is setup to allow you to run a load test on the various EMSS dev servers, and the `int` servers. Speaking generally, the load test will start up a bunch of worker threads that will connect to the dev environment only via web-sockets. Each worker will maintain a state of the redux store and appropriately dispatch changes as they are received via sockets. At the end of the test, all of the workers will report back with a hash of the final redux store state for comparison with all other clients. If any client missed messages, was corrupted, or has a mis-matched store for any reason, the job will fail.

Self signed certs are allowed in order to run the load test in the local environment. This is configured using the environment variable `NODE_TLS_REJECT_UNAUTHORIZED` in the load test, and also in the socket configuration via the `rejectUnauthorized` property. This should never be allowed on production.

### To start a load test in the pipeline:

1.  Deploy the application to the dev environment
2.  Run the `setup-load-test` job
3.  Start the `run-load-test` job. The load test will run for about 3-ish minutes. Once the test is going, navigate to the dev environment in your browser and start performing actions that cause socket emits. Note that you should see the AEGIS visitor count increase as load test workers connect.
4.  Once the duration has timed out, return back to the job in the pipeline to view the pass/fail results.

### To start a load test locally:

1. Build and run the full docker setup via `npm run docker:preview:rebuild` and `npm run docker:preview`
2. Add the `loadtest` username and password (from your `.env` file) manually to the DB through the AEGIS user interface.
3. Make sure you have an updated local build of the load test by running `npm run test:loadtest:build`
4. Start the load test in the terminal `npm run test:loadtest https://aegis-local.fit.nasa.gov`
5. The load test will run for about 3-ish minutes. Once the test is going, navigate to `https://aegis-local.fit.nasa.gov` in your browser and start performing actions that cause socket emits. Note that you should see the AEGIS visitor count increase as load test workers connect.
6. Once the duration has timed out, review the results in the terminal
