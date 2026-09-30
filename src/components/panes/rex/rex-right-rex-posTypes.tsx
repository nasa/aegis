import type { FunctionComponent } from "react";
import { useRef } from "react";
import paneStyles from "../global-pane-styles.module.css";
import rexStyles from "./rex.module.css";
import { useAppSelector, deepEqual, refEqual } from "utils/useAppSelector";
import cloneDeep from "lodash/cloneDeep";
import { SubpanelHeading } from "components/interface/_global-elements";
import {
  faList,
  faPlusCircle,
  faTrashAlt,
  faGripVertical,
} from "@fortawesome/free-solid-svg-icons";
import ReactDragListView from "react-drag-listview";
import { Button, PathColorPickerMenu } from "components/interface/form/globalFields";
import { ValidatedInputField } from "components/interface/form/globalFieldsAutomerge";
import { validators } from "components/interface/form/formValidators";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useAppDispatch } from "utils/useAppDispatch";

import { thunkDocCreatePosType, thunkDocDeletePosType } from "store/thunk/thunkRexPosEntry";
import { thunkDocCreatePosSource, thunkDocDeletePosSource } from "store/thunk/thunkRexPosSource";
import { EmojiPicker, EmojiRenderer } from "components/interface/emojis";
import {
  applyUpdatePosSourceField,
  applyUpdatePosTypeField,
  applyUpdateRexByField,
} from "operations/apply/apply-rex";
import { withMissionChange } from "client/automergeDocHandles";
import { useMissionDocSelector } from "utils/useDocSelector";
import { useMemo } from "react";

