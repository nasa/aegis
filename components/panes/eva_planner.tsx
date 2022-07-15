import { useEffect } from "react";
import { useSelector } from "react-redux";
import { RootState } from "store";
import styles from "./eva_planner.module.css";

const Eva_Planner = () => {
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
                    {item.position && <button className={styles.button}>Edit Position</button>}
                    {!item.position && <button>Add to Map</button>}
                  </div>
                </div>
              );
            } else {
              return (
                <div key={item.uuid} className={styles.evaTraverse}>
                  <div>{item.name}</div>
                  <div className={styles.buttonGroup}>
                    {item.latLngsJSON && <button className={styles.button}>Edit Position</button>}
                    {!item.latLngsJSON && <button>Add to Map?</button>}
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
