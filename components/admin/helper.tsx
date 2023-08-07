import { FunctionComponent, useEffect, useState } from "react";
import styles from "./admin.module.css";
import { v4 as uuidv4 } from "uuid";

/**
 * Creates a new emptyLayer object with no mission and no sublayers
 * @returns A new Layer object with required properties
 */
export function createNewLayer(missionId?: number): Layer {
  return {
    uuid: null,
    missionId: missionId || null,
    name: "",
    createdAt: null,
    updatedAt: null,
  };
}

/**
 * Creates a new empty sublayer
 * @returns A new Sublayer object with required properties
 */
export function createNewSublayer(layerUuid?: string, missionId?: number): Sublayer {
  const sublayer: Sublayer = {
    uuid: uuidv4(),
    missionId: missionId || null,
    layerUuid: layerUuid || null,
    name: "",
    description: "",
    url: "",
    type: null,
    filePath: "",
    boundingBox: null,
    tileFormat: null,
    minZoom: 0,
    maxNativeZoom: 0,
    maxZoom: 0,
    color: "",
    opacity: 0,
    fillColor: "",
    fillOpacity: 0,
    weight: 0,
    createdAt: null,
    updatedAt: null,
  };
  return sublayer;
}

/**
 * A generic JSON Editor component with built in validation message
 * @param props fieldName: name of the label for the JSON editor.
 * @returns
 */
export const JSONEditor: FunctionComponent<{
  fieldName: string;
  value: JSON;
  onChange: (jsonValue: JSON) => void;
}> = (props: { fieldName: string; value: JSON; onChange: (jsonValue: JSON) => void }) => {
  const [jsonValidMsg, setJsonValidMsg] = useState("");
  const [jsonString, setJsonString] = useState<string>();

  useEffect(() => {
    setJsonValidMsg("");
    const json = JSON.stringify(props.value);
    if (json) {
      setJsonString(json);
    } else {
      setJsonString("");
    }
  }, [props.value]);

  return (
    <>
      <div className={styles.editDiv}>
        <label htmlFor="jsonField">{props.fieldName}</label>
      </div>
      <div className={styles.editDiv}>
        <textarea
          id="jsonField"
          onChange={(e) => {
            setJsonString(e.target.value);
            setJsonValidMsg("");
            if (e.target.value === "") {
              props.onChange(undefined);
            } else {
              try {
                props.onChange(JSON.parse(e.target.value));
              } catch (e) {
                setJsonValidMsg("Invalid JSON");
              }
            }
          }}
          value={jsonString}
          title={props.fieldName}
        />
        <br />
        <span className={styles.validation}>{jsonValidMsg}</span>
      </div>
    </>
  );
};
