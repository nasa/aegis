import type { Request, Response } from "express";

import bcrypt from "bcryptjs";
import express from "express";

import { App_User_db } from "server/database/models/_allModels";
import { globalValues } from "../global";

import { upsertAppUsers } from "./appUsers";
import { ConsoleLogger as serverLogger } from "utils/logging/serverLogger";
import { asError } from "@emss/utils";

const router = express.Router();

// Login
router.post("/login", async (req: Request, res: Response): Promise<void> => {
  const { username, password }: { username: string; password: string } = req.body;
  try {
    const loginResult = await apiLogin(username, password);
    if (loginResult.status === "success") {
      req.session.appUser = loginResult.data;
    } else {
      req.session = null;
    }
    res.status(200).json(loginResult);
  } catch (error) {
    serverLogger.apiRoute({
      logLevel: "error",
      httpMethod: "POST",
      responseStatus: 500,
      routeName: "auth/login",
      appUsername: username,
      message: "Unexpected error :" + error,
      error: asError(error),
    });
    res.status(500).json({ status: "error", message: "Unexpected error :" + error });
  }
});

// Logout
router.get("/logout", async (req: Request, res: Response): Promise<void> => {
  try {
    req.session = null;
    res.status(200).json({ status: "success", message: "Logged out", data: true });
  } catch (error) {
    serverLogger.apiRoute({
      logLevel: "error",
      httpMethod: "GET",
      responseStatus: 500,
      routeName: "auth/logout",
      appUsername: req.session?.appUser?.username,
      message: `Unexpected error: ${error}`,
      error: asError(error),
    });
    res.status(500).json({ status: "error", message: `Unexpected error: ${error}`, data: false });
  }
});

// isLoggedIn
router.get("/isLoggedIn", async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.session.appUser) {
      res.status(200).json({
        status: "success",
        message: "Login checked",
        data: req.session.appUser,
      });
    } else {
      res.status(200).json({ status: "failure", message: "Not Logged in", data: { user: null } });
    }
  } catch (e) {
    serverLogger.apiRoute({
      logLevel: "error",
      httpMethod: "GET",
      responseStatus: 500,
      routeName: "auth/isLoggedIn",
      appUsername: req.session?.appUser?.username,
      message: `Unexpected error: ${e}`,
      error: asError(e),
    });
    res.status(500).json({ status: "error", message: `Unexpected error: ${e}` });
  }
});

// Admin Recovery
router.get("/adminRecovery", async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.method == "GET") {
      const recoveryKey = req.query.recoveryKey as string;
      const response = await recoverWithRecoveryKey(recoveryKey);

      if (response) {
        res.status(200).json({ status: "success", message: "Admin user updated" });
      } else {
        res.status(500).json({ status: "error", message: "Recovery Key does not match" });
      }
    } else {
      throw new Error("Method not allowed");
    }
  } catch (e) {
    serverLogger.apiRoute({
      logLevel: "error",
      httpMethod: "GET",
      responseStatus: 500,
      routeName: "auth/adminRecovery",
      appUsername: req.session?.appUser?.username,
      message: `Unexpected error: ${e}`,
      error: asError(e),
    });
    res.status(500).json({ status: "error", message: `Unexpected error: ${e}` });
  }
});

export default router;

async function apiLogin(username: string, password: string): Promise<WrappedResponse<AppUser>> {
  const em = globalValues.orm.em;
  const user = await em.findOne(App_User_db, { username });
  if (!user) {
    return { status: "failure", message: "No such user." };
  } else {
    const passwordGood = await bcrypt.compare(password, user.password);
    if (passwordGood) {
      return {
        status: "success",
        message: "login successful",
        data: {
          id: user.id,
          username: user.username,
          permissionList: user.permissionList,
          isAdmin: user.isAdmin,
          isSuperAdmin: user.isSuperAdmin,
        },
      };
    } else {
      return { status: "failure", message: "Incorrect password." };
    }
  }
}

async function recoverWithRecoveryKey(recoveryKey: string): Promise<boolean> {
  const em = globalValues.orm.em;

  if (recoveryKey === process.env.ADMIN_RECOVERY_KEY) {
    const adminUserDB = await em.findOne(App_User_db, { isSuperAdmin: true });
    const adminUser: AppUser = {
      ...adminUserDB,
      password: "admin",
      createdAt:
        adminUserDB.createdAt instanceof Date && String(adminUserDB.createdAt) !== "Invalid Date"
          ? String(new Date("1969-07-20"))
          : String(new Date(adminUserDB.createdAt)),
      updatedAt: String(new Date()),
    };
    //Add default values back into admin user
    await upsertAppUsers([adminUser]);
    return true;
  }
  return false;
}
