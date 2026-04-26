type MikroORM = import("@mikro-orm/postgresql").MikroORM;
type Server<ClientToServerEvents, ServerToClientEvents, DefaultEventsMap, SocketData> =
  import("socket.io").Server<
    ClientToServerEvents,
    ServerToClientEvents,
    DefaultEventsMap,
    SocketData
  >;

type Repo = import("@automerge/automerge-repo").Repo;
type DefaultEventsMap = import("socket.io").DefaultEventsMap;
type GlobalValues = {
  orm: MikroORM;
  socketio: Server<ClientToServerEvents, ServerToClientEvents, DefaultEventsMap, {}>;
  serverSocketStatus: ServerSocketStatus;
  socketInterval: NodeJS.Timeout;
  appVersion: AppVersion;
  deployInfo: DeployInfo;
  isEmssApiEnabled: boolean;
  automergeRepo: Repo;
};

interface DeployInfo {
  app: string;
  gitCommit: string;
  branch: string;
  deployedBy: string;
  deployedAt: string;
  mrIid: string;
  pipelineUrl: string;
}

// these are defined in esbuild.mjs and vite.config.mts
declare const __APP_VERSION__: string;
declare const __GIT_COMMIT__: string;
declare const __DEPLOY_APP__: string;
declare const __DEPLOY_BRANCH__: string;
declare const __DEPLOY_USER__: string;
declare const __DEPLOY_TIMESTAMP__: string;
declare const __DEPLOY_MRS__: string;
declare const __DEPLOY_PIPELINE_URL__: string;