const Positions_panel: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
  const dispatch = useAppDispatch();
  const selectedRexUuid = useAppSelector((state) => state.rex.selectedRexUuid, refEqual);
  const allRexes = useMissionDocSelector((mission) => mission.rexes, deepEqual);
  const selectedRex = useMemo(
    () => (selectedRexUuid ? allRexes?.[selectedRexUuid] : undefined),
    [allRexes, selectedRexUuid]
  );

  // Reorder pos types and upsert to rex
  function reorderType(fromIndex: number, toIndex: number) {
    const newPositionTypeList = cloneDeep(selectedRex.posTypes);
    // Remove header layer
    const headerLayerBeingMoved = newPositionTypeList.splice(fromIndex, 1)[0];
    // Reinsert in new position
    newPositionTypeList.splice(toIndex, 0, headerLayerBeingMoved);
    withMissionChange((m) =>
      applyUpdateRexByField(m, {
        rexUuid: selectedRex.uuid,
        fieldName: "posTypes",
        value: newPositionTypeList,
        preserveUpdatedAt: true,
      })
    );
  }

  return (
    <div className={paneStyles.rightBody}>
      <div className={paneStyles.rightBodyTitle}>REX Position Types and Sources</div>
      <div className={paneStyles.rightBodyBody}>
        <div className={paneStyles.panelContainer}>
          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "8px" }}>
              <SubpanelHeading icon={faList}>Position Types</SubpanelHeading>
            </div>
            <div>
              <div className={paneStyles.panelTextIndented}>
                Items to track the position of such as crew members, equipment, or cart.
              </div>
              <ul className={rexStyles.propertyList}>
                <li className={rexStyles.propertyListHeaderItem}>
                  <div className={paneStyles.descriptionContainer}>
                    <div
                      className={rexStyles.propertyRowHeader}
                      style={{ backgroundColor: "var(--grey2)" }}
                    >
                      <div className={rexStyles.propertyHeaderGrip}></div>
                      <div className={rexStyles.propertyHeaderAbbr}>Abbr</div>
                      <div className={rexStyles.propertyHeaderName}>Name</div>
                      <div className={rexStyles.propertyHeaderIcon}>Icon</div>
                      <div className={rexStyles.propertyHeaderPathColor}>Path Color</div>
                      <div className={rexStyles.propertyRowTrash}></div>
                    </div>
                  </div>
                </li>
                <ReactDragListView
                  onDragEnd={reorderType}
                  nodeSelector={`li.${rexStyles.propertyListItem}`}
                  handleSelector={`a.rexTypeReorder`}
                >
                  {selectedRex.posTypes?.map((item, index) => {
                    return (
                      <li key={item.uuid} className={rexStyles.propertyListItem}>
                        <PosType
                          rexUuid={selectedRex.uuid}
                          item={item}
                          editMode={editMode}
                          evenRow={index % 2 === 0}
                        />
                      </li>
                    );
                  })}
                </ReactDragListView>
              </ul>

              {editMode && (
                <Button
                  icon={faPlusCircle}
                  label="Add Position Marker"
                  style={{ width: "155px", marginLeft: "18px", marginTop: "8px" }}
                  onClick={() => {
                    dispatch(thunkDocCreatePosType());
                  }}
                />
              )}
            </div>
          </div>
        </div>
        <div className={paneStyles.panelContainer}>
          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "8px" }}>
              <SubpanelHeading icon={faList}>Position Sources</SubpanelHeading>
            </div>
            <div className={paneStyles.panelTextIndented}>
              List of sources making position estimates such as Crew, Task, SER.
            </div>
            <div>
              <ul className={rexStyles.propertyList}>
                <li className={rexStyles.propertyListHeaderItem}>
                  <div className={paneStyles.descriptionContainer}>
                    <div
                      className={rexStyles.propertyRowHeader}
                      style={{ backgroundColor: "var(--grey2)" }}
                    >
                      <div className={rexStyles.propertyHeaderAbbr}>Abbr</div>
                      <div className={rexStyles.propertyHeaderName}>Name</div>
                      <div className={rexStyles.propertyRowTrash}></div>
                    </div>
                  </div>
                </li>
                {selectedRex.posSources?.map((item, index) => {
                  return (
                    <li key={item.uuid} className={rexStyles.propertyListItem}>
                      <PosSource
                        rexUuid={selectedRex.uuid}
                        item={item}
                        editMode={editMode}
                        evenRow={index % 2 === 0}
                      />
                    </li>
                  );
                })}
              </ul>

              {editMode && (
                <Button
                  icon={faPlusCircle}
                  label="Add Position Source"
                  style={{ width: "155px", marginLeft: "18px", marginTop: "8px" }}
                  onClick={() => {
                    dispatch(thunkDocCreatePosSource());
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
      <div className={rexStyles.propertyRow} style={{ backgroundColor }}>
        <div className={rexStyles.propertyRowGrip}>
          {editMode && (
            <a className="rexTypeReorder">
              <FontAwesomeIcon
                icon={faGripVertical}
                size="sm"
                className={rexStyles.reorderIconGrip}
              />
            </a>
          )}
        </div>
        <div className={rexStyles.propertyRowAbbr}>
          <ValidatedInputField
            editMode={editMode}
            fieldProps={{
              name: "posTypeAbbr",
              ariaLabel: "Position Marker Abbr.",
              validators: [validators.maxLength(1), validators.required],
            }}
            value={item.abbr}
            onSubmit={(val: string) => {
              withMissionChange((m) =>
                applyUpdatePosTypeField(m, {
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
        <div className={rexStyles.propertyRowName}>
          <ValidatedInputField
            editMode={editMode}
            fieldProps={{
              name: "posTypeName",
              ariaLabel: "Position Marker Name",
              validators: [validators.maxLength(255), validators.required],
            }}
            value={item.name}
            onSubmit={(val: string) => {
              withMissionChange((m) =>
                applyUpdatePosTypeField(m, {
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
        <div className={rexStyles.propertyRowIcon}>
          {editMode && (
            <PosIconMenu
              item={item}
              editMode={editMode}
              updateIcon={(val) => {
                withMissionChange((m) =>
                  applyUpdatePosTypeField(m, {
                    rexUuid,
                    uuid: item.uuid,
                    fieldName: "icon",
                    value: val,
                  })
                );
              }}
            />
          )}
          {!editMode && item.icon && <EmojiRenderer iconValue={item.icon} />}
        </div>
        <div className={rexStyles.propertyRowPathColor}>
          <PathColorPickerMenu
            currentColor={item.pathColor}
            editMode={editMode}
            updateColor={(val) => {
              withMissionChange((m) =>
                applyUpdatePosTypeField(m, {
                  rexUuid,
                  uuid: item.uuid,
                  fieldName: "pathColor",
                  value: val,
                })
              );
            }}
            hasDarkBorder={evenRow}
          />
        </div>
        <div className={rexStyles.propertyRowTrash}>
          {editMode && (
            <FontAwesomeIcon
              icon={faTrashAlt}
              size="sm"
              onClick={async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const result = await dispatch(
                  thunkDocDeletePosType({ rexUuid, posTypeUuid: item.uuid })
                );
                if (thunkDocDeletePosType.rejected.match(result) && result.payload) {
                  alert(result.payload);
                }
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
        className={rexStyles.dialogContainer}
        onClick={() => {
          dialogRef.current?.close();
        }}
      >
        <div
          className={rexStyles.pickerMenu}
          ref={menuRef} // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onClick={(e: any) => {
            e.stopPropagation();
          }}
        >
          <EmojiPicker
            emojiButtonSize={30}
            emojiSize={20}
            perLine={10}
            darkMode={true}
            onEmojiSelect={(e) => {
              // Handle both standard emojis (unified) and custom emojis (id)
              const iconValue = e.unified || e.id;
              updateIcon(iconValue);
              dialogRef.current?.close();
            }}
          />
        </div>
      </dialog>

      <div
        className={`${rexStyles.propertyIconDisplay} ${editMode ? rexStyles.propertyEditMode : ""}`}
        onClick={(e) => {
          if (!editMode) return;
          handleMenuOpen(e);
          dialogRef.current?.showModal();
          e.stopPropagation();
        }}
      >
        {item.icon && <EmojiRenderer iconValue={item.icon} />}
      </div>
    </>
  );
};

const PosSource: FunctionComponent<{
  rexUuid: string;
  item: PosSource;
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
      <div className={rexStyles.propertyRow} style={{ backgroundColor }}>
        <div className={rexStyles.propertyRowAbbr}>
          <ValidatedInputField
            editMode={editMode}
            fieldProps={{
              name: "posSourceAbbr",
              ariaLabel: "Position Source Abbr.",
              validators: [validators.maxLength(1), validators.required],
            }}
            value={item.abbr}
            onSubmit={(val: string) => {
              withMissionChange((m) =>
                applyUpdatePosSourceField(m, {
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
        <div className={rexStyles.propertyRowName}>
          <ValidatedInputField
            editMode={editMode}
            fieldProps={{
              name: "posSourceName",
              ariaLabel: "Position Source Name",
              validators: [validators.maxLength(255), validators.required],
            }}
            value={item.name}
            onSubmit={(val: string) => {
              withMissionChange((m) =>
                applyUpdatePosSourceField(m, {
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

        <div className={rexStyles.propertyRowTrash}>
          {editMode && (
            <FontAwesomeIcon
              icon={faTrashAlt}
              size="sm"
              onClick={async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const result = await dispatch(
                  thunkDocDeletePosSource({ rexUuid, posSourceUuid: item.uuid })
                );
                if (thunkDocDeletePosSource.rejected.match(result) && result.payload) {
                  alert(result.payload);
                }
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
};
