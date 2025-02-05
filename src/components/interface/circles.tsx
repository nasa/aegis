import { FunctionComponent } from "react";
import styles from "./circles.module.css";
import { faEye, faEyeSlash, faSliders } from "@fortawesome/free-solid-svg-icons";
import { useAppDispatch } from "utils/useAppDispatch";
import { useAppSelector, shallowEqual } from "utils/useAppSelector";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { setSectionSelected } from "store/interface";
import { setSelectedMissionRightNavItem } from "store/mission";
import Settings_subpanel from "./settings-and-slider";

const Circles: FunctionComponent<{
  editMode: boolean;
  mapCircleControls: MapCircleControls;
  toggleVisibleFunction: ({ circleUuid }: { circleUuid: string }) => void;
  circleUIStates?: CircleUIStates;
  circleUIStateSetterFunction?: ({
    circleDefUuid,
    slidersSelected,
  }: {
    circleDefUuid: string;
    slidersSelected: boolean;
  }) => void;
  styleSetter: ({ uuid, layerStyle }: { uuid: string; layerStyle: MapSublayerStyle }) => void;
}> = ({
  editMode,
  mapCircleControls,
  toggleVisibleFunction,
  circleUIStates,
  circleUIStateSetterFunction,
  styleSetter,
}) => {
  circleUIStates = circleUIStates || {};
  circleUIStateSetterFunction = circleUIStateSetterFunction || (() => {});
  const dispatch = useAppDispatch();

  const circleDefinitions = useAppSelector(
    (state) => state.mission.mission?.circleDefinitions,
    shallowEqual
  );

  const handleNavToMissionSection = () => {
    dispatch(setSectionSelected("mission"));
    dispatch(setSelectedMissionRightNavItem("circle_panel"));
  };

  return (
    <>
      <div className={styles.circleSubtext}>
        <div>
          Manage this list in the{" "}
          <span
            className={styles.circleSubtextLink}
            onClick={() => {
              handleNavToMissionSection();
            }}
          >
            Mission Section
          </span>
        </div>
      </div>
      <div className={styles.circlesGroup}>
        {circleDefinitions &&
          circleDefinitions.map((circleDefinition: CircleDefinition) => {
            return (
              mapCircleControls[circleDefinition.uuid] &&
              circleUIStates[circleDefinition.uuid] && (
                <CircleLayer
                  editMode={editMode}
                  key={circleDefinition.uuid}
                  circleDefinition={circleDefinition}
                  mapCircleControls={mapCircleControls}
                  toggleVisibleFunction={toggleVisibleFunction}
                  circleUIStates={circleUIStates}
                  circleUIStateSetterFunction={circleUIStateSetterFunction}
                  styleSetter={styleSetter}
                />
              )
            );
          })}
      </div>
    </>
  );
};

export default Circles;

const CircleLayer: FunctionComponent<{
  editMode: boolean;
  circleDefinition: CircleDefinition;
  mapCircleControls: MapCircleControls;
  toggleVisibleFunction: ({ circleUuid }: { circleUuid: string }) => void;
  circleUIStates?: CircleUIStates;
  circleUIStateSetterFunction?: ({
    circleDefUuid,
    slidersSelected,
  }: {
    circleDefUuid: string;
    slidersSelected: boolean;
  }) => void;
  styleSetter: ({ uuid, layerStyle }: { uuid: string; layerStyle: MapSublayerStyle }) => void;
}> = ({
  editMode,
  circleDefinition,
  mapCircleControls,
  toggleVisibleFunction,
  circleUIStates,
  circleUIStateSetterFunction,
  styleSetter,
}) => {
  circleUIStates = circleUIStates || {};
  circleUIStateSetterFunction = circleUIStateSetterFunction || (() => {});
  return (
    <div className={styles.sublayerItemContainer}>
      <div
        className={`${styles.sublayer} ${
          mapCircleControls[circleDefinition.uuid].visible || editMode
            ? null
            : styles.sublayerDisabled
        }`}
      >
        {editMode ? (
          <div
            className={styles.visibility}
            onClick={() => {
              if (!editMode) return;
              toggleVisibleFunction({ circleUuid: circleDefinition.uuid });
            }}
          >
            {mapCircleControls[circleDefinition.uuid].visible ? (
              <div className={styles.visible}>
                <FontAwesomeIcon icon={faEye} size="xs" />
              </div>
            ) : (
              <div className={styles.inVisible}>
                <FontAwesomeIcon icon={faEyeSlash} size="xs" />
              </div>
            )}
          </div>
        ) : (
          <div className={styles.visibility} />
        )}
        <div className={styles.sublayerTitle}>{circleDefinition.name}</div>
        <div>{`${circleDefinition.radius}m`}</div>
        <div className={styles.sublayerCircleDefinitionsToolIcons}>
          <div className={styles.sublayerToolIcon}></div>
          {editMode && (
            <div
              onClick={() => {
                if (!editMode) return;

                circleUIStateSetterFunction({
                  circleDefUuid: circleDefinition.uuid,
                  slidersSelected: !circleUIStates[circleDefinition.uuid].slidersSelected,
                });
              }}
            >
              <FontAwesomeIcon icon={faSliders} />
            </div>
          )}
        </div>
      </div>
      {circleUIStates[circleDefinition.uuid].slidersSelected && (
        <div>
          <Settings_subpanel
            styleSetter={styleSetter}
            type={"circle"}
            uuid={circleDefinition.uuid}
            mapCircleControls={mapCircleControls}
          />
        </div>
      )}
    </div>
  );
};
