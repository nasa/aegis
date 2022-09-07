# AEGIS Zero

## Getting Started

1. Download a baseline SQL file from https://emss-labs.fit.nasa.gov/public/mmgis.sql, and put it in the `.docker` folder in this repo.
2. Create a `.env` file by copying `.env.example` and making the DB password be: `postagresgetthemess`.
3. Run Docker Compose: `docker-compose up -d` this will start the database and nginx.
4. Run `npm run dev` to start the dev code with hot reloading.
5. [If doesn't open automatically] Open [http://localhost:4000](http://localhost:4000) with your browser. In dev, username and password are both `admin`.

## Helpful docker commands
```
docker logs aegis_postgis -f
docker restart aegis_postgis
```

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