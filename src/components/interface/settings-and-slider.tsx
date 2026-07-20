import type { FunctionComponent } from "react";
import { useCallback } from "react";
import styles from "./settings-and-slider.module.css";
import { Checkbox, Dropdown } from "components/interface/form/globalFields";

import { getPercentOrDefault } from "utils/formatting";
import CompactColor from "@uiw/react-color-compact";
import { COLOR_PALATTE } from "utils/consts";

const Settings_subpanel: FunctionComponent<{
  type: "vector" | "circle" | "vector-tile" | "tile" | "grid";
  uuid: string;
  styleSetter: ({ uuid, layerStyle }: { uuid: string; layerStyle: MapSublayerStyle }) => void;
  mapCircleControls?: MapCircleControls;
  mapSublayerControls?: MapSublayerControls;
  mapGridControl?: MapGridControl;
}> = ({ type, uuid, styleSetter, mapCircleControls, mapSublayerControls, mapGridControl }) => {
  mapCircleControls = mapCircleControls || {};
  mapSublayerControls = mapSublayerControls || {};

  let layerStyle: MapSublayerStyle = mapSublayerControls[uuid]?.style;
  if (type === "grid") {
    layerStyle = mapGridControl?.style;
  } else if (type === "circle") {
    layerStyle = mapCircleControls[uuid]?.style;
  }

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
    isDashed: false,
    dashLen: false,
    altColor: false,
    altOpacity: false,
    showLabels: false,
    showLabelColor: false,
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
      isDashed: false,
      dashLen: false,
      altColor: false,
      altOpacity: false,
      showLabels: true,
      showLabelColor: true,
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
      isDashed: true,
      dashLen: true,
      altColor: true,
      altOpacity: true,
      showLabels: false,
      showLabelColor: false,
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
      isDashed: false,
      dashLen: false,
      altColor: false,
      altOpacity: false,
      showLabels: true,
      showLabelColor: true,
    };
  } else if (type === "grid") {
    showSliders = {
      opacity: true,
      contrast: false,
      brightness: false,
      saturation: false,
      blendMode: false,
      colorPicker: true,
      weight: true,
      fillOpacity: false,
      isDashed: false,
      dashLen: false,
      altColor: false,
      altOpacity: false,
      showLabels: true,
      showLabelColor: true,
    };
  }

  const setStyle = useCallback(
    (value: number | string | boolean, property: MapSublayerStyleKeys) => {
      styleSetter({
        uuid,
        layerStyle: { ...layerStyle, [property]: value },
      });
    },
    [uuid, layerStyle, styleSetter]
  );

  return (
    <div className={styles.slidersContainer}>
      <div className={styles.sliderTitle}>Display Adjustments</div>

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
      {showSliders.colorPicker && (
        <div className={styles.listItem}>
          <div className={styles.listItemText}>Stroke Color</div>
          <div className={styles.listItemControl}>
            <CompactColor
              key={`1-${JSON.stringify(layerStyle)}`} // changing the key blows it away and re-mounts
              color={layerStyle?.color}
              colors={COLOR_PALATTE}
              onChange={(color) => {
                setStyle(color.hex, "color");
              }}
            />
          </div>
        </div>
      )}
      {showSliders.opacity && (
        <Slider
          display={type === "vector" || type === "circle" ? "Stroke Opacity" : "Opacity"}
          name="opacity"
          value={getPercentOrDefault(layerStyle?.opacity)}
          onChange={(e) => setStyle(Number(e.target.value) / 100, "opacity")}
        />
      )}
      {showSliders.weight && (
        <Slider
          display="Stroke Weight"
          name="weight"
          value={layerStyle?.weight ? layerStyle.weight : 2}
          onChange={(e) => setStyle(Number(e.target.value), "weight")}
          min={1}
          max={5}
          unit={"px"}
        />
      )}
      {showSliders.showLabels && (
        <div className={styles.listItem}>
          <div className={styles.listItemText}>Show Labels</div>
          <div className={styles.listItemControl}>
            <Checkbox
              checked={layerStyle?.showLabels ?? true}
              onChange={(e) => {
                setStyle(e.target.checked, "showLabels");
              }}
              toolTip="Show feature labels (e.g. contour elevations)"
            />
          </div>
        </div>
      )}
      {showSliders.showLabels && (layerStyle?.showLabels ?? true) && (
        <Slider
          display="Label Min Zoom"
          name="labelMinZoom"
          value={layerStyle?.labelMinZoom ?? 0}
          onChange={(e) => setStyle(Number(e.target.value), "labelMinZoom")}
          min={0}
          max={12}
          unit={""}
        />
      )}
      {showSliders.showLabels && (layerStyle?.showLabels ?? true) && showSliders.showLabelColor && (
        <div className={styles.listItem}>
          <div className={styles.listItemText}>Label Color</div>
          <div className={styles.listItemControl}>
            <CompactColor
              key={`label-color-${JSON.stringify(layerStyle)}`}
              color={layerStyle?.labelColor ?? "#ffffff"}
              colors={COLOR_PALATTE}
              onChange={(color) => {
                setStyle(color.hex, "labelColor");
              }}
            />
          </div>
        </div>
      )}
      {showSliders.showLabels && (layerStyle?.showLabels ?? true) && (
        <div className={styles.listItem}>
          <div className={styles.listItemText}>Label Halo Color</div>
          <div className={styles.listItemControl}>
            <CompactColor
              key={`label-stroke-${JSON.stringify(layerStyle)}`}
              color={layerStyle?.labelStrokeColor ?? "rgba(255,255,255,0.85)"}
              colors={COLOR_PALATTE}
              onChange={(color) => {
                setStyle(color.hex, "labelStrokeColor");
              }}
            />
          </div>
        </div>
      )}
      {showSliders.showLabels && (layerStyle?.showLabels ?? true) && (
        <Slider
          display="Label Halo Size"
          name="labelStrokeWidth"
          value={layerStyle?.labelStrokeWidth ?? 3}
          onChange={(e) => setStyle(Number(e.target.value), "labelStrokeWidth")}
          min={0}
          max={10}
          unit={"px"}
        />
      )}
      {showSliders.showLabels &&
        (layerStyle?.showLabels ?? true) &&
        (layerStyle?.labelStrokeWidth ?? 3) > 0 && (
          <Slider
            display="Label Halo Opacity"
            name="labelStrokeOpacity"
            value={Math.round((layerStyle?.labelStrokeOpacity ?? 0.85) * 100)}
            onChange={(e) => setStyle(Number(e.target.value) / 100, "labelStrokeOpacity")}
          />
        )}
      {showSliders.isDashed && (
        <div className={styles.listItem}>
          <div className={styles.listItemText}>Dashed Line</div>
          <div className={styles.listItemControl}>
            <Checkbox
              checked={layerStyle?.isDashed || false}
              onChange={(e) => {
                setStyle(e.target.checked, "isDashed");
              }}
              toolTip="Dashed Line"
            />
          </div>
        </div>
      )}
      {layerStyle?.isDashed && showSliders.dashLen && (
        <Slider
          display="Dash Length"
          name="dashLen"
          value={layerStyle?.dashLen ? layerStyle.dashLen : 10}
          onChange={(e) => {
            setStyle(Number(e.target.value), "dashLen");
          }}
          min={1}
          max={20}
          unit={"px"}
        />
      )}
      {layerStyle?.isDashed && showSliders.altColor && (
        <div className={styles.listItem}>
          <div className={styles.listItemText}>Alternate Color</div>
          <div className={styles.listItemControl}>
            <CompactColor
              key={`2-${JSON.stringify(layerStyle)}`} // changing the key blows it away and re-mounts
              color={`${layerStyle?.altColor}`}
              colors={COLOR_PALATTE}
              onChange={(color) => {
                setStyle(color.hex, "altColor");
              }}
            />
          </div>
        </div>
      )}
      {layerStyle?.isDashed && showSliders.altOpacity && (
        <Slider
          display="Alt Opacity"
          name="dashedOpacity"
          value={getPercentOrDefault(layerStyle?.altOpacity)}
          onChange={(e) => setStyle(Number(e.target.value) / 100, "altOpacity")}
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
          data-tooltip-content={name}
          aria-label={name}
          defaultValue={value}
          className={styles.slider}
          onChange={onChange}
        />
      </div>
    </div>
  );
};
