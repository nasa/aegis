# AEGIS Zero

## Getting Started

1. Download a baseline SQL file from https://emss-labs.fit.nasa.gov/public/mmgis.sql, and put it in the `.docker` folder in this repo.
2. Do a Find and Replace All of mmgis to postgres in the SQL file.
3. Create `.env` by copying `.env.example` and making the DB password be: `postagresgetthemess`.
4. Run Docker Compose: `docker-compose up -d`
5. Run `npm run dev` to start the server.
6. [If doesn't open automatically] Open [http://localhost:4000](http://localhost:4000) with your browser. In dev, username and password are both `admin`.
7. Edit your etc/hosts file to point to the IP address of the container: `sudo nano /etc/hosts` and add the following line: `localhost:4000 aegis-local.fit.nasa.gov:4000`

## Helpful docker commands
```
docker logs aegis_node -f
docker restart aegis_node
```

## Production Notes
```
docker compose --env-file .env.production -f docker-production.yml up -d 
```
Current port is 3000 instead of 4000.



## Barebones app instructions for during dev

- Login with admin/admin
- Select a Mission (such as Apollo 14)
- Choose map imagery from left gutter
- Expand the Map Imagery Detailed Settings and turn on a layer (such as a Basemap)
- The hamburger menu will take you back to the login screen
  