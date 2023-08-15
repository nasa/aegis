import {
  faAtlas,
  faClock,
  faListOl,
  faMessage,
  faTableList,
  faToolbox,
  faUser,
  faWeightHanging,
} from "@fortawesome/free-solid-svg-icons";
import { faCircleDot } from "@fortawesome/free-regular-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { LastEdited, SubpanelHeading } from "components/interface/_global-elements";
import { Button, InLineEditInput } from "components/interface/form/globalFields";
import { WysiwygTextArea } from "components/interface/form/wysiwyg";
import { FunctionComponent } from "react";
import paneStyles from "./global-pane-styles.module.css";
import actionStyles from "./actions-action.module.css";
import { upsertAction } from "store/action";
import { useAppDispatch } from "utils/useAppDispatch";
import { longdateFromDateString, toDecimal } from "utils/formatting";
import { useAppSelector, shallowEqual } from "utils/useAppSelector";
import ReactDOMServer from "react-dom/server";
import STMSelector from "./stm-selector";
import { validators, regExValidators } from "components/interface/form/formValidators";
import _ from "lodash";
import { EquipmentSelector, GeographicUnitSelector } from "./actions-action-body-multiselectors";

export const RightActionBody: FunctionComponent<{
  editMode: boolean;
  action: Action;
  parentType: "station" | "poi" | "eva";
}> = ({ editMode, action, parentType }) => {
  const dispatch = useAppDispatch();
  const parentAction = useAppSelector(
    (state) =>
      state.action.actions.find((storeAction) => storeAction.uuid === action.parentActionUuid),
    shallowEqual
  );
  const parentPoi = useAppSelector(
    (state) => state.poi.pois.find((storePoi) => storePoi.uuid === parentAction?.poiUuid),
    shallowEqual
  );

  const buildActionTooltip = () => {
    if (parentAction && parentPoi) {
      const dateString = longdateFromDateString(action.parentCopyDate) + "Z";
      return ReactDOMServer.renderToStaticMarkup(
        <>
          Copied from POI {parentPoi.name} - {parentAction.name}
          <br />
          on {dateString}
        </>
      );
    } else {
      return <></>;
    }
  };

  const toggleCrewAssigned = (crewMember: Crew) => {
    const currentCrew = action.crewAssigned || [];
    let newCrew: Crew[] = [];
    if (currentCrew.includes(crewMember)) {
      newCrew = currentCrew.filter((c) => c !== crewMember);
    } else {
      newCrew = [...currentCrew, crewMember];
    }
    dispatch(
      upsertAction({
        ...action,
        crewAssigned: newCrew,
      })
    );
  };

  const ev1ButtonStyle = action.crewAssigned?.includes("EV1")
    ? { width: "50px", color: "#000", backgroundColor: "#fff" }
    : { width: "50px" };
  const ev2ButtonStyle = action.crewAssigned?.includes("EV2")
    ? { width: "50px", color: "#000", backgroundColor: "#fff" }
    : { width: "50px" };

  return (
    <div className={actionStyles.actionIndent}>
      <div className={paneStyles.panelSection}>
        <div className={paneStyles.panelSectionTitle}>
          <SubpanelHeading icon={faMessage}>Description</SubpanelHeading>
        </div>
        <div className={paneStyles.descriptionContainer}>
          <WysiwygTextArea
            value={action.description}
            editing={editMode}
            onChange={(value) => {
              const updatedAction: Action = { ...action, description: value };
              dispatch(upsertAction(updatedAction));
            }}
            key={action.uuid}
          />
        </div>
      </div>
      <div className={paneStyles.panelSection}>
        <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "8px" }}>
          <SubpanelHeading icon={faClock}>Estimated Action Time</SubpanelHeading>
        </div>
        <div className={paneStyles.panelSectionRow}>
          <div className={paneStyles.panelSection2Column}>
            <div className={paneStyles.panelColumnTable}>
              <div className={paneStyles.panelColumnTableRow}>
                <div className={paneStyles.panelColumnTableCellLeft}>
                  <div className={paneStyles.inputFieldLabel}>Nominal Duration (mins):</div>
                </div>
                <div className={paneStyles.panelColumnTableCell}>
                  <div className={paneStyles.inputFieldValue}>
                    <InLineEditInput
                      value={action.durationLower?.toString()}
                      editing={editMode}
                      fieldProps={{
                        name: "durationLower",
                        ariaLabel: "Minimum Time in minutes",
                        style: { width: "45px" },
                        validators: [
                          validators.maxLength(4),
                          validators.mustBeInteger,
                          validators.required,
                          validators.mustBeNumberGTZero,
                        ],
                        onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                          e.target.value = e.target.value.replace(regExValidators.regExNumber, "");
                        },
                      }}
                      onSubmit={(value: string) => {
                        dispatch(
                          upsertAction({
                            ...action,
                            durationLower: toDecimal(value),
                          })
                        );
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className={paneStyles.panelColumnTable}>
              <div className={paneStyles.panelColumnTableRow}>
                <div className={paneStyles.panelColumnTableCellLeft}>
                  <div className={paneStyles.inputFieldLabel}>Max Duration (mins):</div>
                </div>
                <div className={paneStyles.panelColumnTableCell}>
                  <div className={paneStyles.inputFieldValue}>
                    <InLineEditInput
                      value={action.durationUpper?.toString()}
                      editing={editMode}
                      fieldProps={{
                        name: "durationUpper",
                        ariaLabel: "Maximum Time in minutes",
                        style: { width: "45px" },
                        validators: [
                          validators.maxLength(4),
                          validators.mustBeInteger,
                          validators.required,
                          validators.mustBeNumberGTZero,
                        ],
                        onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                          e.target.value = e.target.value.replace(regExValidators.regExNumber, "");
                        },
                      }}
                      onSubmit={(value: string) => {
                        dispatch(
                          upsertAction({
                            ...action,
                            durationUpper: toDecimal(value),
                          })
                        );
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {parentType !== "poi" && (
        <>
          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "8px" }}>
              <SubpanelHeading icon={faUser}>Crew Assignment</SubpanelHeading>
            </div>
            <div className={paneStyles.panelSectionRow}>
              <div className={paneStyles.crewSelectorContainer}>
                {editMode ? (
                  <>
                    <Button
                      onClick={() => {
                        toggleCrewAssigned("EV1");
                      }}
                      label="EV1"
                      icon={null}
                      style={ev1ButtonStyle}
                      toolTip="Assign to EV1"
                    />
                    <Button
                      onClick={() => {
                        toggleCrewAssigned("EV2");
                      }}
                      label="EV2"
                      icon={null}
                      style={ev2ButtonStyle}
                      toolTip="Assign to EV2"
                    />
                  </>
                ) : (
                  <div className={paneStyles.inputFieldValue}>
                    {action.crewAssigned ? action.crewAssigned.map((crew) => `${crew} `) : "None"}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
      <div className={paneStyles.panelSection}>
        <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "8px" }}>
          <SubpanelHeading icon={faListOl}>Priority</SubpanelHeading>
        </div>
        <div className={paneStyles.panelSectionRow}>
          <div className={paneStyles.panelSection2Column}>
            <div className={paneStyles.panelColumnTable}>
              <div className={paneStyles.panelColumnTableRow}>
                <div className={paneStyles.panelColumnTableCellLeft}>
                  <div className={paneStyles.inputFieldLabel}>Priority (1-99):</div>
                </div>
                <div className={paneStyles.panelColumnTableCell}>
                  <div className={paneStyles.inputFieldValue}>
                    <InLineEditInput
                      value={action.priority?.toString()}
                      editing={editMode}
                      fieldProps={{
                        name: "priority",
                        ariaLabel: "Priority",
                        style: { width: "45px" },
                        validators: [validators.maxLength(2), validators.mustBeInteger],
                        onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                          e.target.value = e.target.value.replace(regExValidators.regExNumber, "");
                        },
                      }}
                      onSubmit={(value: string) => {
                        dispatch(
                          upsertAction({
                            ...action,
                            priority: toDecimal(value),
                          })
                        );
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className={paneStyles.panelSection}>
        <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "8px" }}>
          <SubpanelHeading icon={faWeightHanging}>Mass</SubpanelHeading>
        </div>
        <div className={paneStyles.panelSectionRow}>
          <div className={paneStyles.panelSection2Column}>
            <div className={paneStyles.panelColumnTable}>
              <div className={paneStyles.panelColumnTableRow}>
                <div className={paneStyles.panelColumnTableCellLeft}>
                  <div className={paneStyles.inputFieldLabel}>Expected Sample Mass (g):</div>
                </div>
                <div className={paneStyles.panelColumnTableCell}>
                  <div className={paneStyles.inputFieldValue}>
                    <InLineEditInput
                      value={action.mass?.toString()}
                      editing={editMode}
                      fieldProps={{
                        name: "mass",
                        ariaLabel: "Expected Sample Mass",
                        style: { width: "45px" },
                        validators: [
                          validators.mustBeNumber,
                          validators.maxLength(4),
                          validators.mustBeInteger,
                        ],
                        onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                          e.target.value = e.target.value.replace(regExValidators.regExNumber, "");
                        },
                      }}
                      onSubmit={(value: string) => {
                        dispatch(
                          upsertAction({
                            ...action,
                            mass: toDecimal(value),
                          })
                        );
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className={paneStyles.panelSection}>
        <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "8px" }}>
          <SubpanelHeading icon={faToolbox}>Equipment Required</SubpanelHeading>
        </div>
        <div className={paneStyles.panelSectionRow}>
          <EquipmentSelector
            equipmentItemsUsage={action.equipmentItemsUsage}
            editMode={editMode}
            onChange={(e) => {
              dispatch(
                upsertAction({
                  ...action,
                  equipmentItemsUsage: e,
                })
              );
            }}
            uniqueId={action.uuid}
          />
        </div>
      </div>
      <div className={paneStyles.panelSection}>
        <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "8px" }}>
          <SubpanelHeading icon={faAtlas}>Associated Geographic Units</SubpanelHeading>
        </div>
        <div className={paneStyles.panelSectionRow}>
          <GeographicUnitSelector
            geographicUnitsUsage={action.geographicUnitsUsage}
            editMode={editMode}
            onChange={(e) => {
              dispatch(
                upsertAction({
                  ...action,
                  geographicUnitsUsage: e,
                })
              );
            }}
            uniqueId={action.uuid}
          />
        </div>
      </div>
      <div className={paneStyles.panelSection}>
        <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "8px" }}>
          <SubpanelHeading icon={faTableList}>STM Coverage</SubpanelHeading>
        </div>
        <div className={actionStyles.selectorContainer}>
          <STMSelector
            editMode={editMode}
            stmUuidRefs={action.stmUuidRefs}
            onSTMChange={(stmUuidRefs: string[]) => {
              const updatedAction: Action = { ...action, stmUuidRefs: stmUuidRefs };
              dispatch(upsertAction(updatedAction));
            }}
          />
        </div>
      </div>

      <div className={paneStyles.panelSection}>
        <div className={paneStyles.displayFieldLabel}>Last Edited:</div>
      </div>
      <div className={paneStyles.lastEditedContainer}>
        <div className={paneStyles.displayFieldValue}>
          <LastEdited updatedAt={action?.updatedAt} />
        </div>
        {action.parentActionUuid && (
          <div style={{ flex: "0 0 20px" }}>
            <FontAwesomeIcon
              id={`${action.uuid}-${action.parentActionUuid}`}
              icon={faCircleDot}
              size="sm"
              className={actionStyles.iconFaded}
              data-tooltip-id="aegis-tooltip"
              data-tooltip-html={buildActionTooltip()}
            />
          </div>
        )}
      </div>
    </div>
  );
};
