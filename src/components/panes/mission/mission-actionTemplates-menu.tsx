import { faClone, faEllipsisV, faTrashAlt } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { FunctionComponent } from "react";
import { useRef } from "react";
import actionStyles from "../actions-action.module.css";
import {
  applyDeleteActionTemplate,
  applyDuplicateActionTemplate,
} from "operations/apply/apply-mission-actionTemplate";
import { withMissionChange } from "client/automergeDocHandles";

export const ActionTemplateMenu: FunctionComponent<{
  uuid: string;
}> = ({ uuid }) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleMenuOpen = (e: React.MouseEvent) => {
    const x = e.clientX - 130; // width of the menu
    if (!menuRef.current) return;
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
        <div ref={menuRef} className={actionStyles.templateMenu}>
          <div
            className={actionStyles.menuItem}
            onClick={() => {
              withMissionChange((m) =>
                applyDuplicateActionTemplate(m, { actionTemplateUuid: uuid })
              );
              dialogRef.current?.close();
            }}
            aria-label="Duplicate"
          >
            <div className={actionStyles.menuItemIcon}>
              <FontAwesomeIcon icon={faClone} />
            </div>
            <div className={actionStyles.menuItemText}>Duplicate Template</div>
          </div>
          <div
            className={actionStyles.menuItem}
            onClick={(e) => {
              if (window.confirm("Are you sure you want to delete this Action Template?")) {
                withMissionChange((m) =>
                  applyDeleteActionTemplate(m, { actionTemplateUuid: uuid })
                );
                e.stopPropagation();
              }
              dialogRef.current?.close();
            }}
            aria-label="Delete"
          >
            <div className={actionStyles.menuItemIcon}>
              <FontAwesomeIcon icon={faTrashAlt} />
            </div>
            <div className={actionStyles.menuItemText}>Delete Template</div>
          </div>
        </div>
      </dialog>

      <FontAwesomeIcon
        icon={faEllipsisV}
        size="sm"
        aria-label="Template Menu"
        onClick={(e) => {
          handleMenuOpen(e);
          dialogRef.current?.showModal();
          e.stopPropagation();
        }}
        style={{ marginTop: "7px", width: "15px", color: "var(--grey5)", outline: "none" }}
        tabIndex={0}
      />
    </>
  );
};
