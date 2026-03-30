import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import type { IconProp } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { FunctionComponent, ReactNode } from "react";
import styles from "./_global-elements.module.css";
import { longDateFromDateNumeric, longDateFromDateString } from "utils/formatting";
import { isModified } from "utils/component-helpers";
import { faInfoCircle } from "@fortawesome/free-solid-svg-icons";

dayjs.extend(relativeTime);

export const ModifiedIndicator: FunctionComponent<{
  obj1: MustContainIsModified[];
  obj2: MustContainIsModified[];
  svgStyle?: { width: string; height: string; cx: string; cy: string; r: string; fill: string };
}> = ({
  obj1,
  obj2,
  svgStyle = {
    width: "15",
    height: "12",
    cx: "5",
    cy: "9",
    r: "3",
    fill: "#ff0000",
  },
}) => {
  const isDiff = isModified(obj1, obj2);

  if (!isDiff) {
    return <></>;
  } else {
    return (
      <span
        data-tooltip-id="aegis-tooltip"
        data-tooltip-html="Unsaved changes"
        className={styles.modifiedSpan}
        aria-label="Unsaved changes"
      >
        <svg height={svgStyle.height} width={svgStyle.width}>
          <circle cx={svgStyle.cx} cy={svgStyle.cy} r={svgStyle.r} fill={svgStyle.fill} />
        </svg>
      </span>
    );
  }
};

export const LastEditedNumeric: FunctionComponent<{
  updatedAt: number;
  createdAt: number;
  infoString?: string;
}> = ({ updatedAt, createdAt, infoString }) => {
  const returnDivContent = (updatedAt: number) => {
    if (!updatedAt) return <>N/A</>;
    const timeAgo = dayjs(updatedAt).fromNow();
    return <>{timeAgo}</>;
  };

  return (
    <div
      className={styles.updatedAt}
      data-tooltip-id="aegis-tooltip"
      data-tooltip-html={`Updated At: ${longDateFromDateNumeric(updatedAt)} Z
      <br />Created At: ${longDateFromDateNumeric(createdAt)} Z
      ${infoString ? `<br />${infoString}` : ""}`}
    >
      {<>{returnDivContent(updatedAt)}</>}
    </div>
  );
};

export const LastEdited: FunctionComponent<{
  updatedAt: string;
  createdAt: string;
  infoString?: string;
}> = ({ updatedAt, createdAt, infoString }) => {
  const returnDivContent = (updatedAt: string) => {
    if (!updatedAt) return <>N/A</>;
    const timeAgo = dayjs(updatedAt).fromNow();
    return <>{timeAgo}</>;
  };

  return (
    <div
      className={styles.updatedAt}
      data-tooltip-id="aegis-tooltip"
      data-tooltip-html={`Updated At: ${longDateFromDateString(updatedAt)} Z
      <br />Created At: ${longDateFromDateString(createdAt)} Z
      ${infoString ? `<br />${infoString}` : ""}`}
    >
      {<>{returnDivContent(updatedAt)}</>}
    </div>
  );
};

export const SubpanelHeading: FunctionComponent<{
  icon: IconProp;
  children: ReactNode;
  helpCopy?: string;
}> = ({ icon, children, helpCopy = null }) => {
  return (
    <div style={{ color: "var(--grey5)" }}>
      <FontAwesomeIcon icon={icon} style={{ width: "15px", marginRight: "3px" }} />
      <span>{children}</span>
      {helpCopy && (
        <FontAwesomeIcon
          icon={faInfoCircle}
          className={styles.helpInfoIcon}
          data-tooltip-id="aegis-tooltip"
          data-tooltip-html={helpCopy}
        />
      )}
    </div>
  );
};

export const LoadingOverlay: FunctionComponent<{
  message?: string;
}> = ({ message = "Loading..." }) => {
  return (
    <div className={styles.loadingOverlay} aria-label="loading-overlay">
      <div className={styles.loadingSpinner}></div>
      <div>{message}</div>
    </div>
  );
};
