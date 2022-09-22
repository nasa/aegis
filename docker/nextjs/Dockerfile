#
# IMAGE: base
#
FROM node:18-alpine as base
RUN mkdir /app
WORKDIR /app
COPY package*.json ./
COPY docker/nextjs/docker-entrypoint.sh /
RUN dos2unix /docker-entrypoint.sh && \
  chmod +x /docker-entrypoint.sh
ENTRYPOINT [ "/docker-entrypoint.sh" ]

#
# IMAGE: prod
#
FROM base as prod

# Prod build doesn't run `npm i` at container start. Dev does. See docker-entrypoint.sh
ENV RUN_NPM_INSTALL_ON_START=no

# Ultimately should set `ENV NODE_ENV=production` prior to running install, so npm
# doesn't install devDependencies. Also consider --no-optional. However, since the
# `npm run build` step requires devDependencies to be able to do the build, we'll
# need a multi-stage build or explicitly remove the devDependencies after build.
RUN npm install

# Copy the rest of the app code over to the image, but only in prod. In dev, the app code will be
# mounted as a volume from the host.
COPY . /app

# WARNING: All NEXT_PUBLIC_* environment variables need to be present at build time, because they
# are actually inserted into the client-side code. We can simply copy .env.example here, because
# the only NEXT_PUBLIC_* variables aren't sensitive and won't change between environments. If these
# variables did need to change between environments, we'd either have to (a) COPY in the desired
# .env at image build time or (b) would need to make a runtime method for retrieving such config.
# Maestro does (b).
COPY .env.example .env

RUN npm run build \
  && rm -f ./.env

# runs on port 4000
CMD ["/bin/sh", "-c", "npm run migrate:up; npm run start"]

#
# IMAGE: dev
#
FROM base as dev

# Prod build doesn't run `npm i` at container start. Dev does. See docker-entrypoint.sh
ENV RUN_NPM_INSTALL_ON_START=yes

ENV NODE_ENV=development
RUN npm install

# runs on port 4000
# CMD "/bin/sh -c 'npm i; npm run migrate:up; npm run dev;'"
CMD ["npm", "run", "dev"]
