import { FunctionComponent, useEffect } from "react";
import styles from "./map-right-settings-panel.module.css";
import paneStyles from "../global-pane-styles.module.css";
import { Dropdown } from "components/interface/_global-elements";
import { RootState } from "store";
import { useSelector, useDispatch } from "react-redux";
import { setLayerControlStyle } from "store/map";

const Settings_panel: FunctionComponent = () => {
  const dispatch = useDispatch();
  const activeLayerName = useSelector((state: RootState) => state.map.activeLayerName);
  const layerStyle = useSelector(
    (state: RootState) => state.map.layerControls[activeLayerName].style
  );

  const setOpacity = (value: number) => {
    const newVal = value / 100;
    dispatch(
      setLayerControlStyle({
        layerName: activeLayerName,
        style: { ...layerStyle, opacity: newVal },
      })
    );
  };
  const setContrast = (value: number) => {
    const newVal = value / 100;
    dispatch(
      setLayerControlStyle({
        layerName: activeLayerName,
        style: { ...layerStyle, contrast: newVal },
      })
    );
  };
  const setBrightness = (value: number) => {
    const newVal = value / 100;
    dispatch(
      setLayerControlStyle({
        layerName: activeLayerName,
        style: { ...layerStyle, brightness: newVal },
      })
    );
  };
  const setSaturation = (value: number) => {
    const newVal = value / 100;
    dispatch(
      setLayerControlStyle({
        layerName: activeLayerName,
        style: { ...layerStyle, saturation: newVal },
      })
    );
  };
  const setBlendMode = (value: string) => {
    dispatch(
      setLayerControlStyle({
        layerName: activeLayerName,
        style: { ...layerStyle, blendMode: value },
      })
    );
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
            <div className={styles.listItemPercentage}>
              {layerStyle?.opacity ? Math.round(layerStyle?.opacity * 100) : 100}%
            </div>
            <input
              type="range"
              min="0"
              max="100"
              name={"opacity"}
              defaultValue={layerStyle?.opacity ? Math.round(layerStyle?.opacity * 100) : 100}
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
            <div className={styles.listItemPercentage}>
              {layerStyle?.contrast ? Math.round(layerStyle?.contrast * 100) : 100}%
            </div>
            <input
              type="range"
              min="0"
              max="100"
              name={"contrast"}
              defaultValue={layerStyle?.contrast ? Math.round(layerStyle?.contrast * 100) : 100}
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
            <div className={styles.listItemPercentage}>
              {layerStyle?.brightness ? Math.round(layerStyle?.brightness * 100) : 100}%
            </div>
            <input
              type="range"
              min="0"
              max="100"
              name={"brightness"}
              defaultValue={layerStyle?.brightness ? Math.round(layerStyle?.brightness * 100) : 100}
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
            <div className={styles.listItemPercentage}>
              {layerStyle?.saturation ? Math.round(layerStyle?.saturation * 100) : 100}%
            </div>
            <input
              type="range"
              min="0"
              max="100"
              name={"saturation"}
              onChange={(e) => {
                setSaturation(parseInt(e.target.value));
              }}
              defaultValue={layerStyle?.saturation ? Math.round(layerStyle?.saturation * 100) : 100}
              className={styles.slider}
            />
          </div>
        </div>
        <div className={styles.listItem}>
          <div className={styles.listItemText}>Blend</div>
          <Dropdown
            selected={layerStyle?.blendMode ? layerStyle?.blendMode : "normal"}
            onChange={(value) => {
              setBlendMode(value);
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
          </Dropdown>
        </div>
      </div>
    </div>
  );
};

export default Settings_panel;
