import { FunctionComponent } from "react";
import styles from "./preset-right-layers-settings.module.css";
import { Dropdown } from "components/interface/_global-elements";
import { useDispatch } from "react-redux";
import { setPresetLayerControlStyle } from "store/preset";
import getPercentOrDefault from "utils/getPercentOrDefault";

const Slider: FunctionComponent<{
  display: string;
  name: string;
  value: number;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  min?: number;
  max?: number;
}> = ({ display, name, value, onChange, min = 0, max = 100 }) => {
  return (
    <div className={styles.listItem}>
      <div className={styles.listItemText}>{display}</div>
      <div className={styles.listItemSlider}>
        <div className={styles.listItemPercentage}>{value}%</div>
        <input
          type="range"
          min={min}
          max={max}
          name={name}
          title={name}
          defaultValue={value}
          className={styles.slider}
          onChange={onChange}
        />
      </div>
    </div>
  );
};

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
      <Slider
        display="Opacity"
        name="opacity"
        value={getPercentOrDefault(presetLayerStyle?.opacity)}
        onChange={(e) => setOpacity(Number(e.target.value))}
      />
      <Slider
        display="Contrast"
        name="contrast"
        value={getPercentOrDefault(presetLayerStyle?.contrast)}
        onChange={(e) => setContrast(Number(e.target.value))}
      />
      <Slider
        display="Brightness"
        name="brightness"
        value={getPercentOrDefault(presetLayerStyle?.brightness)}
        onChange={(e) => setBrightness(Number(e.target.value))}
      />
      <Slider
        display="Saturation"
        name="saturation"
        value={getPercentOrDefault(presetLayerStyle?.saturation)}
        onChange={(e) => setSaturation(Number(e.target.value))}
      />
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
