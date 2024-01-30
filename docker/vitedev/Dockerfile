# Base image optionally from arg
# ref: https://eegitlab.fit.nasa.gov/emss/docs/-/blob/main/docker.md#base-images-as-arg
ARG APIV1_BASE_IMAGE=node:20.11.0-alpine

# # # # # # # #
# BASE image  #
# # # # # # # #
FROM $APIV1_BASE_IMAGE as base

WORKDIR /app

# CMD ["npm", "run", "vite:dev"]

# use this command to turn on polling for file changes
# CMD ["/bin/sh", "-c", "cd /app; npm i; npm run vite:dev -- --config vite.config-dockerdev.mts"]
CMD ["/bin/sh", "-c", "cd /app; npm i; npm run vite:dev"]
