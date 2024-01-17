#
# IMAGE: base
#
# Must have base image, which is supplied by docker-compose, defined in .env, and
# set appropriately for the environment via scripts/make-dotenv.sh
# The following ARG syntax will use the image defined in NEXTJS_BASE_IMAGE first, and
# if it's not defined, defult to the assignment to the right of the = from docker hub
ARG NEXTJS_BASE_IMAGE=node:20.9.0-alpine

FROM $NEXTJS_BASE_IMAGE as base

RUN mkdir /app
WORKDIR /app
COPY package*.json ./

#
# IMAGE: prod
#
FROM base as prod

# Ultimately should set `ENV NODE_ENV=production` prior to running install, so npm
# doesn't install devDependencies. Also consider --no-optional. However, since the
# `npm run build` step requires devDependencies to be able to do the build, we'll
# need a multi-stage build or explicitly remove the devDependencies after build.
RUN npm install

# Copy the rest of the app code over to the image, but only in prod. In dev, the app code will be
# mounted as a volume from the host.
COPY . /app

# WARNING: All NEXT_PUBLIC_* environment variables need to be present at build time, because they
# are actually inserted into the client-side code. If these variables change between environments,
# we'd either have to (a) COPY in the desired .env at image build time or (b) would need to make a 
# runtime method for retrieving such config.
ARG NEXT_PUBLIC_IN_CI_ENVIRONMENT

RUN npm run build 

# runs on port 4000
CMD ["/bin/sh", "-c", "npm run migrate:up; npm run start"]

#
# IMAGE: dev
#
FROM base as dev

ENV NODE_ENV=development
RUN npm install

# runs on port 4000
# In dev we wan to run `npm i` again when the container starts. This is because the dependencies could
# change from the time the docker image was built to the time the image was used to create the
# container. In prod the dependencies are locked, so we don't need to re-run. 
CMD ["/bin/sh", "-c", "npm i; npm run migrate:up; npm run dev"]
