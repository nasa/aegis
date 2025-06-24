import express, { Request, Response } from "express";
import { Query } from "express-serve-static-core";

import { hasEMSSPerms } from "utils/permissions";

import { getEM } from "utils/mikro";
import { Eva_db, Rex_db } from "server/database/models/_allModels";

const router = express.Router();

const parseQuery = (query: Query) => {
  const { evaRefUuid } = query;
  const queryObj = {
    evaRefUuid: evaRefUuid ? (evaRefUuid as string) : undefined,
  };
  return queryObj;
};

// Get eva refs
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const queryObj = parseQuery(req.query);
  const emssToken = req.headers["emss-token"] as string;

  // Check if user has EMSS permissions
  const editPermission = hasEMSSPerms({ user: req.session.user, emssToken });

  if (!editPermission) {
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  if (!queryObj.evaRefUuid) {
    res.status(500).json({ status: "error", message: "No EVA Ref given" });
    return;
  }

  try {
    const em = getEM();

    const refEvaSubQuery = em
      .createQueryBuilder(Eva_db)
      .select("uuid")
      .where({ refUuid: queryObj.evaRefUuid });

    const rexEvasQuery = em
      .createQueryBuilder(Rex_db)
      .select(["uuid", "name", "createdAt", "updatedAt", "isRunning"])
      .where({ evaUuid: { $in: refEvaSubQuery.getKnexQuery() } });

    const dbRexes = await rexEvasQuery.execute();

    const refRexes = dbRexes.map((rex) => ({
      uuid: rex.uuid,
      name: rex.name,
      createdAt: rex.createdAt.toISOString(),
      updatedAt: rex.updatedAt.toISOString(),
      isRunning: rex.isRunning,
    }));

    res.status(200).json({
      status: "success",
      message: `Rexes retrieved`,
      data: refRexes,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ status: "error", message: `Error getting rexes ${e}` });
  }
});

export default router;
