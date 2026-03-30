import type { FunctionComponent } from "react";
import styles from "./circles.module.css";
import { faEye, faEyeSlash, faSliders } from "@fortawesome/free-solid-svg-icons";
import { useAppDispatch } from "utils/useAppDispatch";
import { deepEqual } from "utils/useAppSelector";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { setSectionSelected } from "store/interface";
import { setSelectedMissionRightNavItem } from "store/mission";
import Settings_subpanel from "./settings-and-slider";
import { useMissionDocSelector } from "utils/useDocSelector";

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
  const circleDefinitions = useMissionDocSelector((doc) => doc.circleDefinitions, deepEqual);

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
          Object.entries(circleDefinitions)
            .sort(([, a], [, b]) => a.radius - b.radius)
            .map(([uuid, circleDefinition]) => {
              return (
                mapCircleControls[uuid] &&
                circleUIStates[uuid] && (
                  <CircleLayer
                    editMode={editMode}
                    key={uuid}
                    uuid={uuid}
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
  uuid: string;
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
  uuid,
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
          mapCircleControls[uuid].visible || editMode ? null : styles.sublayerDisabled
        }`}
      >
        {editMode ? (
          <div
            className={styles.visibility}
            onClick={() => {
              if (!editMode) return;
              toggleVisibleFunction({ circleUuid: uuid });
            }}
          >
            {mapCircleControls[uuid].visible ? (
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
                  circleDefUuid: uuid,
                  slidersSelected: !circleUIStates[uuid].slidersSelected,
                });
              }}
            >
              <FontAwesomeIcon icon={faSliders} />
            </div>
          )}
        </div>
      </div>
      {circleUIStates[uuid].slidersSelected && (
        <div>
          <Settings_subpanel
            styleSetter={styleSetter}
            type={"circle"}
            uuid={uuid}
            mapCircleControls={mapCircleControls}
          />
        </div>
      )}
    </div>
  );
};
