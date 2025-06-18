import { CSSProperties, FunctionComponent, useRef } from "react";

import rexStyles from "./rex.module.css";
import evaStyles from "../eva/eva.module.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useAppDispatch } from "utils/useAppDispatch";
import { thunkAddRexStatusEntry } from "store/thunk/thunkRex";
import { getRexStatusDisplayProperties } from "utils/rex";

export const RexStatusMenu: FunctionComponent<{
  rexStatus: RexStatus;
  divClassName: string;
  divStyle?: CSSProperties;
  entryType: "action" | "station" | "traverse" | "xgress";
  uuid: string;
  editPerms: boolean;
}> = ({ rexStatus, divClassName, divStyle = {}, entryType, uuid, editPerms }): JSX.Element => {
  const dispatch = useAppDispatch();
  const rexStatusDisplayProperties = getRexStatusDisplayProperties(rexStatus);
  const dialogRef = useRef(null);
  const menuRef = useRef(null);

  const handleMenuOpen = (e: React.MouseEvent) => {
    const x = e.clientX + 5; // width of the menu
    menuRef.current.style.left = `${x}px`;
    menuRef.current.style.top = `${e.clientY}px`;
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
      <div
        className={divClassName}
        style={{ ...divStyle, cursor: editPerms ? "pointer" : "default" }}
        onClick={(e) => {
          if (!editPerms) return;
          handleMenuOpen(e);
          dialogRef.current?.showModal();
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
