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
    alertIconColor = "var(--error)";
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
