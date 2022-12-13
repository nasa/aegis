import { Dispatch, SetStateAction, FunctionComponent } from "react";
import styles from "./admin.module.css";

interface LayerProps {
  layerConfig?: MMGIS_LayerConfig;
  setLayerConfig: Dispatch<SetStateAction<MMGIS_LayerConfig>>;
  sublayer?: MMGIS_Sublayer;
  setSublayer: Dispatch<SetStateAction<MMGIS_Sublayer>>;
}

/** Render a single Layer record from the DB */
const LayerEdit: FunctionComponent<LayerProps> = (props: LayerProps) => {
  // const [viewSettings, setViewSettings] = useState([]);

  return (
    <>
      <div id="nameDiv">
        <div className={styles.editDiv}>
          <label htmlFor="name">Layer Name</label>
        </div>
        <div className={styles.editDiv}>
          <input
            id="name"
            type="text"
            onChange={(e) => {
              console.log(e.target.value);
            }}
            value={props.sublayer.name}
          />
        </div>
      </div>
      <h5>Style</h5>
      <h5>Query Config</h5>
      <h5>Model Position</h5>
      <h5>ModelRotation</h5>
    </>
  );
};

/** Sublayer component */
// const SubLayer = (props: { sublayer: Sublayer }) => {
//   return (
//     <>
//       <div id="nameDiv">
//         <div className={styles.editDiv}>
//           <label htmlFor="sublayer_name">SubLayer Name</label>
//         </div>
//         <div className={styles.editDiv}>
//           <input id="sublayer_name" type="text" onChange={(e) => {}} value={props.sublayer.name} />
//         </div>
//       </div>
//     </>
//   );
// };

//Layer select component.
// const LayerSelect = (props: {
//   layers: Layer[];
//   setSelectedLayer: (uuid: string) => void;
//   // delSTM: (uuid: string, stmType: string) => void;
// }) => {
//   const [selectedUUID, setSelectedUUID] = useState("0");
//   const [disableDelete, setDisableDelete] = useState(true);

//   const parentSelectUUID = props.setSelectedLayer;

//   //set default selected uuid
//   useEffect(() => {
//     if (props.layers?.length > 0) {
//       setSelectedUUID(props.layers[0].uuid);
//       setDisableDelete(false);
//     } else {
//       setDisableDelete(true);
//     }
//   }, [props.layers]);

//   //propagate selected uuid up to the parent component
//   useEffect(() => {
//     parentSelectUUID(selectedUUID);
//   }, [selectedUUID, parentSelectUUID]);

//   return (
//     <>
//       <label htmlFor="layerSelect" className={styles.selectLabel}>
//         Select Layer
//       </label>
//       <select
//         id="layerSelect"
//         onChange={(e) => setSelectedUUID(e.target.value)}
//         value={selectedUUID}
//         className={styles.selectField}
//       >
//         {props.layers.map((layer: Layer) => {
//           return (
//             <option key={layer.uuid} value={layer.uuid}>
//               {`${layer.layerConfig.name}`}
//             </option>
//           );
//         })}
//       </select>
//       &nbsp;
//       <button
//         type="button"
//         onClick={() => {
//           // props.delSTM(selectedUUID, "Objective");
//         }}
//         disabled={disableDelete}
//       >
//         Delete Layer
//       </button>
//     </>
//   );
// };

export default LayerEdit;
