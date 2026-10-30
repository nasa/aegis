import { v4 as uuidv4 } from "uuid";

import { getAccurateNow } from "utils/formatting";

/**
 * Generate a blank, unplaced asset
 * @param partialAsset any fields that are to be overridden from default
 * @returns the generated asset
 */
export const generateBlankAsset = (partialAsset?: Partial<Asset>): Asset => {
  const now = getAccurateNow().getTime();
  const defaultNewAsset: Asset = {
    uuid: uuidv4(),
    name: "",
    icon: null,
    color: null,
    visible: true,
    location: null,
    elevation: null,
    uncertaintyMeters: 0,
    notes: null,
    placement: null,
    createdAt: now,
    updatedAt: now,
  };
  return { ...defaultNewAsset, ...partialAsset };
};
