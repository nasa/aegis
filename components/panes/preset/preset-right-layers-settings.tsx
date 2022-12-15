import { FunctionComponent } from "react";
import styles from "./preset-right-layers-settings.module.css";
import { Dropdown } from "components/interface/_global-elements";
import { useDispatch } from "react-redux";
import { setPresetLayerControlStyle } from "store/preset";

const Settings_subpanel: FunctionComponent<{
  sublayer: MMGIS_Sublayer;
  selectedPreset: Preset;
}> = ({ sublayer, selectedPreset }) => {
  const dispatch = useDispatch();

  const presetLayerStyle = selectedPreset.layerControls[sublayer.name].style;

  const setOpacity = (value: number) => {
    const newVal = value / 100;
    dispatch(
      setPresetLayerControlStyle({
        presetUuid: selectedPreset.uuid,
        layerName: sublayer.name,
        style: { ...presetLayerStyle, opacity: newVal },
      })
    );
  };
  const setContrast = (value: number) => {
    const newVal = value / 100;
    dispatch(
      setPresetLayerControlStyle({
        presetUuid: selectedPreset.uuid,
        layerName: sublayer.name,
        style: { ...presetLayerStyle, contrast: newVal },
      })
    );
  };
  const setBrightness = (value: number) => {
    const newVal = value / 100;
    dispatch(
      setPresetLayerControlStyle({
        presetUuid: selectedPreset.uuid,
        layerName: sublayer.name,
        style: { ...presetLayerStyle, brightness: newVal },
      })
    );
  };
  const setSaturation = (value: number) => {
    const newVal = value / 100;
    dispatch(
      setPresetLayerControlStyle({
        presetUuid: selectedPreset.uuid,
        layerName: sublayer.name,
        style: { ...presetLayerStyle, saturation: newVal },
      })
    );
  };
  const setBlendMode = (value: string) => {
    dispatch(
      setPresetLayerControlStyle({
        presetUuid: selectedPreset.uuid,
        layerName: sublayer.name,
        style: { ...presetLayerStyle, blendMode: value },
      })
    );
  };

  return (
    <div className={styles.slidersContainer}>
      <div className={styles.sliderTitle}>Display Adjustments</div>
      <div className={styles.listItem}>
        <div className={styles.listItemText}>Opacity</div>

        <div className={styles.listItemSlider}>
          <div className={styles.listItemPercentage}>
            {presetLayerStyle?.opacity ? Math.round(presetLayerStyle?.opacity * 100) : 100}%
          </div>
          <input
            type="range"
            min="0"
            max="100"
            name={"opacity"}
            defaultValue={
              presetLayerStyle?.opacity ? Math.round(presetLayerStyle?.opacity * 100) : 100
            }
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
            {presetLayerStyle?.contrast ? Math.round(presetLayerStyle?.contrast * 100) : 100}%
          </div>
          <input
            type="range"
            min="0"
            max="100"
            name={"contrast"}
            defaultValue={
              presetLayerStyle?.contrast ? Math.round(presetLayerStyle?.contrast * 100) : 100
            }
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
            {presetLayerStyle?.brightness ? Math.round(presetLayerStyle?.brightness * 100) : 100}%
          </div>
          <input
            type="range"
            min="0"
            max="100"
            name={"brightness"}
            defaultValue={
              presetLayerStyle?.brightness ? Math.round(presetLayerStyle?.brightness * 100) : 100
            }
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
            {presetLayerStyle?.saturation ? Math.round(presetLayerStyle?.saturation * 100) : 100}%
          </div>
          <input
            type="range"
            min="0"
            max="100"
            name={"saturation"}
            onChange={(e) => {
              setSaturation(parseInt(e.target.value));
            }}
            defaultValue={
              presetLayerStyle?.saturation ? Math.round(presetLayerStyle?.saturation * 100) : 100
            }
            className={styles.slider}
          />
        </div>
      </div>
      <div className={styles.listItem}>
        <div className={styles.listItemText}>Blend</div>
        <Dropdown
          selected={presetLayerStyle?.blendMode ? presetLayerStyle?.blendMode : "normal"}
          arrowStyle={{ top: "1px" }}
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
  );
};

export default Settings_subpanel;
