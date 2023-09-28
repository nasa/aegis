import { FunctionComponent } from "react";
import styles from "./preset-right-layers-info.module.css";

const Info_subpanel: FunctionComponent<{
  sublayer: Sublayer;
}> = ({ sublayer }) => {
  return (
    <div className={styles.container}>
      <div className={styles.title}>Description</div>
      <div className={styles.description}>{sublayer.description || "None"}</div>
      {sublayer.legend && (
        <>
          <div className={styles.title}>
            Legend {sublayer.legend.unitsAbbr ? `(${sublayer.legend.unitsAbbr})` : ""}
          </div>
          <div className={styles.legend}>
            {sublayer.legend.legend.map((legendItem) => {
              return (
                <div className={styles.legendItem} key={legendItem.color}>
                  <div
                    className={styles.legendColor}
                    style={{ backgroundColor: `${legendItem.color}` }}
                  ></div>
                  <div>{legendItem.value}</div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

export default Info_subpanel;
