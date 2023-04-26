#
# IMAGE: base
#
# Must have base image, which is supplied by docker-compose, defined in .env, and
# set appropriately for the environment via scripts/make-dotenv.sh
ARG GDAL_BASE_IMAGE=python:3.9.16-slim-buster

FROM $GDAL_BASE_IMAGE as base

# Install the setup and dependencies for GDAL with Python bindings and Flask. The order matters.
RUN apt-get -o APT::Retries=3 -y update && \
      apt-get install -y gdal-bin libgdal-dev python3-pip python3-gdal && \
      pip3 install Flask Flask-Shell2HTTP Flask-Executor waitress && \
      export CPLUS_INCLUDE_PATH=/usr/include/gdal && \
      export C_INCLUDE_PATH=/usr/include/gdal && \
      pip3 install setuptools==57.5.0 numpy && \
      pip3 install GDAL==$(gdal-config --version) --global-option=build_ext --global-option="-I/usr/include/gdal" && \
      mkdir /app

WORKDIR /app
COPY server/python ./
CMD ["python", "flask/httplistener.py"]
