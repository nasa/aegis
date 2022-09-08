# AEGIS Zero

## Getting Started

For all install methods, do the following:

1. Download a baseline SQL file from https://emss-labs.fit.nasa.gov/public/mmgis.sql, and put it in the `.docker` folder in this repo.
2. Create a `.env` file by copying `.env.example`
3. Pick a strong password for `AEGIS_DB_PASS`

### Fully docker-compose

1. In `.env`, set `AEGIS_DB_HOST` to `aegis_postgis`
2. Run Docker Compose: `docker-compose up -d` to start all services.
3. [If doesn't open automatically] Open [http://localhost:4000](http://localhost:4000) with your browser. In dev, username and password are both `admin`.

### Just database via docker-compose

1. In `.env`, set `AEGIS_DB_HOST` to `localhost`
2. Run Docker Compose: `docker-compose up -d postgis` to start only the database.
3. Run `npm run dev` to start the frontend.
4. [If doesn't open automatically] Open [http://localhost:4000](http://localhost:4000) with your browser. In dev, username and password are both `admin`.

## Helpful docker commands

The following assumes your `AEGIS_DB_HOST` is set to `aegis_postgis`, which is the default in `.env.example`

```
docker logs aegis_postgis -f
docker restart aegis_postgis
```

Alternatively, if you don't add the `-d` to your `docker-compose` commands it will output logs to your terminal.

## Production Notes

```
docker compose -f docker-compose.yml -f docker-production.yml up -d
```

Current port is 3000 instead of 4000.

## Barebones app instructions for during dev

- Login with admin/admin
- Select a Mission (such as Apollo 14)
- Choose map imagery from left gutter
- Expand the Map Imagery Detailed Settings and turn on a layer (such as a Basemap)
- The hamburger menu will take you back to the login screen
