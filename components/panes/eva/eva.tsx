import { FunctionComponent } from "react";
import { useDispatch } from "react-redux";
import { useAppSelector, shallowEqual } from "utils/useAppSelector";
import styles from "./eva.module.css";
import paneStyles from "../global-pane-styles.module.css";
import _ from "lodash";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown, faPlus, faGear } from "@fortawesome/free-solid-svg-icons";
import { upsertUserMapObject } from "store/map";

const EvaPlannerLeft: FunctionComponent = () => {
  const dispatch = useDispatch();
  const evaItems = useAppSelector((state) => state.eva.eva.evaItems, shallowEqual);
  const userMapObjects = useAppSelector((state) => state.map.userMapObjects, shallowEqual);

  return (
    <div className={paneStyles.panelContainer}>
      <div className={styles.actionHeader}>
        <div className={styles.select}>
          <select title="Select EVA">
            <option value="">EVA 1</option>
          </select>
          <div className={styles.selectArrow}>
            <FontAwesomeIcon icon={faChevronDown} size="xs" />
          </div>
        </div>
        <div className={styles.actionButtons}>
          <div className={styles.actionButton}>
            <FontAwesomeIcon icon={faPlus} />
          </div>
          <div className={styles.actionButton}>
            <FontAwesomeIcon icon={faGear} />
          </div>
        </div>
      </div>

      <div className={styles.evaItems}>
        {evaItems &&
          evaItems.map((item) => {
            let evaItemIcon = null;
            const userMapObject = userMapObjects.find((mapObject) => mapObject.uuid === item.uuid);
            const mapAction = userMapObject ? userMapObject.mapAction : null;

            if (item.type === "lander") {
              evaItemIcon = (
                <div className={styles.evaIndicator}>
                  <div className={styles.iconLander} />
                </div>
              );
            } else if (item.type === "station") {
              evaItemIcon = (
                <div className={styles.evaIndicator}>
                  <div className={styles.iconStation} />
                </div>
              );
            } else if (item.type === "traverse") {
              evaItemIcon = (
                <div className={styles.evaIndicator}>
                  <div className={styles.iconTraverseContainer}>
                    <div className={styles.iconTraverse} />
                  </div>
                </div>
              );
            }

            return (
              <div className={styles.evaItem} key={item.uuid}>
                {evaItemIcon}
                <div className={styles.evaItemInfoAndActions}>
                  <div className={styles.evaItemName}>{item.name}</div>
                  <div className={styles.evaItemButtons}>
                    {mapAction === null && (
                      <button
                        className={styles.evaItemButton}
                        onClick={() => {
                          if (!item.location) {
                            dispatch(
                              upsertUserMapObject({
                                mapItemType: "evaItem",
                                mapObject: item.type === "traverse" ? "polyline" : "marker",
                                uuid: item.uuid,
                                createdAt: new Date().toISOString(),
                                mapAction: "create",
                              })
                            );
                          } else {
                            dispatch(
                              upsertUserMapObject({
                                mapItemType: "evaItem",
                                mapObject: item.type === "traverse" ? "polyline" : "marker",
                                uuid: item.uuid,
                                createdAt: new Date().toISOString(),
                                mapAction: "edit",
                              })
                            );
                          }
                        }}
                      >
                        <span className={styles.evaItemButtonLabel}>
                          {!item.location ? "Draw" : "Edit"}
                        </span>
                      </button>
                    )}
                    {mapAction === "create" && (
                      <button
                        className={styles.evaItemButton}
                        onClick={() => {
                          dispatch(
                            upsertUserMapObject({
                              mapItemType: "evaItem",
                              mapObject: item.type === "traverse" ? "polyline" : "marker",
                              uuid: item.uuid,
                              createdAt: new Date().toISOString(),
                              mapAction: "cancelCreate",
                            })
                          );
                        }}
                      >
                        <span className={styles.evaItemButtonLabel}>Cancel</span>
                      </button>
                    )}
                    {mapAction === "edit" && (
                      <button
                        className={styles.evaItemButton}
                        onClick={() => {
                          dispatch(
                            upsertUserMapObject({
                              mapItemType: "evaItem",
                              mapObject: item.type === "traverse" ? "polyline" : "marker",
                              uuid: item.uuid,
                              createdAt: new Date().toISOString(),
                              mapAction: "cancelEdit",
                            })
                          );
                        }}
                      >
                        <span className={styles.evaItemButtonLabel}>Cancel</span>
                      </button>
                    )}
                    {mapAction === "edit" && (
                      <button
                        className={styles.evaItemButton}
                        onClick={() => {
                          dispatch(
                            upsertUserMapObject({
                              mapItemType: "evaItem",
                              mapObject: item.type === "traverse" ? "polyline" : "marker",
                              uuid: item.uuid,
                              createdAt: new Date().toISOString(),
                              mapAction: "saveEdit",
                            })
                          );
                        }}
                      >
                        <span className={styles.evaItemButtonLabel}>Save</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
};

export default EvaPlannerLeft;
