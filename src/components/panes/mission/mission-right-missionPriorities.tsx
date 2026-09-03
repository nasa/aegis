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
import { useMissionDocSelector } from "utils/useDocSelector";
import { withMissionChange, withMissionOp } from "client/automergeDocHandles";
import {
  applyCreateMissionPriority,
  applyCreateMissionPriorityCategory,
  applyRenameMissionPriorityCategory,
  applyUpdateMissionPriorityByField,
  getMissionPriorityCategories,
} from "operations/apply/apply-mission-priority";
import {
  opDeleteMissionPriority,
  opDeleteMissionPriorityCategory,
} from "operations/op-missionPriority";
import { buildMissionPriorityName } from "store/storeUtils/mission";
import { makeUniqueStringCopy } from "utils/names/duplicate";

/**
 * Sort mission priority entries by category, then by trace within each category. Numeric
 * collation keeps SIMD-0002 ahead of SIMD-0010 instead of sorting them lexically.
 */
const sortMissionPriorities = (
  missionPriorities: MissionPriorities | null
): [string, MissionPriority][] =>
  Object.entries(missionPriorities ?? {}).sort(([, a], [, b]) => {
    const categoryComparison = a.category.localeCompare(b.category);
    if (categoryComparison !== 0) {
      return categoryComparison;
    }
    return a.trace.localeCompare(b.trace, undefined, { numeric: true });
  });

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
        <div style={{ marginTop: "8px", paddingLeft: "8px" }}>
          {editMode && (
            <Button
              icon={faPlusCircle}
              label="Add Category"
              style={{ width: "115px" }}
              onClick={() => {
                const category = makeUniqueStringCopy("New Category", categories, false);
                withMissionChange((m) => applyCreateMissionPriorityCategory(m, { category }));
              }}
              ariaLabel="createCategoryButton"
            />
          )}
        </div>
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
                  focusContents={category.startsWith("New Category")}
                  key={`${category}-name`}
                />
              ) : (
                category
              )}
            </SubpanelHeading>
          </div>
          <div className={missionStyles.propertyRowTrashContainer}>
            <div className={missionStyles.propertyRowTrash} style={{ fontSize: "1rem" }}>
              {editMode && (
                <FontAwesomeIcon
                  icon={faTrashAlt}
                  size="sm"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const inUseMessage = withMissionOp(opDeleteMissionPriorityCategory, category);
                    if (inUseMessage) {
                      alert(inUseMessage);
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
          <div style={{ paddingLeft: "5px" }}>
            <Button
              icon={faPlusCircle}
              label="Add Trace"
              style={{ width: "100px" }}
              onClick={() => {
                withMissionChange((m) => applyCreateMissionPriority(m, { category }));
              }}
              ariaLabel="addTraceButton"
            />
          </div>
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
            focusContents={missionPriority.trace === "(Trace)"}
          />
        </div>
        <div className={missionStyles.propertyRowTrashContainer}>
          <div className={missionStyles.propertyRowTrash}>
            {editMode && (
              <FontAwesomeIcon
                icon={faTrashAlt}
                size="sm"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const inUseMessage = withMissionOp(opDeleteMissionPriority, uuid);
                  if (inUseMessage) {
                    alert(inUseMessage);
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
