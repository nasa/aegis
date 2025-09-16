import sortBy from "lodash/sortBy";
import { IconDefinition, faSquare, faSquareCheck } from "@fortawesome/free-regular-svg-icons";
import rexStyles from "components/panes/rex/rex.module.css";

export const getAlertColor = (
  reportItems: ReportItem[],
  evaReportSequenceItems?: EvaReportSequenceItem[]
): string => {
  // establish max alert level
  let maxAlertLevel = "info";
  for (let i = 0; i < reportItems?.length; i++) {
    if (reportItems[i].type === "error") {
      maxAlertLevel = "error";
      break;
    } else if (reportItems[i].type === "warning") {
      maxAlertLevel = "warning";
    }
  }
  if (evaReportSequenceItems) {
    // loop through all sequence items and check for color
    for (let i = 0; i < evaReportSequenceItems.length; i++) {
      for (let j = 0; j < evaReportSequenceItems[i].reportItems.length; j++) {
        if (evaReportSequenceItems[i].reportItems[j].type === "error") {
          maxAlertLevel = "error";
          break;
        } else if (
          evaReportSequenceItems[i].reportItems[j].type === "warning" &&
          maxAlertLevel !== "error"
        ) {
          maxAlertLevel = "warning";
        }
      }
    }
  }

  let alertIconColor = "white";
  if (maxAlertLevel === "error") {
    alertIconColor = "var(--alert)";
  } else if (maxAlertLevel === "warning") {
    alertIconColor = "var(--warning)";
  }
  return alertIconColor;
};

/**
 * Compares two arrays of objects that must contain at least uuid and updated at.
 * Objects in array are sorted by uuid before compared
 * @param obj1
 * @param obj2
 * @returns
 */
export const isModified = (
  obj1: MustContainIsModified[],
  obj2: MustContainIsModified[]
): boolean => {
  let isDiff = false;
  //check length
  if (obj1.length === obj2.length) {
    //sort before comparing indexes
    const sortedObjs1 = sortBy(obj1, ["uuid"]);
    const sortedObjs2 = sortBy(obj2, ["uuid"]);
    for (let i = 0; i < sortedObjs1.length; i++) {
      //check updatedAt strings
      isDiff = sortedObjs1[i]?.updatedAt !== sortedObjs2[i]?.updatedAt;
      if (isDiff) {
        break;
      }
    }
  } else {
    isDiff = true;
  }
  return isDiff;
};

export const makeTraverseRateString = (
  value: number,
  evaDefault?: number,
  missionDefault?: number
): string => {
  if (value) {
    return null;
  } else if (evaDefault) {
    return `Using EVA Rate: ${evaDefault}`;
  } else {
    return `Using Mission Rate: ${missionDefault}`;
  }
};

export const getRexStatusDisplayProperties = (
  rexStatus: RexStatus
): {
  icon: IconDefinition;
  iconStyle: string;
  tooltip: string;
  headerBackgroundColor: string;
  bodyBackgroundColor: string;
  customTextClassName: string;
} => {
  if (!rexStatus)
    return {
      icon: faSquare,
      iconStyle: rexStyles.rexStatusIconPending,
      tooltip: "Pending",
      headerBackgroundColor: "var(--grey2)",
      bodyBackgroundColor: "var(--grey2)",
      customTextClassName: null,
    };
  switch (rexStatus) {
    case "pending":
      return {
        icon: faSquare,
        iconStyle: rexStyles.rexStatusIconPending,
        tooltip: "Pending",
        headerBackgroundColor: "var(--grey2)",
        bodyBackgroundColor: "var(--grey2)",
        customTextClassName: null,
      };
    case "in-progress":
      return {
        icon: faSquare,
        iconStyle: rexStyles.rexStatusIconInProgress,
        tooltip: "In Progress",
        headerBackgroundColor: "var(--rexDim)",
        bodyBackgroundColor: "var(--grey2)",
        customTextClassName: null,
      };
    case "complete":
      return {
        icon: faSquareCheck,
        iconStyle: rexStyles.rexStatusIconComplete,
        tooltip: "Complete",
        headerBackgroundColor: "var(--grey1)",
        bodyBackgroundColor: "var(--grey1)",
        customTextClassName: rexStyles.headingCompleted,
      };
    case "skipped":
      return {
        icon: null,
        iconStyle: rexStyles.rexStatusIconSkipped,
        tooltip: "Skipped",
        headerBackgroundColor: "var(--grey1)",
        bodyBackgroundColor: "var(--grey1)",
        customTextClassName: rexStyles.headingSkipped,
      };
  }
};

export const getActionDefinitionName = ({
  actionDefinitionItems,
  uuid,
}: {
  actionDefinitionItems: ActionDefinitionItem[];
  uuid: string;
}): string | undefined => {
  const actionDef = actionDefinitionItems.find((actionDefItem) => actionDefItem.uuid === uuid);
  return actionDef?.name;
};

export const getStmActionName = ({
  actionDefinition,
  missionActionDefs,
}: {
  actionDefinition: ActionDefinition;
  missionActionDefs: ActionDefinitions;
}): string => {
  const allDefs = [
    ...missionActionDefs.verbs,
    ...missionActionDefs.nouns,
    ...missionActionDefs.adjectives,
  ];
  const verbDef = allDefs.find((def) => def.uuid === actionDefinition?.verbUuid);
  const nounDef = allDefs.find((def) => def.uuid === actionDefinition?.nounUuid);
  const adjectiveDef = allDefs.find((def) => def.uuid === actionDefinition?.adjectiveUuid);
  const verbName = verbDef?.name;
  const nounName = nounDef?.name;
  const adjectiveName = adjectiveDef?.name;
  return `${verbName || "Unknown"} of ${nounName || "Unknown"} in ${adjectiveName || "Unknown"}`;
};
