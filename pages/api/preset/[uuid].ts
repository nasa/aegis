import type { NextApiHandler, NextApiRequest, NextApiResponse } from "next";
import { withIronSessionApiRoute } from "iron-session/next";
import { ironOptions } from "server/session/config";
import Mikro from "utils/mikro";

export const handlePresetJson: NextApiHandler = async (
  req: NextApiRequest,
  res: NextApiResponse<WrappedResponse<Mission>>
): Promise<unknown> => {
  const {
    query: { uuid: presetUuid },
  } = req;
  if (res.status(200)) {
    // do nothing
  }
  return Array.isArray(presetUuid) ? presetUuid[0] : presetUuid;
};

export default withIronSessionApiRoute(Mikro.withORM(handlePresetJson), ironOptions);

export async function getAllPresetsForMission(): Promise<Mission | false> {
  await Mikro.getORM();
  // const model = await Mikro.getEM();
  // const presets = await model.find(Preset, { layer: missionId });
  return;
}
