import { useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { RootState } from "store";
import styles from "./eva_planner.module.css";
import { toggleEvaItemEditActive } from "store/eva";

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
            if (item.type === "station") {
              return (
                <div key={item.uuid} className={styles.evaStation}>
                  <div>{item.name}</div>
                  <div className={styles.buttonGroup}>
                    <button
                      onClick={() => {
                        dispatch(toggleEvaItemEditActive(item.uuid));
                      }}
                    >
                      {item.latLngJSON && "Edit on Map"}
                      {!item.latLngJSON && "Add to Map"}
                    </button>
                  </div>
                </div>
              );
            } else {
              return (
                <div key={item.uuid} className={styles.evaTraverse}>
                  <div>{item.name}</div>
                  <div className={styles.buttonGroup}>
                    <button
                      className={styles.button}
                      onClick={() => {
                        dispatch(toggleEvaItemEditActive(item.uuid));
                      }}
                    >
                      {item.latLngsJSON && "Edit on Map"}
                      {!item.latLngsJSON && "Add to Map"}
                    </button>
                  </div>
                </div>
              );
            }
          })}
      </div>
    </div>
  );
};

export default Eva_Planner;
