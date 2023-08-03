import { FunctionComponent, useEffect, useState } from "react";
import styles from "./admin.module.css";
import { upsertLayer } from "http-client/layer";

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
    const res: WrappedResponse<Layer> = await upsertLayer(layer);
    props.refreshLayerList();
    alert(`${res.status} - ${res.message}`);
  }

  return (
    layer && (
      <>
        {layer.name ? (
          <h3>Edit Header Layer &quot;{layer.name}&quot;</h3>
        ) : (
          <h3>Edit Header Layer</h3>
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
      </>
    )
  );
};

export default LayerEdit;
