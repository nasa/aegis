#
# IMAGE: base
#
# Must have base image, which is supplied by docker-compose, defined in .env, and
# set appropriately for the environment via scripts/make-dotenv.sh
# A version of the gdal image has been uploaded to public docker.com so devs don't have to auth
# with eegitlab to pull the image on local builds
ARG GDAL_BASE_IMAGE=jackievu/aegis:gdal

FROM $GDAL_BASE_IMAGE as base

WORKDIR /app
COPY server/python ./
CMD ["python", "elevationService.py"]
