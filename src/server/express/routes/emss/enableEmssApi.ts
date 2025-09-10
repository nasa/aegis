import express, { Request, Response } from "express";
import { globalValues } from "server/express/global";
const router = express.Router();

// only super admin can get and set this value
router.get("/", async (req: Request, res: Response): Promise<void> => {
  if (!req.session?.appUser?.isSuperAdmin) {
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  try {
    const isEmssApiEnabled = globalValues.isEmssApiEnabled;
    res.status(200).json({
      status: "success",
      message: `isEmssApiEnabled retrieved`,
      data: isEmssApiEnabled,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ status: "error", message: `Error getting endpoint ${e}` });
  }
});

router.post("/", async (req: Request, res: Response): Promise<void> => {
  if (!req.session?.appUser?.isSuperAdmin) {
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  try {
    const { enable } = req.body;
    if (typeof enable !== "boolean") {
      res.status(400).json({ status: "failure", message: "enable must be a boolean" });
      return;
    }
    globalValues.isEmssApiEnabled = enable;
    res.status(200).json({
      status: "success",
      message: `isEmssApiEnabled set to ${enable}`,
      data: globalValues.isEmssApiEnabled,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ status: "error", message: `Error setting endpoint ${e}` });
  }
});

export default router;
