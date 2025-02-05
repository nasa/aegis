import { FunctionComponent } from "react";
import styles from "./settings-and-slider.module.css";
import { Dropdown } from "components/interface/form/globalFields";

import { getPercentOrDefault } from "utils/formatting";
import CompactColor from "@uiw/react-color-compact";

const Settings_subpanel: FunctionComponent<{
  type: "vector" | "circle" | "vector-tile" | "tile";
  uuid: string;
  styleSetter: ({ uuid, layerStyle }: { uuid: string; layerStyle: MapSublayerStyle }) => void;
  mapCircleControls?: MapCircleControls;
  mapSublayerControls?: MapSublayerControls;
}> = ({ type, uuid, styleSetter, mapCircleControls, mapSublayerControls }) => {
  mapCircleControls = mapCircleControls || {};
  mapSublayerControls = mapSublayerControls || {};

  const layerStyle =
    type === "circle" ? mapCircleControls[uuid]?.style : mapSublayerControls[uuid]?.style;

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

  if (type === "vector") {
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
  } else if (type === "circle") {
    showSliders = {
      opacity: true,
      contrast: false,
      brightness: false,
      saturation: false,
      blendMode: false,
      colorPicker: true,
      weight: true,
      fillOpacity: false,
    };
  } else if (type === "vector-tile") {
    showSliders = {
      opacity: true,
      contrast: false,
      brightness: false,
      saturation: false,
      blendMode: false,
      colorPicker: true,
      weight: true,
      fillOpacity: false,
    };
  }

  const setStyle = (value: number | string, property: MapSublayerStyleKeys) => {
    styleSetter({
      uuid,
      layerStyle: { ...layerStyle, [property]: value },
    });
  };

  return (
    <div className={styles.slidersContainer}>
      <div className={styles.sliderTitle}>Display Adjustments</div>
      {showSliders.opacity && (
        <Slider
          display={type === "vector" ? "Stroke Opacity" : "Opacity"}
          name="opacity"
          value={getPercentOrDefault(layerStyle?.opacity)}
          onChange={(e) => setStyle(Number(e.target.value) / 100, "opacity")}
        />
      )}
      {showSliders.contrast && (
        <Slider
          display="Contrast"
          name="contrast"
          value={getPercentOrDefault(layerStyle?.contrast)}
          onChange={(e) => setStyle(Number(e.target.value) / 100, "contrast")}
        />
      )}
      {showSliders.brightness && (
        <Slider
          display="Brightness"
          name="brightness"
          value={getPercentOrDefault(layerStyle?.brightness)}
          onChange={(e) => setStyle(Number(e.target.value) / 100, "brightness")}
        />
      )}
      {showSliders.saturation && (
        <Slider
          display="Saturation"
          name="saturation"
          value={getPercentOrDefault(layerStyle?.saturation)}
          onChange={(e) => setStyle(Number(e.target.value) / 100, "saturation")}
        />
      )}
      {showSliders.blendMode && (
        <div className={styles.listItem}>
          <div className={styles.listItemText}>Blend</div>
          <div className={styles.listItemControl}>
            <Dropdown
              selected={layerStyle?.blendMode ? layerStyle?.blendMode : "normal"}
              arrowStyle={{ top: "1px" }}
              onChange={(value) => {
                setStyle(value, "blendMode");
              }}
              toolTip="Blend Mode"
            >
              <option value="normal">Normal</option>
              <option value="color">Color</option>
              <option value="color-burn">Color Burn</option>
              <option value="color-dodge">Color Dodge</option>
              <option value="darken">Darken</option>
              <option value="difference">Difference</option>
              <option value="exclusion">Exclusion</option>
              <option value="hard-light">Hard Light</option>
              <option value="hue">Hue</option>
              <option value="lighten">Lighten</option>
              <option value="luminosity">Luminosity</option>
              <option value="multiply">Multiply</option>
              <option value="overlay">Overlay</option>
              <option value="saturation">Saturation</option>
            </Dropdown>
          </div>
        </div>
      )}
      {showSliders.colorPicker && (
        <div className={styles.listItem}>
          <div className={styles.listItemText}>Stroke Color</div>
          <div className={styles.listItemControl}>
            <CompactColor
              color={layerStyle?.color}
              onChange={(color) => {
                setStyle(color.hex, "color");
              }}
            />
          </div>
        </div>
      )}
      {showSliders.weight && (
        <Slider
          display="Stroke Weight"
          name="weight"
          value={layerStyle?.weight}
          onChange={(e) => setStyle(Number(e.target.value), "weight")}
          min={1}
          max={5}
          unit={"px"}
        />
      )}
      {showSliders.fillOpacity && (
        <Slider
          display="Fill Opacity"
          name="fillOpacity"
          value={getPercentOrDefault(layerStyle?.fillOpacity)}
          onChange={(e) => setStyle(Number(e.target.value) / 100, "fillOpacity")}
        />
      )}
    </div>
  );
};

export default Settings_subpanel;

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
