import type { NextApiHandler, NextApiRequest, NextApiResponse } from "next";
import { withIronSessionApiRoute } from "iron-session/next";
import { ironOptions } from "server/session/config";
import Mikro from "utils/mikro";
import { Preset } from "../../../server/database/models/preset.model";

export const handlePresetJson: NextApiHandler = async (
  req: NextApiRequest,
  res: NextApiResponse<WrappedResponse<Preset>>
): Promise<unknown> => {
  console.log("add preset");
  const body = req.body;
  const name = body.name;

  if (req.method !== "POST") {
    res
      .status(405)
      .send({ data: undefined, status: "error", message: "Only POST requests allowed" });
    return;
  }

  if (!name) {
    console.log("no preset name");
    return;
  }

  try {
    await Mikro.getORM();
    const model = await Mikro.getEM();
    const preset = model.create(Preset, {
      layer: body.uuid ? body.uuid : null,
      config: {
        name: "test",
        sublayer: 1,
        id: 1,
        blend: "normal",
        opacity: 1,
        contrast: 1,
        brightness: 1,
      },
    });
    await model.persist(preset);
    await model.flush();
    await Mikro.closeORM();
  } catch (err) {
    console.log(err);
  }
  return res.status(200).json({ data: undefined, message: "", status: undefined });
};

export default withIronSessionApiRoute(Mikro.withORM(handlePresetJson), ironOptions);
