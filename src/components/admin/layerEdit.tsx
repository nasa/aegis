import { forwardRef, useEffect, useImperativeHandle, useState, type ForwardedRef } from "react";
import styles from "./admin.module.css";
import { upsertLayers } from "http-client/layer";
import { getAccurateNow } from "utils/formatting";

export type LayerEditHandle = { save: () => Promise<boolean> };

/** Render a single Layer record from the DB */
function LayerEditInner(
  props: { layer: Layer; refreshLayerList: Function },
  ref: ForwardedRef<LayerEditHandle>
) {
  const [layer, setLayer] = useState<Layer>(props.layer);

  useEffect(() => {
    setLayer(props.layer);
  }, [props.layer]);

  useImperativeHandle(
    ref,
    () => ({
      save: async (): Promise<boolean> => {
        const res: WrappedResponse<Layer[]> = await upsertLayers([
          { ...layer, updatedAt: getAccurateNow().toISOString() },
        ]);
        props.refreshLayerList();
        alert(`${res.status} - ${res.message}`);
        return true;
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layer]
  );

  return (
    layer && (
      <div className={styles.sectionDiv}>
        <div className={styles.sublayerFieldGrid}>
          <div id="readOnlyDiv" className={styles.divIndent}>
            UUID: {layer.uuid}
          </div>

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
        </div>
      </div>
    )
  );
}

const LayerEdit = forwardRef<LayerEditHandle, { layer: Layer; refreshLayerList: Function }>(
  LayerEditInner
);

export default LayerEdit;
