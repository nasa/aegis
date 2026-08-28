import type { DotenvConfig } from "@emss/make-dotenv/src/types";

export const environments = ["local", "fit", "test", "prod"] as const;

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

  /**
   * Container image info
   */
  // Image version is used to make each image name unique to each commit's pipeline
  IMAGE_VERSION: { default: process.env.IMAGE_VERSION || "dev" },
  REGISTRY_IMAGE: {
    default: "eegitlabregistry.fit.nasa.gov/emss/aegis",
  },
  DOCKER_IMAGE_DATABASE: { default: "postgres:17.10-alpine" },

  /**
   * Box information
   * These is the Box API folder for the aegis.
   */
  BOX_INITIAL_FOLDER_ID: { default: "198245097840" },

  /**
   * Launchpad
   * Only our prod URLs are added to launchpad prod. All environments (dev/int/prod) are added to launchpad sandbox.
   * Ultimately we want to use sandbox launchpad for everything except prod (including local dev)
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
    prod: "https://authfs.launchpad.nasa.gov/adfs",
    default: "https://authfs.launchpad-sbx.nasa.gov/adfs",
  },
  OAUTH2_PROXY_LOGIN_URL: {
    prod: "https://authfs.launchpad.nasa.gov/adfs/oauth2/authorize/",
    default: "https://authfs.launchpad-sbx.nasa.gov/adfs/oauth2/authorize/",
  },
  OAUTH2_PROXY_REDEEM_URL: {
    prod: "https://authfs.launchpad.nasa.gov/adfs/oauth2/token/",
    default: "https://authfs.launchpad-sbx.nasa.gov/adfs/oauth2/token/",
  },
  OAUTH2_PROXY_OIDC_JWKS_URL: {
    prod: "https://authfs.launchpad.nasa.gov/adfs/discovery/keys",
    default: "https://authfs.launchpad-sbx.nasa.gov/adfs/discovery/keys",
  },
  OAUTH2_PROXY_WHITELIST_DOMAIN: {
    prod: "authfs.launchpad.nasa.gov",
    default: "authfs.launchpad-sbx.nasa.gov",
  },
  OAUTH2_PROXY_CLIENT_ID: {
    prod: { type: "alternate-varname-from-secret-file", value: "LAUNCHPAD_PRODUCTION_CLIENT_ID" },
    default: { type: "alternate-varname-from-secret-file", value: "LAUNCHPAD_SANDBOX_CLIENT_ID" },
  },
  OAUTH2_PROXY_CLIENT_SECRET: {
    prod: {
      type: "alternate-varname-from-secret-file",
      value: "LAUNCHPAD_PRODUCTION_CLIENT_SECRET",
    },
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
  // happens in the pipeline deploy script. `INSERT_SUBDOMAIN` that gets replaced
  // with the appropriate subdomain during deploy.
  OAUTH2_PROXY_REDIRECT_URL: {
    local: "https://aegis-local.fit.nasa.gov/api/v1/auth/nasalp/adfs/oidc/login",
    default: "https://INSERT_SUBDOMAIN.fit.nasa.gov/api/v1/auth/nasalp/adfs/oidc/login",
  },
  REDIS_CACHE_DIR: { local: "./.local/redis", default: "/d1/aegis/redis" },
  // Mock up the user when running in non-docker local dev or else JWT errors will occur
  MOCK_USER: {
    local: "true",
    test: "true",
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
   * Maestro
   * The URL of the Maestro server this AEGIS instance should pair with.
   * Can be overridden per-deployment via the admin Maestro Env Pairing page.
   */
  MAESTRO_PAIR_ENV_URL: {
    prod: "maestro.fit.nasa.gov",
    default: "maestro-beta.fit.nasa.gov",
  },

  /**
   * Logging
   */
  // Used by @emss/logger package to determine if server or client (client logs are
  // routed through the server) logs should be sent to the logging server.
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
    local: "https://emss-logging.fit.nasa.gov/applog",

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
  /**
   * Console Logger
   * Controls the local console log level for the ConsoleLogger utility.
   * Levels (most severe first):
   *    "off" | "emergency" | "alert" | "critical" | "error" | "warning" | "notice" | "info" | "debug"
   * Example: if level is "warning", only warning and more severe levels are handled
   *
   * The VITE_PUBLIC_REMOTE_LOG_LEVEL is a gate in front of the emss/logger remote logger. The remote logger
   * controls it's own "should log" with LOG_ENABLE_APP_LOGGING. If/when the logger package updates to use
   * levels instead of a boolean, this env var can go away.
   */
  VITE_PUBLIC_CONSOLE_LOG_LEVEL: {
    local: "debug",
    default: "debug",
  },
  VITE_PUBLIC_REMOTE_LOG_LEVEL: {
    local: "off",
    default: "debug",
  },
};
