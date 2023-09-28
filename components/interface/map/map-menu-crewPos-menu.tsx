import { faEllipsisV, faTrashAlt, faEdit } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Dispatch, FunctionComponent, SetStateAction, useRef } from "react";
import { useAppDispatch } from "utils/useAppDispatch";
import { thunkCancelCrewPos, thunkDeleteCrewPosByUuid } from "store/thunk/thunkRex";
import styles from "./map-menu-crewPos.module.css";
import { useAppSelector, refEqual } from "utils/useAppSelector";
import { setCrewPosEditingUuid, setRexesCrewPosEditMode, setSelectedCrewPosUuid } from "store/rex";

export const CrewPosKabobMenu: FunctionComponent<{
  crewPos: CrewPos;
  isSelected: boolean;
  isEditing: boolean;
  setCrewSelected: Dispatch<SetStateAction<RexCrewType[]>>;
}> = ({ crewPos, isSelected, isEditing, setCrewSelected }) => {
  const dispatch = useAppDispatch();
  const dialogRef = useRef(null);
  const menuRef = useRef(null);
  const selectedRexUuid = useAppSelector((state) => state.rex.selectedRexUuid, refEqual);
  const crewPosEditingUuid = useAppSelector((state) => state.rex.crewPosEditingUuid, refEqual);

  const handleMenuOpen = (e: React.MouseEvent) => {
    const x = e.clientX + 5; // width of the menu
    menuRef.current.style.left = `${x}px`;
    menuRef.current.style.top = `${e.clientY}px`;
  };

  const handleEdit = async (crewPosUuid: string) => {
    //cancel out anything else in edit before putting this one in edit
    await dispatch(thunkCancelCrewPos({ crewPosUuid: crewPosEditingUuid }));

    setCrewSelected(crewPos.crew);
    dispatch(setSelectedCrewPosUuid(crewPosUuid));
    dispatch(setCrewPosEditingUuid(crewPos.uuid));
    dispatch(setRexesCrewPosEditMode({ rexUuid: selectedRexUuid, editMode: true }));
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
                handleEdit(crewPos.uuid);
                dialogRef.current?.close();
              }}
            >
              <FontAwesomeIcon icon={faEdit} className={styles.historicPosIcon}></FontAwesomeIcon>
              Edit Crew or Location
            </div>
          )}
          <div
            className={styles.kabobMenuItem}
            onClick={(e) => {
              if (window.confirm("Are you sure you want to delete this Crew Position?")) {
                dispatch(
                  thunkDeleteCrewPosByUuid({
                    crewPosUuid: crewPos.uuid,
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
