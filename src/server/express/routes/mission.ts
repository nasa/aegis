import type { Request, Response } from "express";

import express from "express";

import path from "node:path";
import fs from "fs";
import { SCHEMA_DIR } from "utils/validateSchemaServer";
import { serverLogger } from "utils/logging/serverLogger";

const router = express.Router();

router.get("/schema", async (req: Request, res: Response): Promise<void> => {
  try {
    const schemaFile = fs.readFileSync(path.join(SCHEMA_DIR, "mission.json"), "utf8");
    const schema = JSON.parse(schemaFile);
    res.status(200).json({
      status: "success",
      message: "mission schema retrieved",
      data: schema,
    });
  } catch (e) {
    serverLogger.error(
      { logId: "mission", logValue: "Error retrieving schema" },
      e instanceof Error ? e : new Error(String(e))
    );
    res.status(500).json({
      status: "error",
      message: `Error retrieving schema: ${e}`,
      data: null,
    });
  }
});

export default router;
