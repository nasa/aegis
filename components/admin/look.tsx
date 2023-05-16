import { FunctionComponent } from "react";
import styles from "./admin.module.css";
import { CheckboxInputField, TextInputField } from "components/form/FormInput";
import { validators } from "utils/formValidators";

const { mustBeNumber } = validators;

const Look: FunctionComponent = () => {
  return (
    <>
      <h4>Look</h4>
      <div className={styles.sectionDiv}>
        <h5>Rebranding</h5>
        <div id="nameDiv">
          <div className={styles.editDiv}>
            <TextInputField
              name="config.look.pagename"
              label={{ label: "Page Name" }}
              className={styles.editDiv}
            />
          </div>
        </div>
        <div id="logoDiv">
          <div className={styles.editDiv}>
            <TextInputField
              name="config.look.logourl"
              label={{ label: "Square Logo Image URL" }}
              className={styles.editDiv}
            />
          </div>
        </div>
        <h5>User Interface</h5>
        <div id="uiDiv">
          <div className={styles.editDiv}>
            <TextInputField
              name="config.look.minimalist"
              label={{ label: "Minimalist UI" }}
              className={styles.editDiv}
            />
          </div>
        </div>
        <div id="zoomDiv">
          <div className={styles.editDiv}>
            <CheckboxInputField
              name="config.look.zoomcontrol"
              label={{ label: "Map Zoom Control" }}
              className={styles.editDiv}
            />
          </div>
        </div>
        <div id="graticuleDiv">
          <div className={styles.editDiv}>
            <CheckboxInputField
              name="config.look.graticule"
              label={{ label: "Map Graticule" }}
              className={styles.editDiv}
            />
          </div>
        </div>
        <h5>Colors</h5>
        <div id="primaryDiv">
          <div className={styles.editDiv}>
            <TextInputField
              name="config.look.primarycolor"
              label={{ label: "Primary Color" }}
              className={styles.editDiv}
            />
          </div>
        </div>
        <div id="secondaryDiv">
          <div className={styles.editDiv}>
            <TextInputField
              name="config.look.secondarycolor"
              label={{ label: "Secondary Color" }}
              className={styles.editDiv}
            />
          </div>
        </div>
        <div id="tertiaryDiv">
          <div className={styles.editDiv}>
            <TextInputField
              name="config.look.tertiarycolor"
              label={{ label: "Tertiary Color" }}
              className={styles.editDiv}
            />
          </div>
        </div>
        <div id="accentDiv">
          <div className={styles.editDiv}>
            <TextInputField
              name="config.look.accentcolor"
              label={{ label: "Accent Color" }}
              className={styles.editDiv}
            />
          </div>
        </div>
        <div id="bodycolorDiv">
          <div className={styles.editDiv}>
            <TextInputField
              name="config.look.bodycolor"
              label={{ label: "Body Color" }}
              className={styles.editDiv}
            />
          </div>
        </div>
        <div id="topbarDiv">
          <div className={styles.editDiv}>
            <TextInputField
              name="config.look.topbarcolor"
              label={{ label: "Top Bar Color" }}
              className={styles.editDiv}
            />
          </div>
        </div>
        <div id="toolbarDiv">
          <div className={styles.editDiv}>
            <TextInputField
              name="config.look.toolbarcolor"
              label={{ label: "Toolbar Color" }}
              className={styles.editDiv}
            />
          </div>
        </div>
        <div id="mapDiv">
          <div className={styles.editDiv}>
            <TextInputField
              name="config.look.mapcolor"
              label={{ label: "Map Color" }}
              className={styles.editDiv}
            />
          </div>
        </div>
        <div id="highlightDiv">
          <div className={styles.editDiv}>
            <TextInputField
              name="config.look.highlightcolor"
              label={{ label: "Highlight Color" }}
              className={styles.editDiv}
            />
          </div>
        </div>
        <h5>Coordinates</h5>
        <div id="latlongDiv">
          <div className={styles.editDiv}>
            <CheckboxInputField
              name="config.look.coordll"
              label={{ label: "Longitude, Latitude" }}
              className={styles.editDiv}
            />
          </div>
        </div>
        <div id="eastnorthDiv">
          <div className={styles.editDiv}>
            <CheckboxInputField
              name="config.look.coorden"
              label={{ label: "Easting, Northing" }}
              className={styles.editDiv}
            />
          </div>
        </div>
        <div id="relxyDiv">
          <div className={styles.editDiv}>
            <CheckboxInputField
              name="config.look.coordxy"
              label={{ label: "Relative x, Y (Z)" }}
              className={styles.editDiv}
            />
          </div>
        </div>
        <div id="relxyzsiteDiv">
          <div className={styles.editDiv}>
            <CheckboxInputField
              name="config.look.coordsite"
              label={{ label: "Relative x, Y (-Z)" }}
              className={styles.editDiv}
            />
          </div>
        </div>
        <div id="elevationDiv">
          <div className={styles.editDiv}>
            <CheckboxInputField
              name="config.look.coordelev"
              label={{ label: "With Elevation" }}
              className={styles.editDiv}
            />
          </div>
        </div>
        <div id="demURLDiv">
          <div className={styles.editDiv}>
            <TextInputField
              name="config.look.coordelevurl"
              label={{ label: "DEM URL" }}
              className={styles.editDiv}
            />
          </div>
        </div>
        <h5>Coordinate Display Alterations</h5>
        <div id="longOffsetDiv">
          <div className={styles.editDiv}>
            <TextInputField
              name="config.look.coordlngoffset"
              label={{ label: "Longitude Display Offset" }}
              className={styles.editDiv}
              validators={[mustBeNumber]}
            />
          </div>
        </div>
        <div id="latOffsetDiv">
          <div className={styles.editDiv}>
            <TextInputField
              name="config.look.coordlatoffset"
              label={{ label: "Latitude Display Offset" }}
              className={styles.editDiv}
              validators={[mustBeNumber]}
            />
          </div>
        </div>
        <div id="eastOffsetDiv">
          <div className={styles.editDiv}>
            <TextInputField
              name="config.look.coordeastoffset"
              label={{ label: "Easting Display Offset" }}
              className={styles.editDiv}
              validators={[mustBeNumber]}
            />
          </div>
        </div>
        <div id="northOffsetDiv">
          <div className={styles.editDiv}>
            <TextInputField
              name="config.look.coordnorthoffset"
              label={{ label: "Northing Display Offset" }}
              className={styles.editDiv}
              validators={[mustBeNumber]}
            />
          </div>
        </div>
        <div id="eastmultDiv">
          <div className={styles.editDiv}>
            <TextInputField
              name="config.look.coordeastmult"
              label={{ label: "Easting Display Multiplier" }}
              className={styles.editDiv}
              validators={[mustBeNumber]}
            />
          </div>
        </div>
        <div id="northmultDiv">
          <div className={styles.editDiv}>
            <TextInputField
              name="config.look.coordnorthmult"
              label={{ label: "Northing Display Multiplier" }}
              className={styles.editDiv}
              validators={[mustBeNumber]}
            />
          </div>
        </div>
        <h5>Secondary Tools</h5>
        <div id="linkDiv">
          <div className={styles.editDiv}>
            <TextInputField
              name="config.look.copylink"
              label={{ label: "Copy Link" }}
              className={styles.editDiv}
            />
          </div>
        </div>
        <div id="screenDiv">
          <div className={styles.editDiv}>
            <TextInputField
              name="config.look.screenshot"
              label={{ label: "Screenshot" }}
              className={styles.editDiv}
            />
          </div>
        </div>
        <div id="fullscreenDiv">
          <div className={styles.editDiv}>
            <CheckboxInputField
              name="config.look.fullscreen"
              label={{ label: "Fullscreen" }}
              className={styles.editDiv}
            />
          </div>
        </div>
        <h5>User Help</h5>
        <div id="helpDiv">
          <div className={styles.editDiv}>
            <CheckboxInputField
              name="config.look.help"
              label={{ label: "Help" }}
              className={styles.editDiv}
            />
          </div>
        </div>
        <div id="helpurlDiv">
          <div className={styles.editDiv}>
            <TextInputField
              name="config.look.helpurl"
              label={{ label: "Help URL" }}
              className={styles.editDiv}
            />
          </div>
        </div>
      </div>
    </>
  );
};

export default Look;
