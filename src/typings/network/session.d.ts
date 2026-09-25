import type {} from "express";

// CurrentUser itself lives in the global permissions typings so server-only modules that are not
// express-aware can reference it without importing.
declare module "express-serve-static-core" {
  interface Request {
    currentUser?: CurrentUser;
  }
}
