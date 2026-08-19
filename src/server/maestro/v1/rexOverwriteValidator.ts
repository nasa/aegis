import { rexOverwriteSchemaValidator } from "utils/validateSchemaServer";
import { validators } from "components/interface/form/formValidators";
import { validate as isUuid } from "uuid";

/**
 * This file is Deprecated and should be removed when ./rexOverwrite.ts is removed
 */

// returns null if valid, or string message if invalid
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const validatePercentComplete = (activityEntry: any): string | null => {
  if (
    "maestroPercentCompleteEv1" in activityEntry && //  checks if property exists in the object
    activityEntry.maestroPercentCompleteEv1 !== undefined &&
    activityEntry.maestroPercentCompleteEv1 !== null
  ) {
    // if a percent complete is a valid number between 0 and 100
    if (
      activityEntry.maestroPercentCompleteEv1 < 0 ||
      activityEntry.maestroPercentCompleteEv1 > 100
    ) {
      return "Entry must have a valid maestroPercentCompleteEv1 property between 0 and 100.";
    }
  }
  if (
    "maestroPercentCompleteEv2" in activityEntry && //  checks if property exists in the object
    activityEntry.maestroPercentCompleteEv2 !== undefined &&
    activityEntry.maestroPercentCompleteEv2 !== null
  ) {
    // if a percent complete is a valid number between 0 and 100
    if (
      activityEntry.maestroPercentCompleteEv2 < 0 ||
      activityEntry.maestroPercentCompleteEv2 > 100
    ) {
      return "Entry must have a valid maestroPercentCompleteEv2 property between 0 and 100.";
    }
  }
  return null; // everything is valid
};

// returns null if valid, or an object with status and message if invalid
export const validateRexOverwrite = (rexOverwrite: RexOverwrite): string | null => {
  // first validate the schema. All properties required
  const valid = rexOverwriteSchemaValidator(rexOverwrite);
  if (!valid) {
    return JSON.stringify(rexOverwriteSchemaValidator.errors);
  }

  // check rex uuid is a valid format
  if (!isUuid(rexOverwrite.uuid)) {
    return "rexUuid must be a valid UUID.";
  }

  // validate petRunning
  if (rexOverwrite.petRunning && !rexOverwrite.isRunning) {
    return "Rex must be running (isRunning=true) in order to set petRunning=true.";
  }

  // validate petValueAtStartStop
  const isValidHHMMSS =
    typeof validators.mustBeHHMMSS(rexOverwrite.petValueAtStartStop) === "undefined";
  if (!isValidHHMMSS) {
    return "PetValueAtStartStop must be HHMMSS format.";
  }
  if (rexOverwrite.petRunning && !rexOverwrite.petValueAtStartStop) {
    return "petValueAtStartStop is required when petRunning is true.";
  }

  // validate petStartStopTimestamp
  const isValidTimestamp =
    typeof validators.mustBeISOString(rexOverwrite.petStartStopTimestamp) === "undefined";
  if (!isValidTimestamp) {
    return "petStartStopTimestamp must be an ISO String format.";
  }

  // validate maestroEventURL
  if (rexOverwrite.maestroEventUrl) {
    try {
      const parsedUrl = new URL(rexOverwrite.maestroEventUrl);
      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:")
        throw new Error("Invalid protocol. Must be http or https");
    } catch (e) {
      return "MaestroEventURL be a valid URL " + e;
    }
  }

  // validate maestro activity properties
  if (rexOverwrite.maestroActivityPropertiesByRefUuid) {
    for (const refUuid in rexOverwrite.maestroActivityPropertiesByRefUuid) {
      if (!isUuid(refUuid) && refUuid !== "ingress" && refUuid !== "egress") {
        return `Invalid refUuid format in maestroActivityPropertiesByRefUuid: ${refUuid}. Must be a valid UUID.`;
      }
      const activityProperty = rexOverwrite.maestroActivityPropertiesByRefUuid[refUuid];
      if (activityProperty.color) {
        // validate color is a hex color
        const hexColorRegex = /^#([A-Fa-f0-9]{3}|[A-Fa-f0-9]{4}|[A-Fa-f0-9]{6})$/;
        const isValidColor = hexColorRegex.test(activityProperty.color);
        if (!isValidColor) {
          return `Invalid color format in maestroActivityPropertiesByRefUuid for refUuid ${refUuid}. Must be a hex color.`;
        }
      }
      // validate number
      if (activityProperty.number && activityProperty.number.length > 3) {
        return `Invalid number property in maestroActivityPropertiesByRefUuid for refUuid ${refUuid}. Must be less than 4 characters.`;
      }
    }
  }

  // validate all the entry properties
  for (const stationRefUuid in rexOverwrite.stationEntriesByRefUuid) {
    if (!isUuid(stationRefUuid)) {
      return `Invalid stationRefUuid format in stationEntriesByRefUuid: ${stationRefUuid}. Must be a valid UUID.`;
    }
    const validatePercentMsg = validatePercentComplete(
      rexOverwrite.stationEntriesByRefUuid[stationRefUuid]
    );
    if (validatePercentMsg) return validatePercentMsg;
  }
  for (const traverseRefUuid in rexOverwrite.traverseEntriesByRefUuid) {
    if (!isUuid(traverseRefUuid)) {
      return `Invalid traverseRefUuid format in traverseEntriesByRefUuid: ${traverseRefUuid}. Must be a valid UUID.`;
    }
    const validatePercentMsg = validatePercentComplete(
      rexOverwrite.traverseEntriesByRefUuid[traverseRefUuid]
    );
    if (validatePercentMsg) return validatePercentMsg;
  }
  for (const actionRefUuid in rexOverwrite.actionEntriesByRefUuid) {
    if (!isUuid(actionRefUuid)) {
      return `Invalid actionRefUuid format in actionEntriesByRefUuid: ${actionRefUuid}. Must be a valid UUID.`;
    }
    const actionEntry = rexOverwrite.actionEntriesByRefUuid[actionRefUuid];
    if ("mass" in actionEntry) {
      return "Action entry mass property should not be provided.";
    }
    if (actionEntry.containerId) {
      if (actionEntry.containerId.toString().length > 20) {
        return "Action entry containerId must be less than 20 characters.";
      }
    }
    if (actionEntry.secondaryContainerId) {
      if (actionEntry.secondaryContainerId.toString().length > 20) {
        return "Action entry secondaryContainerId must be less than 20 characters.";
      }
    }
    if (actionEntry.markerId) {
      if (actionEntry.markerId.toString().length > 20) {
        return "Action entry markerId must be less than 20 characters.";
      }
    }
  }
  // TODO(MR3): `xgressEntries` was removed from RexOverwrite when egress/ingress
  // became real stations, so there is nothing left to validate here. Restore a
  // check once the v1 xgress contract is settled with the Maestro team.

  return null; // everything is valid
};
