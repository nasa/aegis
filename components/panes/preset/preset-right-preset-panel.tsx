import { FunctionComponent } from "react";
import paneStyles from "../global-pane-styles.module.css";
import { library } from "@fortawesome/fontawesome-svg-core";
import { faChevronDown, faPlus, faGear } from "@fortawesome/free-solid-svg-icons";
library.add(faChevronDown, faPlus, faGear);

const Info_Panel: FunctionComponent = () => {
  return (
    <div className={paneStyles.rightBody}>
      <div className={paneStyles.rightBodyTitle}>Preset Information</div>
      <div className={paneStyles.panelContainer}>
        <div className={paneStyles.bodyText}>
          <p>
            Terrain Difficulty is a combination of Slope and TRI at 1m/1pixel...lorem ipsum dolor
            sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et
            dolore magna aliqua.
          </p>
          <p>
            Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea
            commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum
            dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in
            culpa qui officia deserunt mollit anim id est laborum.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Info_Panel;

{
  /* <DetailedSettings
        missionState={missionState}
        layerControls={layerControls}
        expandedSections={expandedSections}
        setExpandedSections={setExpandedSections}
      /> */
}

// const DetailedSettings: FunctionComponent<{
//   missionState: MissionState;
//   layerControls: LayerControls;
//   expandedSections: MapExpandedSections;
//   setExpandedSections: any;
// }> = ({ missionState, layerControls, expandedSections, setExpandedSections }) => {
//   const dispatch = useDispatch();
//   const [layerHover, setLayerHover] = useState<string | null>(null);
//   const activeLayerName = useSelector((state: RootState) => state.map.activeSelectedName);

//   return (
//     <div className={paneStyles.panelContainer}>
//       <div className={styles.layersContainer}>
//         <div
//           className={styles.layersHeader}
//           onClick={() =>
//             setExpandedSections({ ...expandedSections, details: !expandedSections.details })
//           }
//         >
//           <div className={styles.expandoCaret}>
//             {expandedSections.details ? (
//               <FontAwesomeIcon icon={faCaretDown} size="sm" />
//             ) : (
//               <FontAwesomeIcon icon={faCaretRight} size="sm" />
//             )}
//           </div>
//           <div>Imagery Details & Settings</div>
//         </div>
//         <div className={styles.layersBody}>
//           {missionState && layerControls && expandedSections.details ? (
//             missionState?.layers.map((layer: Layer) => {
//               return (
//                 <div className={styles.layerGroup} key={layer.layerConfig.name}>
//                   <div className={styles.layer}>
//                     <div
//                       className={styles.expandoCaret}
//                       onClick={() => dispatch(toggleLayerControlExpanded(layer.layerConfig.name))}
//                     >
//                       {layerControls &&
//                         (layerControls[layer.layerConfig.name].expanded ? (
//                           <FontAwesomeIcon icon={faCaretDown} size="sm" />
//                         ) : (
//                           <FontAwesomeIcon icon={faCaretRight} size="sm" />
//                         ))}
//                     </div>
//                     <div className={styles.layerName}>{layer.layerConfig.name}</div>
//                   </div>
//                   <div className={styles.layerSublayers}>
//                     {layerControls &&
//                       layerControls[layer.layerConfig.name].expanded &&
//                       layer.layerConfig.sublayers &&
//                       layer.layerConfig.sublayers.map((sublayer: MMGIS_Sublayer) => {
//                         const selectedStyle =
//                           sublayer.name === activeLayerName ? styles.presetItemSelected : null;
//                         return (
//                           <div
//                             key={`sub_${sublayer.name}`}
//                             className={`${styles.presetItem} ${selectedStyle}`}
//                             onMouseOver={() => {
//                               setLayerHover(sublayer.name);
//                             }}
//                             onMouseOut={() => {
//                               setLayerHover(null);
//                             }}
//                           >
//                             <Visibility
//                               visible={layerControls[sublayer.name].enabled}
//                               onClick={() => {
//                                 dispatch(toggleLayerControlEnabled(sublayer.name));
//                                 dispatch(setActiveSelectedUUID(layer.uuid));
//                               }}
//                             />
//                             <div
//                               className={styles.sublayerTitle}
//                               onClick={() => {
//                                 dispatch(setActiveSelectedName(sublayer.name));
//                                 dispatch(setActiveSelectedUUID(layer.uuid));
//                                 dispatch(setActiveSelectedType("layer"));
//                                 dispatch(setSelectedRightNavItem("settings_panel"));
//                               }}
//                             >
//                               {sublayer.name} ({sublayer.type})
//                             </div>
//                             {layerHover === sublayer.name && (
//                               <div className={styles.sublayerToolIcons}>
//                                 <div
//                                   className={styles.sublayerToolIcon}
//                                   onClick={() => {
//                                     dispatch(setActiveSelectedName(sublayer.name));
//                                     dispatch(setActiveSelectedUUID(layer.uuid));
//                                     dispatch(setActiveSelectedType("layer"));
//                                     dispatch(setSelectedRightNavItem("information_panel"));
//                                   }}
//                                 >
//                                   <FontAwesomeIcon icon={faCircleInfo} />
//                                 </div>
//                                 <div
//                                   className={styles.sublayerToolIcon}
//                                   onClick={() => {
//                                     dispatch(setActiveSelectedName(sublayer.name));
//                                     dispatch(setActiveSelectedUUID(layer.uuid));
//                                     dispatch(setActiveSelectedType("layer"));
//                                     dispatch(setSelectedRightNavItem("settings_panel"));
//                                   }}
//                                 >
//                                   <FontAwesomeIcon icon={faSliders} />
//                                 </div>
//                               </div>
//                             )}
//                           </div>
//                         );
//                       })}
//                   </div>
//                 </div>
//               );
//             })
//           ) : (
//             <div>
//               {/* <FontAwesomeIcon icon={faCircleNotch} spin />
//               &nbsp; Loading... */}
//             </div>
//           )}
//         </div>
//       </div>
//     </div>
//   );
// };

// const Visibility: FunctionComponent<{
//   visible: boolean;
//   onClick: MouseEventHandler<HTMLDivElement>;
// }> = ({ visible, onClick }) => {
//   return (
//     <div className={styles.visibility} onClick={onClick}>
//       {visible ? (
//         <div className={styles.visible}>
//           <FontAwesomeIcon icon={faEye} size="xs" />
//         </div>
//       ) : (
//         <div className={styles.inVisible}>
//           <FontAwesomeIcon icon={faEyeSlash} size="xs" />
//         </div>
//       )}
//     </div>
//   );
// };
