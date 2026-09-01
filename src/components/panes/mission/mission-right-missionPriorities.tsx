import type { FunctionComponent } from "react";
import { memo } from "react";
import paneStyles from "../global-pane-styles.module.css";
import missionStyles from "./mission.module.css";
import { deepEqual } from "utils/useAppSelector";
import { SubpanelHeading } from "components/interface/_global-elements";
import { faList, faPlusCircle, faTrashAlt } from "@fortawesome/free-solid-svg-icons";
import { Button, Dropdown } from "components/interface/form/globalFields";
import { ValidatedInputField } from "components/interface/form/globalFieldsAutomerge";
import { validators } from "components/interface/form/formValidators";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useAppDispatch } from "utils/useAppDispatch";
import { useMissionDocSelector } from "utils/useDocSelector";
import { withMissionChange } from "client/automergeDocHandles";
import {
  applyCreateMissionPriority,
  applyCreateMissionPriorityCategory,
  applyRenameMissionPriorityCategory,
  applyUpdateMissionPriorityByField,
  getMissionPriorityCategories,
} from "operations/apply/apply-mission-priority";
import {
  thunkDocDeleteMissionPriority,
  thunkDocDeleteMissionPriorityCategory,
} from "store/thunk/thunkMissionPriority";
import {
  BLANK_MISSION_PRIORITY_TRACE,
  buildMissionPriorityName,
  sortMissionPriorities,
} from "store/storeUtils/mission";
import { makeUniqueStringCopy } from "utils/names/duplicate";

const NEW_CATEGORY_NAME = "New Category";

const MissionPriorities_Panel: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
  const missionPriorities = useMissionDocSelector(
    (mission) => mission.missionPriorities,
    deepEqual
  );

  const categories = getMissionPriorityCategories({ missionPriorities });

  return (
    <div className={paneStyles.rightBody}>
      <div className={paneStyles.rightBodyTitle} aria-label="rightBodyTitle">
        Mission Priorities
      </div>
      <div className={paneStyles.rightBodyBody}>
        {categories.map((category) => (
          <div className={paneStyles.panelContainer} key={category}>
            <MissionPriorityCategory
              category={category}
              otherCategories={categories.filter((c) => c !== category)}
              missionPriorities={missionPriorities}
              editMode={editMode}
            />
          </div>
        ))}
        {editMode && (
          <div className={paneStyles.panelContainer}>
            <Button
              icon={faPlusCircle}
              label="Create Category"
              style={{ width: "150px", marginLeft: "18px", marginTop: "8px" }}
              onClick={() => {
                // Categories have no storage of their own, so a new one is created by
                // inserting its first placeholder trace row.
                const category = makeUniqueStringCopy(NEW_CATEGORY_NAME, categories, false);
                withMissionChange((m) => applyCreateMissionPriorityCategory(m, { category }));
              }}
              ariaLabel="createCategoryButton"
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default MissionPriorities_Panel;

const MissionPriorityCategory: FunctionComponent<{
  category: string;
  otherCategories: string[];
  missionPriorities: MissionPriorities | null;
  editMode: boolean;
}> = ({ category, otherCategories, missionPriorities, editMode }) => {
  const dispatch = useAppDispatch();

  const traces = sortMissionPriorities(missionPriorities).filter(
    ([, missionPriority]) => missionPriority.category === category
  );

  return (
    <div className={paneStyles.panelSection}>
      <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "8px" }}>
        <div className={missionStyles.propertyRow}>
          <div className={missionStyles.propertyRowName}>
            <SubpanelHeading icon={faList}>
              {editMode ? (
                <ValidatedInputField
                  editMode={editMode}
                  fieldProps={{
                    name: "missionPriorityCategory",
                    ariaLabel: "Category name",
                    validators: [
                      validators.required,
                      validators.maxLength(255),
                      validators.mustBeUnique(otherCategories),
                    ],
                  }}
                  value={category}
                  styleContainer={{ display: "inline-block", minWidth: "120px" }}
                  onSubmit={(val: string) => {
                    withMissionChange((m) =>
                      applyRenameMissionPriorityCategory(m, {
                        fromCategory: category,
                        toCategory: val,
                      })
                    );
                  }}
                  focusContents={category.startsWith(NEW_CATEGORY_NAME)}
                  key={`${category}-name`}
                />
              ) : (
                category
              )}
            </SubpanelHeading>
          </div>
          <div className={missionStyles.propertyRowTrashContainer}>
            <div className={missionStyles.propertyRowTrash}>
              {editMode && (
                <FontAwesomeIcon
                  icon={faTrashAlt}
                  size="sm"
                  onClick={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const result = await dispatch(
                      thunkDocDeleteMissionPriorityCategory({ category })
                    );
                    if (
                      thunkDocDeleteMissionPriorityCategory.rejected.match(result) &&
                      result.payload
                    ) {
                      alert(result.payload);
                    }
                  }}
                  aria-label="deleteCategoryButton"
                />
              )}
            </div>
          </div>
        </div>
      </div>
      <div>
        <ul className={missionStyles.propertyList}>
          <li className={missionStyles.propertyListItem}>
            <div>
              <div
                className={missionStyles.propertyRowHeader}
                style={{ backgroundColor: "var(--grey2)" }}
              >
                <div className={missionStyles.propertyRowName}>Trace</div>
                <div className={missionStyles.propertyRowTrashContainer}></div>
              </div>
            </div>
          </li>
          {traces.map(([uuid, missionPriority], index) => (
            <li
              key={uuid}
              className={missionStyles.propertyListItem}
              aria-label="missionPriorities-item"
            >
              <MemoizedMissionPriorityItem
                uuid={uuid}
                missionPriority={missionPriority}
                editMode={editMode}
                evenRow={index % 2 === 0}
              />
            </li>
          ))}
        </ul>

        {editMode && (
          <Button
            icon={faPlusCircle}
            label="Add Trace"
            style={{ width: "110px", marginLeft: "18px", marginTop: "8px" }}
            onClick={() => {
              withMissionChange((m) => applyCreateMissionPriority(m, { category }));
            }}
            ariaLabel="addTraceButton"
          />
        )}
      </div>
    </div>
  );
};

