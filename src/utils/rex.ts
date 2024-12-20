import {
  IconDefinition,
  faCircle,
  faCircleCheck,
  faCirclePlay,
  faCircleXmark,
} from "@fortawesome/free-regular-svg-icons";
import actionStyles from "components/panes/actions-action.module.css";
import rexStyles from "components/panes/rex/rex.module.css";

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
      icon: faCirclePlay,
      iconStyle: rexStyles.rexStatusIconPending,
      tooltip: "Action pending",
      headerBackgroundColor: "var(--grey2)",
      bodyBackgroundColor: "var(--grey2)",
      customTextClassName: null,
    };
  switch (rexStatus) {
    case "pending":
      return {
        icon: faCirclePlay,
        iconStyle: rexStyles.rexStatusIconPending,
        tooltip: "Action pending",
        headerBackgroundColor: "var(--grey2)",
        bodyBackgroundColor: "var(--grey2)",
        customTextClassName: null,
      };
    case "in-progress":
      return {
        icon: faCircle,
        iconStyle: rexStyles.rexStatusIconInProgress,
        tooltip: "Action in progress",
        headerBackgroundColor: "var(--rexDim)",
        bodyBackgroundColor: "var(--grey2)",
        customTextClassName: null,
      };
    case "complete":
      return {
        icon: faCircleCheck,
        iconStyle: rexStyles.rexStatusIconComplete,
        tooltip: "Action complete",
        headerBackgroundColor: "var(--grey1)",
        bodyBackgroundColor: "var(--grey1)",
        customTextClassName: null,
      };
    case "skipped":
      return {
        icon: faCircleXmark,
        iconStyle: rexStyles.rexStatusIconSkipped,
        tooltip: "Action skipped",
        headerBackgroundColor: "var(--grey1)",
        bodyBackgroundColor: "var(--grey1)",
        customTextClassName: actionStyles.actionHeadingSkipped,
      };
  }
};
