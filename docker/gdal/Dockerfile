#
# IMAGE: base
#
# Get the base image, which is supplied by the pipeline. If the *_BASE_IMAGE value is not defined
#   (which is true when building locally) then use the value to the right of the = operator

FROM eegitlabregistry.fit.nasa.gov/emss/docker-images/deploy:gdal AS base

WORKDIR /app
COPY src/server/python ./
CMD ["python", "elevationService.py"]
