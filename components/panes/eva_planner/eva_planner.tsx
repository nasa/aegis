import { FunctionComponent, useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { RootState } from "store";
import styles from "./eva_planner.module.css";
import paneStyles from "../left_pane_styles.module.css";
import { setEvaItemMapAction } from "store/eva";
import _ from "lodash";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { library } from "@fortawesome/fontawesome-svg-core";
import { faChevronDown, faPlus, faGear } from "@fortawesome/free-solid-svg-icons";
library.add(faChevronDown, faPlus, faGear);

const EvaPlanner: FunctionComponent = () => {
  const dispatch = useDispatch();
  const evaState = useSelector((state: RootState) => state.eva);

  useEffect(() => {
    // console.log(evaState);
  }, [evaState]);

  return (
    <div className={paneStyles.panelContainer}>
      <div className={styles.actionHeader}>
        <div className={styles.select}>
          <select>
            <option value="">EVA 1</option>
          </select>
          <div className={styles.selectArrow}>
            <FontAwesomeIcon icon="chevron-down" size="xs" />
          </div>
        </div>
        <div className={styles.actionButtons}>
          <div className={styles.actionButton}>
            <FontAwesomeIcon icon="plus" />
          </div>
          <div className={styles.actionButton}>
            <FontAwesomeIcon icon="gear" />
          </div>
        </div>
      </div>

      <div className={styles.evaItems}>
        {evaState &&
          evaState.eva.evaItems.map((item) => {
            let evaItemIcon = null;
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
                    {item.mapAction === null && (
                      <button
                        className={styles.evaItemButton}
                        onClick={() => {
                          if (!item.latLngJSON && !item.latLngsJSON) {
                            dispatch(setEvaItemMapAction({ uuid: item.uuid, value: "create" }));
                          } else {
                            dispatch(setEvaItemMapAction({ uuid: item.uuid, value: "edit" }));
                          }
                        }}
                      >
                        <span className={styles.evaItemButtonLabel}>
                          {_.isNil(item.latLngJSON) && _.isNil(item.latLngsJSON) ? "Draw" : "Edit"}
                        </span>
                      </button>
                    )}
                    {item.mapAction === "create" && (
                      <button
                        className={styles.evaItemButton}
                        onClick={() => {
                          dispatch(setEvaItemMapAction({ uuid: item.uuid, value: "cancelCreate" }));
                        }}
                      >
                        <span className={styles.evaItemButtonLabel}>Cancel</span>
                      </button>
                    )}
                    {item.mapAction === "edit" && (
                      <button
                        className={styles.evaItemButton}
                        onClick={() => {
                          dispatch(setEvaItemMapAction({ uuid: item.uuid, value: "cancelEdit" }));
                        }}
                      >
                        <span className={styles.evaItemButtonLabel}>Cancel</span>
                      </button>
                    )}
                    {item.mapAction === "edit" && (
                      <button
                        className={styles.evaItemButton}
                        onClick={() => {
                          dispatch(setEvaItemMapAction({ uuid: item.uuid, value: "saveEdit" }));
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

export default EvaPlanner;
