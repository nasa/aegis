import { FunctionComponent, useRef } from "react";
import paneStyles from "../global-pane-styles.module.css";
import styles from "./rex.module.css";
import { useAppSelector, shallowEqual } from "utils/useAppSelector";
import { SubpanelHeading } from "components/interface/_global-elements";
import { faList, faPlusCircle, faTrashAlt } from "@fortawesome/free-solid-svg-icons";
import { Button, InLineEditInput } from "components/interface/form/globalFields";
import { validators } from "components/interface/form/formValidators";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useAppDispatch } from "utils/useAppDispatch";

import {
  thunkCreatePosType,
  thunkDeletePosType,
  thunkUpdatePosTypeField,
} from "store/thunk/thunkRex";
import Picker from "@emoji-mart/react";
import emojiPickerData from "@emoji-mart/data";
import { decodeEmoji } from "utils/formatting";
import { CompactPicker } from "react-color";

const Positions_panel: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
  const dispatch = useAppDispatch();
  const selectedRex = useAppSelector(
    (state) => state.rex.rexes.find((rex) => rex.uuid === state.rex.selectedRexUuid),
    shallowEqual
  );

  return (
    <div className={paneStyles.rightBody}>
      <div className={paneStyles.rightBodyTitle}>Position Marker Types</div>
      <div className={paneStyles.rightBodyBody}>
        <div className={paneStyles.panelContainer}>
          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "8px" }}>
              <SubpanelHeading icon={faList}>Position Markers to Track</SubpanelHeading>
            </div>
            <div className={paneStyles.panelSectionBody}>
              <ul className={styles.propertyList}>
                <li className={styles.propertyListItem}>
                  <div className={paneStyles.descriptionContainer}>
                    <div
                      className={styles.propertyRowHeader}
                      style={{ backgroundColor: "var(--grey2)" }}
                    >
                      <div className={styles.propertyRowAbbr}>Abbr</div>
                      <div className={styles.propertyRowName}>Name</div>
                      <div className={styles.propertyRowIcon}>Icon</div>
                      <div className={styles.propertyRowPathColor}>Path Color</div>
                      <div className={styles.propertyRowTrash}></div>
                    </div>
                  </div>
                </li>

                {selectedRex.posTypes?.map((item, index) => (
                  <li key={item.uuid} className={styles.propertyListItem}>
                    <PosType
                      key={item.uuid}
                      rexUuid={selectedRex.uuid}
                      item={item}
                      editMode={editMode}
                      evenRow={index % 2 === 0}
                    />
                  </li>
                ))}
              </ul>

              {editMode && (
                <Button
                  icon={faPlusCircle}
                  label="Add Position Marker"
                  style={{ width: "155px", marginLeft: "18px", marginTop: "8px" }}
                  onClick={() => {
                    dispatch(thunkCreatePosType());
                  }}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Positions_panel;

const PosType: FunctionComponent<{
  rexUuid: string;
  item: PosType;
  editMode: boolean;
  evenRow: boolean;
}> = ({ rexUuid, item, editMode, evenRow }) => {
  const dispatch = useAppDispatch();

  let backgroundColor: string = "var(--grey2)";
  if (!editMode) {
    backgroundColor = evenRow ? "var(--grey2)" : "var(--grey1)";
  }
  return (
    <div className={paneStyles.descriptionContainer}>
      <div className={styles.propertyRow} style={{ backgroundColor }}>
        <div className={styles.propertyRowAbbr}>
          <InLineEditInput
            editing={editMode}
            fieldProps={{
              name: "posTypeAbbr",
              ariaLabel: "Position Marker Abbr.",
              style: { width: "100%" },
              validators: [validators.maxLength(1), validators.required],
            }}
            value={item.abbr}
            onSubmit={(val: string) => {
              dispatch(
                thunkUpdatePosTypeField({
                  rexUuid,
                  uuid: item.uuid,
                  fieldName: "abbr",
                  value: val,
                })
              );
            }}
            key={`${item.uuid}-name`}
          />
        </div>
        <div className={styles.propertyRowName}>
          <InLineEditInput
            editing={editMode}
            fieldProps={{
              name: "posTypeName",
              ariaLabel: "Position Marker Name",
              style: { width: "100%" },
              validators: [validators.maxLength(255), validators.required],
            }}
            value={item.name}
            onSubmit={(val: string) => {
              dispatch(
                thunkUpdatePosTypeField({
                  rexUuid,
                  uuid: item.uuid,
                  fieldName: "name",
                  value: val,
                })
              );
            }}
            key={`${item.uuid}-name`}
          />
        </div>
        <div className={styles.propertyRowIcon}>
          {editMode && (
            <PosIconMenu
              item={item}
              editMode={editMode}
              updateIcon={(val) => {
                dispatch(
                  thunkUpdatePosTypeField({
                    rexUuid,
                    uuid: item.uuid,
                    fieldName: "icon",
                    value: val,
                  })
                );
              }}
            />
          )}
          {!editMode && item.icon && decodeEmoji(item.icon)}
        </div>
        <div className={styles.propertyRowPathColor}>
          <PathColorPickerMenu
            item={item}
            editMode={editMode}
            updateColor={(val) => {
              dispatch(
                thunkUpdatePosTypeField({
                  rexUuid,
                  uuid: item.uuid,
                  fieldName: "pathColor",
                  value: val,
                })
              );
            }}
          />
        </div>
        <div className={styles.propertyRowTrash}>
          {editMode && (
            <FontAwesomeIcon
              icon={faTrashAlt}
              size="sm"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                dispatch(thunkDeletePosType({ rexUuid, posTypeUuid: item.uuid }));
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
};

const PosIconMenu: FunctionComponent<{
  item: PosType;
  editMode: boolean;
  updateIcon: (icon: string) => void;
}> = ({ item, editMode, updateIcon }) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleMenuOpen = (e: React.MouseEvent) => {
    const x = e.clientX - 330;
    menuRef.current.style.left = `${x}px`;
    menuRef.current.style.top = `${e.clientY}px`;
    dialogRef.current?.showModal();
  };

  return (
    <>
      <dialog
        ref={dialogRef}
        className={styles.dialogContainer}
        onClick={() => {
          dialogRef.current?.close();
        }}
      >
        <div
          className={styles.pickerMenu}
          ref={menuRef} // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onClick={(e: any) => {
            e.stopPropagation();
          }}
        >
          <Picker
            data={emojiPickerData}
            emojiButtonSize={30}
            emojiSize={20}
            perLine={10}
            darkMode={true}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onEmojiSelect={(e: any) => {
              updateIcon(e.unified);
              dialogRef.current?.close();
            }}
          />
        </div>
      </dialog>

      <div
        className={`${styles.propertyIconDisplay} ${editMode ? styles.propertyEditMode : ""}`}
        onClick={(e) => {
          if (!editMode) return;
          handleMenuOpen(e);
          dialogRef.current?.showModal();
          e.stopPropagation();
        }}
      >
        {item.icon && decodeEmoji(item.icon)}
      </div>
    </>
  );
};

const PathColorPickerMenu: FunctionComponent<{
  item: PosType;
  editMode: boolean;
  updateColor: (color: string) => void;
}> = ({ item, editMode, updateColor }) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleMenuOpen = (e: React.MouseEvent) => {
    const x = e.clientX - 250;
    menuRef.current.style.left = `${x}px`;
    menuRef.current.style.top = `${e.clientY}px`;

    dialogRef.current?.showModal();
  };

  return (
    <>
      <dialog
        ref={dialogRef}
        className={styles.dialogContainer}
        onClick={() => {
          dialogRef.current?.close();
        }}
      >
        <div className={styles.pickerMenu} ref={menuRef}>
          <CompactPicker
            color={item.pathColor}
            onChange={(color) => {
              updateColor(color.hex);
            }}
          />
        </div>
      </dialog>

      <div
        className={`${styles.propertyPathColor} ${editMode ? styles.propertyEditMode : ""}`}
        onClick={(e) => {
          if (!editMode) return;
          handleMenuOpen(e);
          dialogRef.current?.showModal();
          e.stopPropagation();
        }}
      >
        <div
          className={styles.pathColorSample}
          style={{
            backgroundColor: item?.pathColor,
          }}
        ></div>
      </div>
    </>
  );
};
