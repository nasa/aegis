import sortBy from "lodash/sortBy";
import type { IconDefinition } from "@fortawesome/free-regular-svg-icons";
import { faSquare, faSquareCheck } from "@fortawesome/free-regular-svg-icons";
import rexStyles from "components/panes/rex/rex.module.css";
import evaStyles from "components/panes/eva/eva.module.css";
import { buildActionDefinitionName } from "store/storeUtils/mission";

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

/**
 * Compute the CSS class names for an EVA sequence item row (station, traverse,
 * or egress/ingress). The parent `evaItem` div owns the background color
 * (selected / hover / rex-state), and the inner `evaItemName` div only carries
 * text-color / font-weight overrides that need to sit on top of that background.
 *
 * Priority for the row background:
 *   selected > rex state > hover > none
 *
 * Egress/ingress rows have no "selected" state — pass `isSelected: false`.
 */
export const getSequenceItemRowStyles = ({
  rexStatus,
  isSelected,
  isHovered,
  isRexEva,
}: {
  rexStatus: RexStatus | null;
  isSelected: boolean;
  isHovered: boolean;
  isRexEva: boolean;
}): { rowClassName: string; nameClassName: string } => {
  let rowClassName = "";
  let nameClassName = "";

  if (isSelected) {
    rowClassName = evaStyles.evaItemSelected;
    nameClassName = evaStyles.evaItemNameSelected;
    if (isRexEva) {
      if (rexStatus === "in-progress") {
        rowClassName = evaStyles.evaItemRexInProgressSelected;
        nameClassName = evaStyles.evaItemNameRexInProgressSelected;
      } else if (rexStatus === "skipped") {
        rowClassName = evaStyles.evaItemRexSkippedSelected;
        nameClassName = evaStyles.evaItemNameRexSkippedSelected;
      }
      // "complete" + selected falls through to the normal selected styling
    }
  } else if (isRexEva && rexStatus === "in-progress") {
    rowClassName = evaStyles.evaItemRexInProgress;
    nameClassName = evaStyles.evaItemNameRexInProgress;
  } else if (isRexEva && rexStatus === "complete") {
    rowClassName = evaStyles.evaItemRexComplete;
    // text color provided by customTextClassName (headingCompleted)
  } else if (isRexEva && rexStatus === "skipped") {
    rowClassName = evaStyles.evaItemRexSkipped;
    // text color provided by customTextClassName (headingSkipped)
  } else if (isHovered) {
    rowClassName = evaStyles.evaItemHover;
  }

  return { rowClassName, nameClassName };
};

const getStmActionName = ({
  actionDefinition,
  missionActionDefinitions,
  actionDefinitionConjunctions,
}: {
  actionDefinition: ActionDefinition;
  missionActionDefinitions: ActionDefinitions;
  actionDefinitionConjunctions: Mission["actionDefinitionConjunctions"];
}): string => {
  const verbDef = missionActionDefinitions.verbs[actionDefinition?.verbUuid];
  const nounDef = missionActionDefinitions.nouns[actionDefinition?.nounUuid];
  const adjectiveDef = missionActionDefinitions.adjectives[actionDefinition?.adjectiveUuid];
  return buildActionDefinitionName({
    verbName: verbDef?.name,
    nounName: nounDef?.name,
    adjectiveName: adjectiveDef?.name,
    conjunctions: actionDefinitionConjunctions,
  });
};

/**
 * Resolve the name to display for an action. STM (v2) actions have no free-text
 * name — their name is built from the verb/noun/adjective definition joined by the
 * mission's custom conjunctions. Everything else uses the stored `action.name`.
 */
export const getActionDisplayName = ({
  action,
  mission,
}: {
  action: Pick<Action, "name" | "stmAction" | "actionDefinition">;
  mission: Pick<
    Mission,
    "actionSystemVersion" | "actionDefinitions" | "actionDefinitionConjunctions"
  >;
}): string => {
  if (
    mission.actionSystemVersion === 2 &&
    action.stmAction &&
    action.actionDefinition &&
    mission.actionDefinitions
  ) {
    return getStmActionName({
      actionDefinition: action.actionDefinition,
      missionActionDefinitions: mission.actionDefinitions,
      actionDefinitionConjunctions: mission.actionDefinitionConjunctions,
    });
  }
  return action.name;
};
