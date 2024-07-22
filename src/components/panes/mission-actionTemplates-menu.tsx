import { faClone, faEllipsisV, faTrashAlt } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { FunctionComponent, useRef } from "react";
import { useAppDispatch } from "utils/useAppDispatch";
import actionStyles from "./actions-action.module.css";
import { thunkDuplicateActionTemplate, thunkDeleteActionTemplate } from "store/thunk/thunkMission";

export const ActionTemplateMenu: FunctionComponent<{
  actionTemplate: ActionTemplate;
}> = ({ actionTemplate }) => {
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
        <div ref={menuRef} className={actionStyles.templateMenu}>
          <div
            className={actionStyles.menuItem}
            onClick={() => {
              dispatch(thunkDuplicateActionTemplate({ actionTemplateUuid: actionTemplate.uuid }));
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
                dispatch(thunkDeleteActionTemplate({ actionTemplateUuid: actionTemplate.uuid }));
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
        style={{ marginTop: "3px", width: "15px", color: "var(--grey5)", outline: "none" }}
        tabIndex={0}
      />
    </>
  );
};
