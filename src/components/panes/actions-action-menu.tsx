import {
  faClone,
  faEllipsisV,
  faEye,
  faEyeSlash,
  faGears,
  faTrashAlt,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { FunctionComponent } from "react";
import { useRef } from "react";
import actionStyles from "./actions-action.module.css";
import { refEqual, useAppSelector } from "utils/useAppSelector";
import { withMissionChange } from "client/automergeDocHandles";
import {
  applyDeleteActionAndUpdateParent,
  applyDuplicateActions,
  applyUpdateActionByField,
} from "operations/apply/apply-action";
import { applyCreateTemplateFromAction } from "operations/apply/apply-mission-actionTemplate";

export const ActionMenu: FunctionComponent<{
  action: Action;
}> = ({ action }) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const missionEditPerms = useAppSelector(
    (state) =>
      (state.user.missionPerms.permissions.edit && state.user.appUser.isAdmin) ||
      state.user.appUser.isSuperAdmin,
    refEqual
  );

  const handleMenuOpen = (e: React.MouseEvent) => {
    const x = e.clientX - 130; // width of the menu
    if (menuRef.current) {
      menuRef.current.style.left = `${x}px`;
      menuRef.current.style.top = `${e.clientY}px`;
    }
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
              withMissionChange((m) =>
                applyUpdateActionByField(m, {
                  actionUuid: action.uuid,
                  fieldName: "enabled",
                  value: !action.enabled,
                })
              );
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
                withMissionChange((m) =>
                  applyDeleteActionAndUpdateParent(m, { uuid: action.uuid })
                );
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
          {missionEditPerms && (
            <div
              className={actionStyles.menuItem}
              onClick={async (e) => {
                e.stopPropagation();
                withMissionChange((m) =>
                  applyCreateTemplateFromAction(m, { actionUuid: action.uuid })
                );
                window.alert(`Action Template successfully created from action.`);

                dialogRef.current?.close();
              }}
            >
              <div className={actionStyles.menuItemIcon}>
                <FontAwesomeIcon icon={faGears} size="sm" />
              </div>
              <div className={actionStyles.menuItemText}>Save as Template</div>
            </div>
          )}
          <div
            className={actionStyles.menuItem}
            onClick={(e) => {
              e.stopPropagation();
              withMissionChange((m) =>
                applyDuplicateActions(m, {
                  actions: [action],
                  stationUuid: action.stationUuid,
                  poiUuid: action.poiUuid,
                  traverseUuid: action.traverseUuid,
                  preserveRefUuid: false,
                })
              );
              dialogRef.current?.close();
            }}
          >
            <div className={actionStyles.menuItemIcon}>
              <FontAwesomeIcon icon={faClone} size="sm" />
            </div>
            <div className={actionStyles.menuItemText}>Duplicate Action</div>
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
