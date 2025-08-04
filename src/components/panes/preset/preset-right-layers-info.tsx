import { FunctionComponent } from "react";
import styles from "./preset-right-layers-info.module.css";
import { getDateAndTimeFromISOString } from "utils/formatting";

const Info_subpanel: FunctionComponent<{
  sublayer: Sublayer;
}> = ({ sublayer }) => {
  return (
    <div className={styles.container}>
      <div className={styles.title}>Name</div>
      <div className={styles.description}>{sublayer.name.replace(/_/g, " ") || "None"}</div>
      <div className={styles.title}>Description</div>
      <div className={styles.description}>{sublayer.description || "None"}</div>
      {sublayer.legend && (
        <>
          <div className={styles.title}>
            Legend {sublayer.legend.unitsAbbr ? `(${sublayer.legend.unitsAbbr})` : ""}
          </div>
          <div className={styles.legend}>
            {sublayer.legend.legend.map((legendItem, index) => {
              return (
                <div className={styles.legendItem} key={`${index}-${legendItem.description}`}>
                  <div
                    className={styles.legendColor}
                    style={{ backgroundColor: `${legendItem.color}` }}
                  ></div>
                  <div>{legendItem.description}</div>
                </div>
              );
            })}
          </div>
        </>
      )}
      {sublayer.isTimeBased && (
        <div>
          <div className={styles.title}>Layer Time Bounds (UTC)</div>
          <div className={styles.description}>
            {getDateAndTimeFromISOString(sublayer.timeLayerManifest[0]?.lowerBound).join(" ")}
            {" - "}
            {getDateAndTimeFromISOString(sublayer.timeLayerManifest?.at(-1)?.upperBound).join(" ")}
          </div>
        </div>
      )}
    </div>
  );
};

export default Info_subpanel;
