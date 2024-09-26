import { DotenvConfig } from "@emss/make-dotenv/src/types";
import packageJSON from "./package.json";

export const environments = ["local", "fit"] as const;

export const config: DotenvConfig<typeof environments> = {
  /**
   * Directories on the host
   */
  // Location holding files uploaded by users (e.g. images and static dir)
  DOCKER_HOST_SSL_CERTS_DIR: {
    local: { type: "make-directory-if-missing", value: "./.local/certs" },
    default: "/etc/pki/tls/certs",
  },
  DOCKER_HOST_SSL_PRIVATE_DIR: {
    local: { type: "make-directory-if-missing", value: "./.local/private" },
    default: "/etc/pki/tls/private",
  },
  DOCKER_HOST_DATA_DIR: {
    local: "./.local/database",
    default: "/d1/aegis/postgres",
  },
  // Directory in which 'init' directory will be created.
  DOCKER_HOST_INIT_DIR: {
    local: "./.local/db-init",
    default: "/d1/aegis/db-init",
  },
  STATIC_DIR: {
    local: "../aegis_static",
    default: "/d1/aegis/static",
  },

  /**
   * Database
   */
  // DB_HOST is "localhost" when doing native/local Node development. When running
  // node in docker in docker:preview, this will be overridden in the
  // docker-compose-preview.yml to be "database"
  DB_NAME: { default: "aegis" },
  DB_HOST: { local: "localhost", default: "database" },
  GDAL_HOST: { local: "localhost", default: "gdal" },
  GDAL_PORT: { local: "4200", default: "80" },

  /**
   * Container image info
   */
  BASE_IMAGE_NAME: {
    local: "emss-labs-local",
    default: process.env.CI_REGISTRY_IMAGE || "missing-env-var-BASE_IMAGE_NAME",
  },
  IMAGE_VERSION: { default: process.env.IMAGE_VERSION || "dev" },
  DOCKER_IMAGE_NGINX: {
    local: "NOT_USED_LOCALLY",
    default: `eegitlabregistry.fit.nasa.gov/emss/aegis/nginx:${process.env.IMAGE_VERSION}`,
  },
  DOCKER_IMAGE_APIV1: {
    local: "NOT_USED_LOCALLY",
    default: `eegitlabregistry.fit.nasa.gov/emss/aegis/apiv1:${process.env.IMAGE_VERSION}`,
  },
  DOCKER_IMAGE_GDAL: {
    local: "NOT_USED_LOCALLY",
    default: `eegitlabregistry.fit.nasa.gov/emss/aegis/gdal:${process.env.IMAGE_VERSION}`,
  },

  /**
   * Box information
   * These is the Box API folder for the aegis.
   */
  BOX_INITIAL_FOLDER_ID: { default: "198245097840" },

  /**
   * !!!! SENSITIVE DATA !!!!
   *
   * The following env vars are sensitive! Do not send them to anyone who doesn't need them
   * If sending them to someone who does need them, send via encrypted email.
   *
   * If you need values, request from CODA developers or copy from GitLab CI/CD variables. These values
   * will be stored in .env.secret so make-dotenv.sh can reuse them.
   */
  DB_PASS: {
    default: {
      type: "required-from-secret",
    },
  },
  ADMIN_RECOVERY_KEY: {
    default: {
      type: "required-from-secret",
    },
  },
  SESSION_PASSWORD: {
    default: {
      type: "required-from-secret",
    },
  },
  BOX_CLIENT_ID: {
    default: {
      type: "required-from-secret",
    },
  },
  BOX_CLIENT_SECRET: {
    default: {
      type: "required-from-secret",
    },
  },
  BOX_ENTERPRISE_ID: {
    default: {
      type: "required-from-secret",
    },
  },
  BOX_USER_ID: {
    default: {
      type: "required-from-secret",
    },
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
   * Versioning
   */
  APP_VERSION: {
    default: packageJSON.version,
  },
  GIT_COMMIT: {
    default: process.env.CI_COMMIT_SHA || "DEV",
  },
};
