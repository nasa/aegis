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

## Getting Started

### All install methods

For all install methods, do the following:

1. Create a folder for static assets. This is the location where the hundreds of thousands of GIS map assets will be stored.
   - Make an empty folder called `aegis_static` that is next to the folder the AEGIS project was cloned to.
     - For example, if your AEGIS repo is at `C:\aegis`, make an empty folder at `C:\aegis_static`
2. Install JavaScript dependencies: `npm i`
3. Get the secret values from another AEGIS developer and paste them into a new file called `env.secret.ts`
4. Create a `./.env` file by running `npm run make-dotenv` in the terminal.
5. Run `./scripts/make-dev-ssl-cert.sh` in a terminal to setup a self-signed certificate.
6. **Workstation Admin privileges required:** Add `127.0.0.1 aegis-local.fit.nasa.gov` to your "hosts" file.
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
7. Perform steps for either "Development with service containers" or "Development with No docker" or "Preview: Fully docker-compose" below.

### Development with service containers (preferred)

This is for doing local development with the Database and Gdal containers running

Perform "All install methods" instructions above before performing the following.

1. Run Docker only starting the service containers (gdal and database): `npm run docker:services`
2. Import a dump of the database from one of the environments using the instructions outlined in "Import a database dump from one of the AEGIS environments" below.
3. Run `npm run dev` to start the frontend.
4. Open [http://localhost:4000](http://localhost:4000) with your browser (note lack of https).

### Development with No Docker

This is for doing local development when you don't have Docker installed on your laptop yet. Note that `gdal` functions won't work in this mode but those functions are used in limited portions of AEGIS so development is still possible in this mode.

Perform "All install methods" (except step 6 because you don't have Workstation Admin) instructions above before performing the following.

1. Download PostgreSQL Binaries from the official url https://www.enterprisedb.com/download-postgresql-binaries
2. Choose the latest binaries from installer version for Win x86-64 for Windows Operating System. Current latest version available is 17.4. This will be a higher version than the docker container AEGIS uses, but this shouldn't matter.
3. Extract the zip to a location like `C:\Users\{username}\apps\`
4. Add the directory `C:\Users\{username}\apps\pgsql\bin` to the User Environment Variables for `{username}`. Ensure that you do not add it to the System Variables. After adding the pgsql bin directory's path to User Environment variables, click OK.
5. Tests
   1. Test the server installation by opening a new terminal window and typeing `postgres -V`. If postgres is working it will return the version number
   2. Test the client version with `psql -V`
6. Get a DB dump sql file from the `z:db-export:prod` job in one of the AEGIS pipelines: https://eegitlab.fit.nasa.gov/emss/aegis/-/pipelines, name it `aegis.sql` and place it in `/.local/db-init` in the cloned AEGIS repo folder
7. Use `gitbash` to run the scripts in `/scripts/non-docker` to start/stop the database
   - To start `scripts/non-docker/start-aegis-db.sh`
     - On first start it will import the sql dump you placed in `db-init` above
   - To stop `scripts/non-docker/stop-aegis-db.sh`
   - **NOTE:** you should use a different `gitbash` session than the one you use to run npm since ctrl-c will quit postgres as well as node if both are run in the same `gitbash` session.\
8. Run `npm run dev` to bring up local env using the newly running DB.

### Preview: Fully docker-compose

This is for previewing AEGIS in a full docker setup as it would be configured on the pipeline

Perform "All install methods" instructions above before performing the following.

1. Run Docker for production preview. This will start the service containers plus additional containers: `npm run docker:preview`
2. Import a dump of the database from one of the environments using the instructions outlined in "Import a database dump from one of the AEGIS environments" below.
3. Open [https://aegis-local.fit.nasa.gov](https://aegis-local.fit.nasa.gov) with your browser.
4. Due to an HSTS policy, the browser will display a security issue and will not let the page load. In chrome, type "thisisunsafe" on the page like a cheat code.

To stop, run `docker compose down`.

## Setting up GIS products for local development

Setup local environment using the instructions above before performing the following.

### Option 1: Download assets using the AEGIS admin interface

- The `https://aegis-local.fit.nasa.gov/admin` interface allows AEGIS admins to download asset zips from the AEGIS Box source folder to the AEGIS GIS products location.
- Use the interface itself to download assets as needed to match the missions in the system (from the prod dump of `aegis.sql`)
- Example for Apollo 14 mission:
  1.  Head to `Missions`.
  2.  Under `Apollo 14` select `Edit Layers`.
  3.  Under `Manage files in the /Layers folder for this mission` section, there is a `Download from Box` section.
  4.  Select `Apollo_14` > `Layers` and download the required files.
  5.  The downloads will show under `Directory Listing` and will be visible in the `aegis_static` folder created during the initial setup.

### Option 2: Manual install assets for Apollo 14 mission

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

## Nuking the local database

To delete all the database data, delete the `./.local/database` directory. This directory saves database state on the host, meaning that executing just `docker-compose down` will not remove the data.

## Importing a DB dump from an AEGIS environment

1. Stop the aegis database container
2. Delete your `./.local/database` directory
3. Retrieve a dump from CI/CD by executing one of the export jobs (such as `z:db-export:prod`). The job will generate an artifact called `aegis.sql`. Download this sql dump.
4. Drop the .sql file into the `.local/db-init/` folder.
5. Start the aegis database container.
6. If there are any db changes to apply on your current branch, run `npm run migrate:up`

## Helpful Docker Commands

```bash
# List all containers
docker container list

# Viewing container logs in follow mode
docker logs <container name> -f

# Restart individual services
docker restart <container name>
```
