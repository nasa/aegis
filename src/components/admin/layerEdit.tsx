import { FunctionComponent, useEffect, useState } from "react";
import styles from "./admin.module.css";
import { upsertLayers } from "http-client/layer";
import { getAccurateNow } from "utils/formatting";

/** Render a single Layer record from the DB */
const LayerEdit: FunctionComponent<{ layer: Layer; refreshLayerList: Function }> = (props: {
  layer: Layer;
  refreshLayerList: Function;
}) => {
  const [layer, setLayer] = useState<Layer>(props.layer);

  useEffect(() => {
    setLayer(props.layer);
  }, [props.layer]);

  //save the current editing layer to db
  async function saveLayer() {
    const res: WrappedResponse<Layer[]> = await upsertLayers([
      {
        ...layer,
        updatedAt: getAccurateNow().toISOString(),
      },
    ]);
    props.refreshLayerList();
    alert(`${res.status} - ${res.message}`);
  }

  return (
    layer && (
      <div className={styles.sectionDiv}>
        {layer.name ? (
          <div className={styles.sectionDivHeading}>Edit Header Layer &quot;{layer.name}&quot;</div>
        ) : (
          <div className={styles.sectionDivHeading}>Edit Header Layer</div>
        )}

        <div id="readOnlyDiv" className={styles.divIndent}>
          UUID: {layer.uuid}
          <br />
          MissionId: {layer.missionId}
          <br />
        </div>
        <br />

        <div id="nameDiv">
          <div className={styles.editDiv}>
            <label htmlFor="name">Header Layer Name</label>
          </div>
          <div className={styles.editDiv}>
            <input
              id="name"
              type="text"
              onChange={(e) => {
                setLayer({ ...layer, name: e.target.value });
              }}
              value={layer.name}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            saveLayer();
          }}
        >
          Save Header Layer
        </button>
      </div>
    )
  );
};

export default LayerEdit;
