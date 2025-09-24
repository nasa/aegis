import { DotenvConfig } from "@emss/make-dotenv/src/types";

export const environments = ["local", "fit", "test"] as const;

export const config: DotenvConfig<typeof environments> = {
  /**
   * Directories on the host
   * Location holding files uploaded by users (e.g. images and static dir) and the
   * Locations of SSL cert/key. For local dev, run `bash scripts/make-dev-ssl-cert.sh` to create a self-
   * signed cert.
   */
  DOCKER_SSL_CERTS_DIR: {
    local: "./.local/certs",
    default: "/etc/pki/tls/certs",
  },
  DOCKER_SSL_PRIVATE_DIR: {
    local: "./.local/private",
    default: "/etc/pki/tls/private",
  },
  DOCKER_DB_DATA_DIR: {
    local: "./.local/database",
    default: "/d1/aegis/postgres",
  },
  DOCKER_DB_INIT_DIR: {
    local: "./.local/db-init",
    default: "/d1/aegis/db-init",
  },
  STATIC_DIR: {
    local: "../aegis_static",
    default: "/d1/aegis/static",
  },

  /**
   * Database
   * DB_HOST is "localhost" when doing native/local Node development. When running
   * node in docker in docker:preview, this will be overridden in the
   * docker-compose-preview.yml to be "database"
   * Do not need to specify a db port. AEGIS is special and gets to always use the default port
   * The docker images to be used in docker compose when running in the pipeline. These
   * values are not used locally.
   */
  DB_NAME: { default: "aegis" },
  DB_HOST: { local: "localhost", default: "database" },
  DB_PORT: { local: "5432", default: "5432" },
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
   * Launchpad
   * Only our prod URLs are added to launchpad prod. All environments (dev/int/prod) are added to launchpad sandbox.
   * Ultimately we want to use sandbox launchpad for everything except prod (including local dev)
   * Currently we don't have a solution to make a prod version of a .env so right now use sandbox for everything
   */
  OAUTH2_PROXY_COOKIE_SECRET: {
    local: {
      type: "generate-to-secret-if-missing",
      length: 32,
      characters: "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-=",
    },
    default: { type: "required-from-secret" },
  },
  OAUTH2_PROXY_OIDC_ISSUER_URL: {
    // prod: "https://authfs.launchpad.nasa.gov/adfs", confirm correct
    default: "https://authfs.launchpad-sbx.nasa.gov/adfs",
  },
  OAUTH2_PROXY_LOGIN_URL: {
    // prod: "https://authfs.launchpad.nasa.gov/adfs/oauth2/authorize/", confirm correct
    default: "https://authfs.launchpad-sbx.nasa.gov/adfs/oauth2/authorize/",
  },
  OAUTH2_PROXY_REDEEM_URL: {
    // prod: "https://authfs.launchpad.nasa.gov/adfs/oauth2/token/", confirm correct
    default: "https://authfs.launchpad-sbx.nasa.gov/adfs/oauth2/token/",
  },
  OAUTH2_PROXY_OIDC_JWKS_URL: {
    // prod: "https://authfs.launchpad.nasa.gov/adfs/discovery/keys", confirm correct
    default: "https://authfs.launchpad-sbx.nasa.gov/adfs/discovery/keys",
  },
  OAUTH2_PROXY_WHITELIST_DOMAIN: {
    // prod: "authfs.launchpad.nasa.gov", confirm correct
    default: "authfs.launchpad-sbx.nasa.gov",
  },
  OAUTH2_PROXY_CLIENT_ID: {
    // prod: { type: "alternate-varname-from-secret-file", value: "LAUNCHPAD_PRODUCTION_CLIENT_ID" },
    default: { type: "alternate-varname-from-secret-file", value: "LAUNCHPAD_SANDBOX_CLIENT_ID" },
  },
  OAUTH2_PROXY_CLIENT_SECRET: {
    // prod: {
    //   type: "alternate-varname-from-secret-file",
    //   value: "LAUNCHPAD_PRODUCTION_CLIENT_SECRET",
    // },
    default: {
      type: "alternate-varname-from-secret-file",
      value: "LAUNCHPAD_SANDBOX_CLIENT_SECRET",
    },
  },

  /**
   * EMSS Token
   * This is the token used to authenticate with the AEGIS API from EMSS app to app
   */
  EMSS_TOKEN: {
    default: {
      type: "required-from-secret",
    },
  },

  // Ultimately need to alter this based on what server we're on (prod/int/dev). Currently this override
  // happens in the pipeline depoy script. `INSERT_SUBDOMAIN` that gets replaced
  // with the appropriate subdomain during deploy.
  OAUTH2_PROXY_REDIRECT_URL: {
    // prod: "https://aegis.fit.nasa.gov/api/v1/auth/nasalp/adfs/oidc/login",
    // int: "https://aegis-int.fit.nasa.gov/api/v1/auth/nasalp/adfs/oidc/login",
    local: "https://aegis-local.fit.nasa.gov/api/v1/auth/nasalp/adfs/oidc/login",
    default: "https://INSERT_SUBDOMAIN.fit.nasa.gov/api/v1/auth/nasalp/adfs/oidc/login",
  },
  REDIS_CACHE_DIR: { local: "./.local/redis", default: "/d1/aegis/redis" },
  // Mock up the user when running in non-docker local dev or else JWT errors will occur
  MOCK_USER: {
    local: "true",
    default: "false",
  },

  /**
   * !!!! SENSITIVE DATA !!!!
   *
   * The following env vars are sensitive! Do not send them to anyone who doesn't need them
   * If sending them to someone who does need them, send via encrypted email.
   *
   * If you need values, request from AEGIS developers or copy from GitLab CI/CD variables. These values
   * will be stored in env.secret.ts so make-dotenv can reuse them.
   *
   * The ADMIN_RECOVERY_KEY is the key passed in as a URL param to an API endpoint to hard reset the super
   * admin user password to the default
   *
   * The SESSION_PASSWORD is used to encrypt the session cookie
   *
   * The BOX-prefixed values are used for integration with box.com for admin zip downloads. They come from
   * the box.com developer console of any account that has access to the AEGIS Zips folder and can create
   * new apps (currently using bf@benfeist.com's box account).
   *
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
  LOADTEST_PASSWORD: {
    default: {
      type: "required-from-secret",
    },
  },

  /**
   * Logging
   */
  // Used by @emss/logger package to determine if application logs should be
  // send to the logging server.
  LOG_ENABLE_APP_LOGGING: { local: "false", test: "false", default: "true" },

  // Unique ID for each app, for logging server search/filtering. This should
  // be as short as possible. It gets put in the syslog "tag" field alongside
  // other data, and the max length for tags is 32 characters, so keeping this
  // short lowers the risk of exceeding the tags max length.
  //
  // DO NOT include a double dash, e.g. --. This would break the filters in
  // Logstash.
  //
  // Also used by the @emss/logger package
  LOG_DATA_APP_ID: { default: "aegis" },

  // Identifier for the server, e.g. `prod`, `carbon`, `local-dev`, etc.
  // Used by Rsyslog to mark container log messages, as well as by @emss/logger
  LOG_DATA_SERVER_NAME: {
    local: "local-dev",

    // gets altered at deploy-time depending on what server is being deployed
    default: "INSERT_LOG_DATA_SERVER_NAME",
  },

  // Used by @emss/logger package to determine destination for application logs
  // LOG_SERVER_HTTP_ENDPOINT is for _application logs_, e.g. when in the app
  // we do something like `clientLogger.info(...)`. It _IS_ possible to log
  // from local dev to logging servers in FIT, because application logs go
  // through the FIT proxy.
  LOG_SERVER_HTTP_ENDPOINT: {
    // When logging in local dev, you have some options:
    //
    // 1. Log to the prod log server:
    //    local: "https://emss-logging.fit.nasa.gov/applog",
    // 2. Log to a dev server with emss/logs deployed:
    //    local: "https://carbon-emss-dev.fit.nasa.gov/applog"
    // 3. Log to a locally-running log server running on port 9443:
    //    local: "https://localhost:9443/applog"
    //    (this may be problematic if we disallow insecure certs in emss/packages,
    //    "logger" package, as you'll need to setup a trusted cert)
    local: "",

    // Send this app's logs to a location in FIT. Typically this will be to the
    // emss-logging server, but could also be to dev servers running emss/logs
    // app. Examples:
    //
    // - "https://emss-logging.fit.nasa.gov/applog" (typical value, emss-logging server)
    // - "https://carbon-emss-dev.fit.nasa.gov/applog" (logging to carbon-emss-dev if emss/logs is running there)
    default: "https://emss-logging.fit.nasa.gov/applog",
  },

  // This is where each container's logging.options.syslog-address points to.
  // It will pretty much always be a location on the host, which will then
  // forward the logs on to a remote location.
  LOG_INTERNAL_ENDPOINT: {
    // In local dev on Windows, generally we want to keep the same value as FIT
    // because the UDP address won't care if the log messages fail to reach
    // their destination. If, however, we want to test against a logging server
    // running locally, the following can be uncommented, which will send logs
    // from the containers directly to the logstash-tcp-input of the logging
    // server, running on port 9602.
    // local: "tcp://host.docker.internal:9602",

    // For FIT, send to host machine's Rsyslog
    default: "udp://127.0.0.1:514",
  },
};
