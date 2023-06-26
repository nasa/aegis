import {
  faCaretDown,
  faCaretRight,
  faClock,
  faGripVertical,
  faMessage,
  faTableList,
  faTrashAlt,
} from "@fortawesome/free-solid-svg-icons";
import { faCircleDot } from "@fortawesome/free-regular-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { LastEdited, SubpanelHeading } from "components/interface/_global-elements";
import { Dropdown, InLineEditInput } from "components/interface/form/globalFields";
import { WysiwygTextArea } from "components/interface/form/wysiwyg";
import { FunctionComponent, useState, CSSProperties } from "react";
import paneStyles from "./global-pane-styles.module.css";
import actionStyles from "./actions-action.module.css";
import { deleteActionByUuid, upsertAction } from "store/action";
import { longdateFromDateString, toDecimal } from "utils/formatting";
import { useDispatch } from "react-redux";
import { useAppSelector, shallowEqual } from "utils/useAppSelector";
import ReactDOMServer from "react-dom/server";
import STMSelector from "./stm-selector";
import { validators, regExValidators } from "components/interface/form/formValidators";

const RightAction: FunctionComponent<{
  editMode: boolean;
  setEditMode: (newEditMode: boolean) => void;
  action: Action;
  highlight: boolean;
  actionColor: CSSProperties;
}> = ({ editMode, setEditMode, action, highlight, actionColor }) => {
  const dispatch = useDispatch();
  const parentAction = useAppSelector(
    (state) =>
      state.action.actions.find((storeAction) => storeAction.uuid === action.parentActionUuid),
    shallowEqual
  );
  const parentPoi = useAppSelector(
    (state) => state.poi.pois.find((storePoi) => storePoi.uuid === parentAction?.poiUuid),
    shallowEqual
  );
  const [expanded, setExpanded] = useState(action.createdAt === undefined);
  console.log(action.createdAt);

  const buildActionTooltip = () => {
    if (parentAction && parentPoi) {
      const dateString = longdateFromDateString(action.parentCopyDate) + "Z";
      return ReactDOMServer.renderToStaticMarkup(
        <>
          Copied from {parentPoi.name} - {parentAction.name}
          <br />
          on {dateString}
        </>
      );
    } else {
      return <></>;
    }
  };

  return (
    <div className={`${paneStyles.panelContainer} ${actionStyles.actionPanelContainer}`}>
      <div className={`${paneStyles.actionsHeading} ${highlight && actionStyles.highlightAction}`}>
        {editMode && (
          <a>
            <FontAwesomeIcon icon={faGripVertical} className={actionStyles.reorderIcon} size="sm" />
          </a>
        )}

        <div
          className={`${paneStyles.actionsHeadingCaret} ${
            editMode && actionStyles.actionsHeadingCaret
          } `}
          onClick={() => {
            setExpanded(!expanded);
          }}
        >
          {expanded ? (
            <FontAwesomeIcon icon={faCaretDown} size="sm" />
          ) : (
            <FontAwesomeIcon
              icon={faCaretRight}
              size="sm"
              className={paneStyles.actionsHeadingCaretRight}
            />
          )}
        </div>
        {!editMode ? (
          <div
            className={`${paneStyles.actionsHeadingTitle}`}
            style={actionColor}
            onClick={() => {
              setExpanded(!expanded);
            }}
          >
            {action.type}
          </div>
        ) : (
          <Dropdown
            selected={action.type}
            onChange={(val) => {
              dispatch(upsertAction({ ...action, type: val as ActionType }));
            }}
            toolTip="Action Type"
          >
            <option value="measurement">Measurement</option>
            <option value="observation">Observation</option>
            <option value="sample">Sample</option>
            <option value="photo">Photo</option>
            <option value="other">Other</option>
          </Dropdown>
        )}

        <div className={paneStyles.actionsHeadingSubTitle}>
          <InLineEditInput
            value={action.name}
            editing={editMode}
            fieldProps={{
              name: "name",
              ariaLabel: "Action Title",
              style: { width: "100%" },
              validators: [validators.required, validators.maxLength(255)],
            }}
            onSubmit={(value: string) => {
              dispatch(upsertAction({ ...action, name: value }));
            }}
          />
        </div>
        {editMode ? (
          <div className={paneStyles.actionHeadingIcons}>
            <FontAwesomeIcon
              icon={faTrashAlt}
              size="sm"
              onClick={(e) => {
                dispatch(deleteActionByUuid(action.uuid));
                setEditMode(true);
                e.stopPropagation();
              }}
            />
          </div>
        ) : (
          action.parentActionUuid && (
            <div className={paneStyles.actionHeadingIcons}>
              <FontAwesomeIcon
                id={`${action.uuid}-${action.parentActionUuid}`}
                icon={faCircleDot}
                size="sm"
                className={actionStyles.iconFaded}
                data-tooltip-id="aegis-tooltip"
                data-tooltip-html={buildActionTooltip()}
              />
            </div>
          )
        )}
      </div>
      {expanded && (
        <>
          <div className={paneStyles.actionIndent}>
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
                  }} // handle innerHTML change
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
                                validators.mustBeNumber,
                                validators.maxLength(4),
                                validators.mustBeInteger,
                              ],
                              onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                                e.target.value = e.target.value.replace(
                                  regExValidators.regExNumber,
                                  ""
                                );
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
                                validators.mustBeNumber,
                                validators.maxLength(4),
                                validators.mustBeInteger,
                              ],
                              onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                                e.target.value = e.target.value.replace(
                                  regExValidators.regExNumber,
                                  ""
                                );
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
            <div className={paneStyles.panelSection}>
              <div className={paneStyles.panelSectionTitle}>
                <SubpanelHeading icon={faTableList}>STM Coverage</SubpanelHeading>
              </div>
              <div className={actionStyles.stmSelectorContainer}>
                <STMSelector
                  editMode={editMode}
                  action={action}
                  onSTMChange={(stmUuidRefs: string[]) => {
                    const updatedAction: Action = { ...action, stmUuidRefs: stmUuidRefs };
                    dispatch(upsertAction(updatedAction));
                  }}
                />
              </div>
            </div>

            <div className={paneStyles.panelSection}>
              <div className={paneStyles.panelSection2Column}>
                <div className={paneStyles.panelColumnTable}>
                  <div className={paneStyles.panelColumnTableRow}>
                    <div className={paneStyles.panelColumnTableCellLeft}>
                      <div className={paneStyles.displayFieldLabel}>Last Edited:</div>
                    </div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldValue}>
                        <LastEdited updatedAt={action?.updatedAt} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default RightAction;
