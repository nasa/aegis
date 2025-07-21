import { CSSProperties, FunctionComponent, useRef } from "react";

import rexStyles from "./rex.module.css";
import evaStyles from "../eva/eva.module.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useAppDispatch } from "utils/useAppDispatch";
import { thunkAddRexStatusEntry } from "store/thunk/thunkRex";
import { getRexStatusDisplayProperties } from "utils/component-helpers";
import { faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";

export const RexStatusMenu: FunctionComponent<{
  rexStatus: RexStatus;
  divClassName: string;
  divStyle?: CSSProperties;
  entryType: "action" | "station" | "traverse" | "xgress";
  uuid: string;
  editPerms: boolean;
  maestroControlled: boolean;
}> = ({
  rexStatus,
  divClassName,
  divStyle = {},
  entryType,
  uuid,
  editPerms,
  maestroControlled,
}): JSX.Element => {
  const dispatch = useAppDispatch();
  const rexStatusDisplayProperties = getRexStatusDisplayProperties(rexStatus);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const maestroDialogRef = useRef<HTMLDialogElement>(null);

  const handleMenuOpen = (e: React.MouseEvent) => {
    if (!editPerms) return;

    if (maestroControlled) {
      const maestroDialogElement = maestroDialogRef.current;
      if (maestroDialogElement) {
        const x = e.clientX + 145; // width of the menu
        maestroDialogElement.style.left = `${x}px`;
        maestroDialogElement.style.top = `${e.clientY}px`;
        maestroDialogElement.showModal();
      }
      return;
    }

    const statusDialogElement = dialogRef.current;
    const statusMenuElement = menuRef.current;
    if (statusDialogElement && statusMenuElement) {
      const x = e.clientX + 5; // width of the menu
      statusMenuElement.style.left = `${x}px`;
      statusMenuElement.style.top = `${e.clientY}px`;
      statusDialogElement.showModal();
    }
  };

  const handleRexStatusClick = (rexStatus: RexStatus) => {
    dispatch(thunkAddRexStatusEntry({ entryType, uuid, rexStatus }));
    dialogRef.current?.close();
  };

  return (
    <>
      <dialog
        ref={dialogRef}
        className={rexStyles.rexStatusContainer}
        onClick={() => {
          dialogRef.current?.close();
        }}
      >
        <div ref={menuRef} className={rexStyles.rexStatusMenu}>
          <RexStatusMenuItem
            rexStatus="pending"
            title="Pending"
            handleRexStatusClick={handleRexStatusClick}
          />
          <RexStatusMenuItem
            rexStatus="in-progress"
            title="In-Progress"
            handleRexStatusClick={handleRexStatusClick}
          />
          <RexStatusMenuItem
            rexStatus="complete"
            title="Complete"
            handleRexStatusClick={handleRexStatusClick}
          />
          <RexStatusMenuItem
            rexStatus="skipped"
            title="Skipped"
            handleRexStatusClick={handleRexStatusClick}
          />
        </div>
      </dialog>
      <dialog
        ref={maestroDialogRef}
        className={rexStyles.maestroDialogContainer}
        onClick={() => {
          maestroDialogRef.current?.close();
        }}
      >
        <div className={rexStyles.maestroDialogMenu}>
          <FontAwesomeIcon icon={faTriangleExclamation} style={{ color: "var(--error)" }} /> Item
          status is controlled by Maestro
        </div>
      </dialog>
      <div
        className={divClassName}
        style={{ ...divStyle, cursor: editPerms && maestroControlled ? "pointer" : "default" }}
        onClick={(e) => {
          handleMenuOpen(e);
          e.stopPropagation();
        }}
        data-tooltip-id="aegis-tooltip"
        data-tooltip-html={rexStatusDisplayProperties.tooltip}
      >
        <FontAwesomeIcon
          icon={rexStatusDisplayProperties.icon}
          className={`${evaStyles.rexStatusIcon} ${rexStatusDisplayProperties.iconStyle}`}
        />
      </div>
    </>
  );
};

const RexStatusMenuItem: FunctionComponent<{
  rexStatus: RexStatus;
  title: string;
  handleRexStatusClick: Function;
}> = ({ rexStatus, title, handleRexStatusClick }) => {
  return (
    <div
      className={rexStyles.rexStatusMenuItem}
      onClick={() => {
        handleRexStatusClick(rexStatus);
      }}
    >
      <FontAwesomeIcon
        icon={getRexStatusDisplayProperties(rexStatus).icon}
        className={`${evaStyles.rexStatusMenuIcon} ${getRexStatusDisplayProperties(rexStatus).iconStyle}`}
      />
      <div className={rexStyles.rexStatusMenuItemTitle}>{title}</div>
    </div>
  );
};
