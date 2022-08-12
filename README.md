# AEGIS Zero

## Getting Started

1. We're not using docker-compose yet, but will be, so get Docker Desktop. These instructions will manually setup a PostgreSQL database in a container for now.
2. Run a PostGIS image. We don't actually need PostGIS (just regular Postgres) but MMGIS does and using this minimizes error messages. Make the password anything you like, but make sure it matches what you put in `.env` later:
   `docker run -p 127.0.0.1:5432:5432/tcp --name aegis-postgres -e POSTGRES_PASSWORD=mysecretpassword -d postgis/postgis:14-3.2-alpine`
3. Download a baseline SQL file from https://emss-labs.fit.nasa.gov/public/mmgis.sql, and put it in the `.docker` folder in this repo.
4. Copy SQL file to container: `docker cp ./.docker/mmgis.sql aegis-postgres:/mmgis.sql`
5. Create MMGIS database and populate it with dump: `docker exec -ti aegis-postgres sh -c "psql -U postgres -c 'create database mmgis;' && psql -U postgres mmgis < /mmgis.sql"`
6. Create `.env` by copying `.env.example` and making the DB password be whatever you used in step 2.
7. Start dev server: `npm run dev`
8. Open [http://localhost:4000](http://localhost:4000) with your browser. In dev, username and password are both `admin`.

## Barebones app instructions for during dev

- Login with admin/admin
- Select a Mission (such as Apollo 14)
- Choose map imagery from left gutter
- Expand the Map Imagery Detailed Settings and turn on a layer (such as a Basemap)
- The hamburger menu will take you back to the login screen
  