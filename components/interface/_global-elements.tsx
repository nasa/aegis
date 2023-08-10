import { IconProp } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { FunctionComponent, ReactNode } from "react";
import styles from "./_global-elements.module.css";
import _ from "lodash";
import { longdateFromDateString } from "utils/formatting";
import React from "react";
import { isModified } from "utils/component-helpers";

type UuidObject = Object & MustContain;

export const ModifiedIndicator: FunctionComponent<{
  obj1: UuidObject[];
  obj2: UuidObject[];
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
      >
        <svg height={svgStyle.height} width={svgStyle.width}>
          <circle cx={svgStyle.cx} cy={svgStyle.cy} r={svgStyle.r} fill={svgStyle.fill} />
        </svg>
      </span>
    );
  }
};

export const LastEdited: FunctionComponent<{
  updatedAt: string;
}> = ({ updatedAt }) => {
  const returnDivContent = (updatedAt: string) => {
    if (!updatedAt) return <>N/A</>;
    const date = new Date(updatedAt);
    // calculate the difference between now and the last update
    const diff = Math.floor((Date.now() - date.getTime()) / 1000);
    // less than 1 minute
    switch (true) {
      case diff < 60:
        return <>just now</>;
      case diff < 3600:
        const minutes = Math.floor(diff / 60);
        return (
          <>
            {minutes} minute{minutes === 1 ? "" : "s"} ago
          </>
        );
      case diff < 86400:
        const hours = Math.floor(diff / 3600);
        return (
          <>
            {hours} hour{hours === 1 ? "" : "s"} ago
          </>
        );
      case diff < 604800:
        const days = Math.floor(diff / 86400);
        return (
          <>
            {days} day{days === 1 ? "" : "s"} ago
          </>
        );
      case diff < 2592000:
        const weeks = Math.floor(diff / 604800);
        return (
          <>
            {weeks} week{weeks === 1 ? "" : "s"} ago
          </>
        );
      case diff < 31536000:
        const months = Math.floor(diff / 2592000);
        return (
          <>
            {months} month{months === 1 ? "" : "s"} ago
          </>
        );
      default:
        const years = Math.floor(diff / 31536000);
        return (
          <>
            {years} year{years === 1 ? "" : "s"} ago
          </>
        );
    }
  };

  if (!updatedAt) return <></>;
  return (
    <div
      className={styles.updatedAt}
      data-tooltip-id="aegis-tooltip"
      data-tooltip-html={`${longdateFromDateString(updatedAt)} Z`}
    >
      {<>{returnDivContent(updatedAt)}</>}
    </div>
  );
};

export const SubpanelHeading: FunctionComponent<{
  icon: IconProp;
  children: ReactNode;
}> = ({ icon, children }) => {
  return (
    <div style={{ color: "var(--grey5)" }}>
      <FontAwesomeIcon icon={icon} style={{ width: "15px", marginRight: "3px" }} />
      <span>{children}</span>
    </div>
  );
};
