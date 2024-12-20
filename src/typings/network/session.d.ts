import "express";

import session from "express-session";

interface AEGISSession extends session.Session {
  user?: User;
}

declare module "express" {
  interface Request {
    session: AEGISSession;
  }
}
