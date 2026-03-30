import { faEllipsisV, faTrashAlt, faEdit } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { FunctionComponent } from "react";
import { useRef } from "react";
import { useAppDispatch } from "utils/useAppDispatch";
import { thunkCancelPosEntryInEdit, thunkDeletePosEntryByUuid } from "store/thunk/thunkRexPosEntry";
import styles from "./map-menu-pos.module.css";
import { setPosEntryInEdit, setSelectedPosEntryUuid } from "store/rex";

export const PosKabobMenu: FunctionComponent<{
  posEntry: PosEntry;
  isSelected: boolean;
  isEditing: boolean;
}> = ({ posEntry, isSelected, isEditing }) => {
  const dispatch = useAppDispatch();
  const dialogRef = useRef(null);
  const menuRef = useRef(null);

  const handleMenuOpen = (e: React.MouseEvent) => {
    const x = e.clientX + 5;
    menuRef.current.style.left = `${x}px`;
    menuRef.current.style.top = `${e.clientY}px`;
    if (x + 150 > window.innerWidth) {
      //width of kabob menu is 150
      menuRef.current.style.transform = `translateX(-100%)`;
      menuRef.current.style.whiteSpace = "nowrap";
    } else {
      menuRef.current.style.transform = `translateX(0)`;
    }
  };

  const handleEdit = async (posEntryUuid: string) => {
    //cancel out anything else in edit before putting this one in edit
    await dispatch(thunkCancelPosEntryInEdit());
    dispatch(setPosEntryInEdit(posEntry));
    dispatch(setSelectedPosEntryUuid(posEntryUuid));
  };
  return (
    <>
      <dialog
        ref={dialogRef}
        className={styles.kabobContainer}
        onClick={() => {
          dialogRef.current?.close();
        }}
      >
        <div ref={menuRef} className={styles.kabobMenu}>
          {!isEditing && (
            <div
              className={styles.kabobMenuItem}
              onClick={() => {
                handleEdit(posEntry.uuid);
                dialogRef.current?.close();
              }}
            >
              <FontAwesomeIcon icon={faEdit} className={styles.historicPosIcon}></FontAwesomeIcon>
              Edit
            </div>
          )}
          <div
            className={styles.kabobMenuItem}
            onClick={(e) => {
              if (window.confirm("Are you sure you want to delete this Crew Position?")) {
                dispatch(
                  thunkDeletePosEntryByUuid({
                    posEntryUuid: posEntry.uuid,
                  })
                );
                e.stopPropagation();
              }
              dialogRef.current?.close();
            }}
          >
            <FontAwesomeIcon icon={faTrashAlt} className={styles.historicPosIcon}></FontAwesomeIcon>
            Delete Entry
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
        style={{
          width: "10px",
          color: `${isSelected ? "black" : "var(--grey5)"}`,
          outline: "none",
        }}
        tabIndex={0}
      />
    </>
  );
};
