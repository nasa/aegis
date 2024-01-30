#
# IMAGE: base
#
# Get the base image, which is supplied by the pipeline. If the *_BASE_IMAGE value is not defined
#   (which is true when building locally) then use the value to the right of the = operator
#
# A version of the gdal image has been uploaded to public docker.com so devs don't have to auth
# with eegitlab to pull the image on local builds
ARG GDAL_BASE_IMAGE=jackievu/aegis:gdal

FROM $GDAL_BASE_IMAGE as base

WORKDIR /app
COPY src/server/python ./
CMD ["python", "elevationService.py"]
