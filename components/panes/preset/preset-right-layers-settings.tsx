import { FunctionComponent } from "react";
import styles from "./preset-right-layers-settings.module.css";
import { useDispatch } from "react-redux";
import { setPresetLayerControlStyle } from "store/preset";
import getPercentOrDefault from "utils/getPercentOrDefault";
import { CompactPicker } from "react-color";

const Slider: FunctionComponent<{
  display: string;
  name: string;
  value: number;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  min?: number;
  max?: number;
  unit?: string;
}> = ({ display, name, value, onChange, min = 0, max = 100, unit = `%` }) => {
  return (
    <div className={styles.listItem}>
      <div className={styles.listItemText}>{display}</div>
      <div className={styles.listItemSlider}>
        <div className={styles.listItemPercentage}>
          {value}
          {unit}
        </div>
        <input
          type="range"
          min={min}
          max={max}
          name={name}
          data-tooltip-id="aegis-tooltip"
          data-tooltip-html={name}
          aria-label={name}
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

  //default setting options to show
  let showSliders = {
    opacity: true,
    contrast: true,
    brightness: true,
    saturation: true,
    blendMode: true,
    colorPicker: false,
    weight: false,
    fillOpacity: false,
  };

  if (sublayer.type === "vector") {
    showSliders = {
      opacity: true,
      contrast: false,
      brightness: false,
      saturation: false,
      blendMode: false,
      colorPicker: true,
      weight: true,
      fillOpacity: true,
    };
  }

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
  // const setBlendMode = (value: string) => {
  //   dispatch(
  //     setPresetLayerControlStyle({
  //       presetUuid: selectedPreset.uuid,
  //       layerName: sublayer.name,
  //       style: { ...presetLayerStyle, blendMode: value },
  //     })
  //   );
  // };
  const setColor = (value: string) => {
    dispatch(
      setPresetLayerControlStyle({
        presetUuid: selectedPreset.uuid,
        layerName: sublayer.name,
        style: { ...presetLayerStyle, color: value },
      })
    );
  };
  const setWeight = (value: number) => {
    dispatch(
      setPresetLayerControlStyle({
        presetUuid: selectedPreset.uuid,
        layerName: sublayer.name,
        style: { ...presetLayerStyle, weight: value },
      })
    );
  };
  const setFillOpacity = (value: number) => {
    const newVal = value / 100;
    dispatch(
      setPresetLayerControlStyle({
        presetUuid: selectedPreset.uuid,
        layerName: sublayer.name,
        style: { ...presetLayerStyle, fillOpacity: newVal },
      })
    );
  };

  return (
    <div className={styles.slidersContainer}>
      <div className={styles.sliderTitle}>Display Adjustments</div>
      {showSliders.opacity && (
        <Slider
          display={sublayer.type === "vector" ? "Stroke Opacity" : "Opacity"}
          name="opacity"
          value={getPercentOrDefault(presetLayerStyle?.opacity)}
          onChange={(e) => setOpacity(Number(e.target.value))}
        />
      )}
      {showSliders.contrast && (
        <Slider
          display="Contrast"
          name="contrast"
          value={getPercentOrDefault(presetLayerStyle?.contrast)}
          onChange={(e) => setContrast(Number(e.target.value))}
        />
      )}
      {showSliders.brightness && (
        <Slider
          display="Brightness"
          name="brightness"
          value={getPercentOrDefault(presetLayerStyle?.brightness)}
          onChange={(e) => setBrightness(Number(e.target.value))}
        />
      )}
      {showSliders.saturation && (
        <Slider
          display="Saturation"
          name="saturation"
          value={getPercentOrDefault(presetLayerStyle?.saturation)}
          onChange={(e) => setSaturation(Number(e.target.value))}
        />
      )}
      {/* {showSliders.blendMode && (
        <div className={styles.listItem}>
          <div className={styles.listItemText}>Blend</div>
          <div className={styles.listItemControl}>
            <Dropdown
              selected={presetLayerStyle?.blendMode ? presetLayerStyle?.blendMode : "normal"}
              arrowStyle={{ top: "1px" }}
              onChange={(value) => {
                setBlendMode(value);
              }}
              toolTip="Blend Mode"
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
      )} */}
      {showSliders.colorPicker && (
        <div className={styles.listItem}>
          <div className={styles.listItemText}>Stroke Color</div>
          <div className={styles.listItemControl}>
            <CompactPicker
              color={presetLayerStyle?.color}
              onChangeComplete={(color) => setColor(color.hex)}
            />
          </div>
        </div>
      )}
      {showSliders.weight && (
        <Slider
          display="Stroke Weight"
          name="weight"
          value={presetLayerStyle?.weight}
          onChange={(e) => setWeight(Number(e.target.value))}
          min={1}
          max={5}
          unit={"px"}
        />
      )}
      {showSliders.fillOpacity && (
        <Slider
          display="Fill Opacity"
          name="fillOpacity"
          value={getPercentOrDefault(presetLayerStyle?.fillOpacity)}
          onChange={(e) => setFillOpacity(Number(e.target.value))}
        />
      )}
    </div>
  );
};

export default Settings_subpanel;
