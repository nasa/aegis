import { useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { RootState } from "store";
import styles from "./eva_planner.module.css";
import { setEvaItemTriggerAction } from "store/eva";
import _ from "lodash";

const Eva_Planner = () => {
  const dispatch = useDispatch();
  const evaState = useSelector((state: RootState) => state.eva);

  useEffect(() => {
    // console.log(evaState);
  }, [evaState]);

  return (
    <div>
      <h1>{evaState && evaState.eva.name}</h1>
      <div className={styles.evaItems}>
        {evaState &&
          evaState.eva.evaItems.map((item) => {
            return (
              <div
                key={item.uuid}
                className={item.type === "station" ? styles.evaStation : styles.evaTraverse}
              >
                <div>{item.name}</div>
                <div className={styles.buttonGroup}>
                  {item.triggerAction === null && (
                    <button
                      onClick={() => {
                        if (!item.latLngJSON && !item.latLngsJSON) {
                          dispatch(setEvaItemTriggerAction({ uuid: item.uuid, value: "create" }));
                        } else {
                          dispatch(setEvaItemTriggerAction({ uuid: item.uuid, value: "edit" }));
                        }
                      }}
                    >
                      {_.isNil(item.latLngJSON) && _.isNil(item.latLngsJSON) ? "Create" : "Edit"}
                    </button>
                  )}
                  {item.triggerAction === "create" && (
                    <button
                      onClick={() => {
                        dispatch(
                          setEvaItemTriggerAction({ uuid: item.uuid, value: "cancelCreate" })
                        );
                      }}
                    >
                      Cancel Create
                    </button>
                  )}
                  {item.triggerAction === "edit" && (
                    <button
                      onClick={() => {
                        dispatch(setEvaItemTriggerAction({ uuid: item.uuid, value: "cancelEdit" }));
                      }}
                    >
                      Cancel Edit
                    </button>
                  )}
                  {item.triggerAction === "edit" && (
                    <button
                      onClick={() => {
                        dispatch(setEvaItemTriggerAction({ uuid: item.uuid, value: "saveEdit" }));
                      }}
                    >
                      Save Edit
                    </button>
                  )}
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
};

export default Eva_Planner;
