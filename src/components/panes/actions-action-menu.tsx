import {
  faEllipsisV,
  faEye,
  faEyeSlash,
  faGears,
  faTrashAlt,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { FunctionComponent, useRef } from "react";
import { useAppDispatch } from "utils/useAppDispatch";
import actionStyles from "./actions-action.module.css";
import { upsertAction } from "store/action";
import { thunkDeleteActionFromStore } from "store/thunk/thunkAction";
import { thunkCreateTemplateFromAction } from "store/thunk/thunkMission";
import { setMissionSectionEditing } from "store/mission";

export const ActionMenu: FunctionComponent<{
  action: Action;
}> = ({ action }) => {
  const dispatch = useAppDispatch();
  const dialogRef = useRef(null);
  const menuRef = useRef(null);

  const handleMenuOpen = (e: React.MouseEvent) => {
    const x = e.clientX - 130; // width of the menu
    menuRef.current.style.left = `${x}px`;
    menuRef.current.style.top = `${e.clientY}px`;
  };

  return (
    <>
      <dialog
        ref={dialogRef}
        className={actionStyles.menuContainer}
        onClick={() => {
          dialogRef.current?.close();
        }}
      >
        <div ref={menuRef} className={actionStyles.menu}>
          <div
            className={actionStyles.menuItem}
            onClick={() => {
              dispatch(upsertAction({ ...action, enabled: !action.enabled }));
              dialogRef.current?.close();
            }}
          >
            <div className={actionStyles.menuItemIcon}>
              <FontAwesomeIcon icon={action.enabled ? faEyeSlash : faEye} size="sm" />
            </div>
            <div className={actionStyles.menuItemText}>
              {action.enabled ? "Deactivate" : "Activate"} Action
            </div>
          </div>
          <div
            className={actionStyles.menuItem}
            onClick={(e) => {
              if (window.confirm("Are you sure you want to delete this Action?")) {
                dispatch(thunkDeleteActionFromStore({ uuid: action.uuid }));
                e.stopPropagation();
              }
              dialogRef.current?.close();
            }}
          >
            <div className={actionStyles.menuItemIcon}>
              <FontAwesomeIcon icon={faTrashAlt} size="sm" />
            </div>
            <div className={actionStyles.menuItemText}>Delete Action</div>
          </div>
          <div
            className={actionStyles.menuItem}
            onClick={async (e) => {
              e.stopPropagation();
              dispatch(setMissionSectionEditing({ section: "prefs", editMode: true }));
              const newTemplateUuid = await dispatch(
                thunkCreateTemplateFromAction({ actionUuid: action.uuid })
              );
              window.alert(
                `Action Template created from action. To save this action template to the database, please save go to the mission configuration tab and save the mission.\nTemplate UUID: ${newTemplateUuid.payload}`
              );

              dialogRef.current?.close();
            }}
          >
            <div className={actionStyles.menuItemIcon}>
              <FontAwesomeIcon icon={faGears} size="sm" />
            </div>
            <div className={actionStyles.menuItemText}>Use as Template</div>
          </div>
        </div>
      </dialog>

      <FontAwesomeIcon
        icon={faEllipsisV}
        size="sm"
        onClick={(e) => {
          handleMenuOpen(e);
          dialogRef.current?.showModal();
          e.stopPropagation();
        }}
        style={{ marginTop: "3px", width: "15px", color: "var(--grey5)", outline: "none" }}
        tabIndex={0}
      />
    </>
  );
};
