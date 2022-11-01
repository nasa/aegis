import { FunctionComponent, useEffect, useState } from "react";
import styles from "./settings_panel.module.css";
import { library } from "@fortawesome/fontawesome-svg-core";
import { faChevronDown, faPlus, faGear } from "@fortawesome/free-solid-svg-icons";
library.add(faChevronDown, faPlus, faGear);

const Settings_panel: FunctionComponent = () => {
  const [opacity, setOpacity] = useState(0);
  const [contrast, setContrast] = useState(0);
  const [brightness, setBrightness] = useState(0);
  const [saturation, setSaturation] = useState(0);
  const [blend, setBlend] = useState("normal");

  useEffect(() => {});

  return (
    <div className={styles.panelContainer}>
      <div className={styles.panelHeader}>
        <h3 className={styles.panelHeaderText}>Settings</h3>
      </div>
      <div className={styles.panelBody}>
        <h4 className={styles.h4}>Image Adjustments</h4>
        <div className={styles.listItem}>
          <div className={styles.listItemText}>Opacity</div>
          <div className={styles.listItemSlider}>
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
          <div className={styles.listItemSlider}>
            <select
              className={styles.select}
              defaultValue={blend}
              name={"blend"}
              onChange={(e) => {
                setBlend(e.target.value);
              }}
            >
              <option value="normal">Normal</option>
              <option value="multiply">Multiply</option>
              <option value="screen">Screen</option>
              <option value="overlay">Overlay</option>
              <option value="darken">Darken</option>
              <option value="lighten">Lighten</option>
              <option value="color-dodge">Color Dodge</option>
              <option value="color-burn">Color Burn</option>
              <option value="hard-light">Hard Light</option>
              <option value="soft-light">Soft Light</option>
              <option value="difference">Difference</option>
              <option value="exclusion">Exclusion</option>
              <option value="hue">Hue</option>
              <option value="saturation">Saturation</option>
              <option value="color">Color</option>
              <option value="luminosity">Luminosity</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings_panel;