const MissionPriorityItem: FunctionComponent<{
  uuid: string;
  missionPriority: MissionPriority;
  editMode: boolean;
  evenRow: boolean;
}> = ({ uuid, missionPriority, editMode, evenRow }) => {
  const dispatch = useAppDispatch();

  const backgroundColor = evenRow ? "var(--grey2)" : "var(--grey1)";

  return (
    <div>
      <div className={missionStyles.propertyRow} style={{ backgroundColor }}>
        <div className={missionStyles.propertyRowName}>
          <ValidatedInputField
            editMode={editMode}
            fieldProps={{
              name: "missionPriorityTrace",
              ariaLabel: "Trace",
              validators: [validators.required, validators.maxLength(255)],
            }}
            value={missionPriority.trace}
            onSubmit={(val: string) => {
              withMissionChange((m) =>
                applyUpdateMissionPriorityByField(m, {
                  missionPriorityUuid: uuid,
                  fieldName: "trace",
                  value: val,
                })
              );
            }}
            key={`${uuid}-trace`}
            focusContents={missionPriority.trace === BLANK_MISSION_PRIORITY_TRACE}
          />
        </div>
        <div className={missionStyles.propertyRowTrashContainer}>
          <div className={missionStyles.propertyRowTrash}>
            {editMode && (
              <FontAwesomeIcon
                icon={faTrashAlt}
                size="sm"
                onClick={async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const result = await dispatch(
                    thunkDocDeleteMissionPriority({ missionPriorityUuid: uuid })
                  );
                  if (thunkDocDeleteMissionPriority.rejected.match(result) && result.payload) {
                    alert(result.payload);
                  }
                }}
                aria-label="deleteButton"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Memoized version of the MissionPriorityItem component to prevent unnecessary re-renders
 * when the props haven't changed.
 * This is especially useful when the component is part of a list.
 */
const MemoizedMissionPriorityItem = memo(MissionPriorityItem);

/**
 * Single-select dropdown listing every mission priority as "<trace> | <category>", ordered by
 * trace. Shared by the action panel and the action template panel.
 */
export const MissionPriorityDropdown: FunctionComponent<{
  selectedUuid: string | null;
  editMode: boolean;
  onSelect: (missionPriorityUuid: string | null) => void;
}> = ({ selectedUuid, editMode, onSelect }) => {
  const missionPriorities = useMissionDocSelector(
    (mission) => mission.missionPriorities,
    deepEqual
  );

  const sortedMissionPriorities = sortMissionPriorities(missionPriorities);
  const selected = selectedUuid ? missionPriorities?.[selectedUuid] : null;

  if (!editMode) {
    return (
      <div className={paneStyles.displayFieldValue}>
        {selected ? buildMissionPriorityName(selected) : "Not set"}
      </div>
    );
  }

  return (
    <Dropdown
      selected={selectedUuid ?? ""}
      onChange={(val) => onSelect(val || null)}
      toolTip="Mission Priority"
      arrowStyle={{ color: "var(--grey5)" }}
      containerStyle={{ justifyContent: "flex-start", width: "inherit" }}
    >
      <option value="">Not set</option>
      {sortedMissionPriorities.map(([uuid, missionPriority]) => (
        <option key={uuid} value={uuid}>
          {buildMissionPriorityName(missionPriority)}
        </option>
      ))}
    </Dropdown>
  );
};
