import { FunctionComponent, useEffect, useState } from "react";
import styles from "./_right_settings_panel.module.css";
import paneStyles from "../global_pane_styles.module.css";
import { Dropdown } from "components/interface/_global_elements";
import { RootState } from "store";
import { useSelector, useDispatch } from "react-redux";
import { setLayerControlOpacity } from "store/map";

const Settings_panel: FunctionComponent = () => {
  // const [opacity, setOpacity] = useState(0);
  const [contrast, setContrast] = useState(0);
  const [brightness, setBrightness] = useState(0);
  const [saturation, setSaturation] = useState(0);
  const [blend, setBlend] = useState("normal");

  const dispatch = useDispatch();
  const activeLayerName = useSelector((state: RootState) => state.map.activeLayerName);
  const opacity = useSelector((state: RootState) =>
    Math.round(state.map.layerControls[activeLayerName].opacity * 100)
  );

  const setOpacity = (value: number) => {
    dispatch(setLayerControlOpacity({ layerName: activeLayerName, opacity: value / 100 }));
  };

  useEffect(() => {});

  return (
    <div className={paneStyles.rightBody}>
      <div className={paneStyles.title}>Settings</div>
      <div className={paneStyles.panelContainer}>
        <div className={paneStyles.subTitle}>Image Adjustments</div>
        <div className={styles.listItem}>
          <div className={styles.listItemText}>Opacity</div>

          <div className={styles.listItemSlider}>
            <div className={styles.listItemPercentage}>{opacity}%</div>
            <input
              type="range"
              min="0"
              max="100"
              name={"opacity"}
              defaultValue={opacity}
              className={styles.slider}
              onChange={(e) => {
                setOpacity(parseInt(e.target.value));
              }}
            />
          </div>
        </div>
        <div className={styles.listItem}>
          <div className={styles.listItemText}>Contrast</div>
          <div className={styles.listItemSlider}>
            <div className={styles.listItemPercentage}>{contrast}%</div>
            <input
              type="range"
              min="0"
              max="100"
              name={"contrast"}
              defaultValue={contrast}
              className={styles.slider}
              onChange={(e) => {
                setContrast(parseInt(e.target.value));
              }}
            />
          </div>
        </div>
        <div className={styles.listItem}>
          <div className={styles.listItemText}>Brightness</div>
          <div className={styles.listItemSlider}>
            <div className={styles.listItemPercentage}>{brightness}%</div>
            <input
              type="range"
              min="0"
              max="100"
              name={"brightness"}
              defaultValue={brightness}
              className={styles.slider}
              onChange={(e) => {
                setBrightness(parseInt(e.target.value));
              }}
            />
          </div>
        </div>
        <div className={styles.listItem}>
          <div className={styles.listItemText}>Saturation</div>
          <div className={styles.listItemSlider}>
            <div className={styles.listItemPercentage}>{saturation}%</div>
            <input
              type="range"
              min="0"
              max="100"
              name={"saturation"}
              onChange={(e) => {
                setSaturation(parseInt(e.target.value));
              }}
              defaultValue={saturation}
              className={styles.slider}
            />
          </div>
        </div>
        <div className={styles.listItem}>
          <div className={styles.listItemText}>Blend</div>
          <Dropdown
            options={[
              { name: "Normal", value: "normal" },
              { name: "Multiply", value: "multiply" },
              { name: "Screen", value: "screen" },
              { name: "Overlay", value: "overlay" },
              { name: "Darken", value: "darken" },
              { name: "Lighten", value: "lighten" },
              { name: "Color Dodge", value: "color-dodge" },
              { name: "Color Burn", value: "color-burn" },
              { name: "Hard Light", value: "hard-light" },
              { name: "Soft Light", value: "soft-light" },
              { name: "Difference", value: "difference" },
              { name: "Exclusion", value: "exclusion" },
              { name: "Hue", value: "hue" },
              { name: "Saturation", value: "saturation" },
              { name: "Color", value: "color" },
              { name: "Luminosity", value: "luminosity" },
            ]}
            selected={blend}
            onChange={(value) => {
              setBlend(value);
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default Settings_panel;
