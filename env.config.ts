import { DotenvConfig } from "@emss/make-dotenv/src/types";
import packageJSON from "./package.json";

export const environments = ["local", "fit"] as const;

export const config: DotenvConfig<typeof environments> = {
  /**
   * Directories on the host
   */
  // Location holding files uploaded by users (e.g. images)
  DOCKER_HOST_SSL_CERTS_DIR: {
    local: { type: "make-directory-if-missing", value: "./.local/certs" },
    default: "/etc/pki/tls/certs",
  },
  DOCKER_HOST_SSL_PRIVATE_DIR: {
    local: { type: "make-directory-if-missing", value: "./.local/private" },
    default: "/etc/pki/tls/private",
  },
  DOCKER_HOST_DATA_DIR: {
    local: { type: "make-directory-if-missing", value: "./.local/database" },
    default: "/d1/aegis/postgres",
  },
  // Directory in which 'init' directory will be created.
  DOCKER_HOST_INIT_DIR: {
    local: { type: "make-directory-if-missing", value: "./.local/db-init" },
    default: "/d1/aegis/db-init",
  },

  /**
   * Naive API server env vars
   *
   * Values for the following variables are used in Node.JS-native processes only, when running
   * `npm run api:dev` and similar commands. They are not used in Docker-Compose, since the values
   * are set directly in docker-compose.yml.
   */
  // Location of the `events` directory. If unset then `./.api-server` relative to Maestro install
  // directory will be used. This creates an `events` directory inside the specified
  // `SERVER_ENV_EVENTS_PATH`, which is probably suboptimal.
  SERVER_ENV_EVENTS_PATH: { default: "./.local" },
  // Location of the imageStore. If unset then `./.api-server/images` relative to Maestro install
  // directory will be used.
  SERVER_ENV_IMAGE_STORE_PATH: { default: "./.local/uploads" },
  // Location to upload files (images) temporarily before moving them into Image Store. If unset
  // then `./.api-server/imagetmp` will be used. Should not be web-accessible.
  SERVER_ENV_UPLOAD_TMP_PATH: { default: "./.local/imagetmp" },

  /**
   * Docker compose ports and paths
   */
  // See docs for SERVER_ENV_EVENTS_PATH below. This sets SERVER_ENV_EVENTS_PATH in docker-compose.
  DOCKER_API_V1_PATH: { default: "/api/v1" },
  // See docs for SERVER_ENV_API_V1_PORT below. This sets SERVER_ENV_API_V1_PORT in docker-compose.
  DOCKER_API_V1_PORT: { default: 8000 },
  // The port maestro is served on within the host machine when using Docker Compose
  DOCKER_HOST_PORT: { default: 443 },
  // Port the Node.JS API service runs on. Must be greater than 1024.
  SERVER_ENV_API_V1_PORT: { default: 8001 },

  /**
   * Native frontend env vars
   *
   * Values for the following variables are used in Node.JS-native processes only, when running
   * `npm run web:dev` and similar commands. They are not used in Docker-Compose, since the values
   * are set directly in docker-compose.yml.
   */
  // Port to be appended to CLIENT_ENV_API_V1_SERVER
  // @example 9000 --> https://example.com:9000/path/to/api
  // @example false --> https://example.com/path/to/api
  CLIENT_ENV_API_V1_PORT: { default: 8001 },
  // Path to be appended to CLIENT_ENV_API_V1_SERVER. If not false, should HAVE leading slash and
  // should NOT HAVE trailing slash.
  // @example /api/v1 --> https://example.com:9000/api/v1
  // @example false --> https://example.com:9000
  CLIENT_ENV_API_V1_PATH: { default: false },
  // protocol + hostname of the API server, e.g. https://example.com (no trailing slash). If false,
  // use the client's window.location.protocol and .hostname
  CLIENT_ENV_API_V1_SERVER: { default: false },

  /**
   * Container image info
   */
  BASE_IMAGE_NAME: {
    local: "emss-labs-local",
    default: process.env.CI_REGISTRY_IMAGE || "missing-env-var-BASE_IMAGE_NAME",
  },
  IMAGE_VERSION: { default: process.env.IMAGE_VERSION || "dev" },
  REGISTRY_IMAGE: {
    default: "eegitlabregistry.fit.nasa.gov/emss/maestro",
  },

  /**
   * Dev-only
   */
  // Used by native and docker-compose DEV servers. Cannot conflict with docker ports. For native this
  // is the port you reach the app on. For Docker, the nginx container proxies traffic to the frontend
  // Vite dev server on this port.
  VITE_SERVER_PORT: { default: 9000 },
  // In dev, allow additional hosts to hit the Maestro API that normally wouldn't be allowed via CORS
  DEV_ALLOWED_HOSTS: { default: "" },
  // How many Playwright test works to use (how many tests to run in parallel)
  TEST_WORKERS: { default: 0 },
  // How many times to retrie Playwright tests after they fail
  TEST_RETRY: { default: 0 },

  /**
   * Logging
   */
  ENABLE_LOGGING: { local: "false", default: "true" },
  LOGSTASH_URL: {
    default: "https://maestro-alpha.fit.nasa.gov/logstash/",
  },

  /**
   * Versioning
   */
  APP_VERSION: {
    default: packageJSON.version,
  },
  GIT_COMMIT: {
    default: process.env.CI_COMMIT_SHA || "DEV",
  },
};
