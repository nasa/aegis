import type {} from "express";

import type session from "express-session";

// add the appUser to the regular session that gets passed around on requests
interface AEGISSession extends session.Session {
  appUser?: AppUser;
}

declare module "express" {
  interface Request {
    session: AEGISSession;
  }
}
