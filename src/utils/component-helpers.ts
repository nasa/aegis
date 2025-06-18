import sortBy from "lodash/sortBy";

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

export const displayFormattedTotalTimeObj = (totalTimeObj: TotalTimeObj): string => {
  if (!totalTimeObj || !totalTimeObj.durationLower || !totalTimeObj.durationUpper) return null;
  if (totalTimeObj.durationLower === totalTimeObj.durationUpper) {
    return `${Math.round(totalTimeObj.durationLower)}`;
  } else {
    return `${Math.round(totalTimeObj.durationLower)} - ${Math.round(totalTimeObj.durationUpper)}`;
  }
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
