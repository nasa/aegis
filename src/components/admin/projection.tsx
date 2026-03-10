import { FunctionComponent } from "react";
import adminStyles from "./admin.module.css";
import { Checkbox, InLineEditInput } from "components/interface/form/globalFields";
import { validators } from "components/interface/form/formValidators";
import type { ChangeFn } from "@automerge/automerge-repo";

const { mustBeNumber } = validators;

const Projection: FunctionComponent<{
  automergeMission: Mission;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  changeAutomergeMission: (changeFn: ChangeFn<Mission>, options?: any) => void;
}> = ({ automergeMission, changeAutomergeMission }) => {
  return (
    <>
      <div className={adminStyles.sectionDiv}>
        <div className={adminStyles.sectionDivHeading}>Map Projection Details</div>
        <div id="customDiv">
          <div className={adminStyles.editDiv}>
            <Checkbox
              checked={automergeMission.projIsCustom}
              label={"Using Custom Projection"}
              onChange={(value) => {
                changeAutomergeMission((m: Mission) => {
                  m.projIsCustom = value.target.checked;
                });
              }}
              uniqueId={`${automergeMission.id}-projIsCustom`}
            />
          </div>
        </div>
        <div id="epsgDiv">
          <div className={adminStyles.editDiv}>
            <InLineEditInput
              value={automergeMission.projEpsg}
              editing={true}
              fieldProps={{
                name: "projEpsg",
                ariaLabel: "Custom: EPSG (or similar code)",
                style: { width: "100%" },
                validators: [],
                label: {
                  label: "Custom: EPSG (or similar code)",
                  className: adminStyles.editLabel,
                },
              }}
              onSubmit={(value) => {
                changeAutomergeMission((m: Mission) => {
                  m.projEpsg = value;
                });
              }}
              key={`${automergeMission.id}-demResolution`}
              debounceSubmit={false}
            />
          </div>
        </div>
        <div id="projDiv">
          <div className={adminStyles.editDiv}>
            <InLineEditInput
              value={automergeMission.projProj4String}
              editing={true}
              fieldProps={{
                name: "projProj4String",
                ariaLabel: "Custom: Proj4 v2.3.14 String",
                style: { width: "100%" },
                validators: [],
                label: { label: "Custom: Proj4 v2.3.14 String", className: adminStyles.editLabel },
              }}
              onSubmit={(value) => {
                changeAutomergeMission((m: Mission) => {
                  m.projProj4String = value;
                });
              }}
              key={`${automergeMission.id}-projProj4String`}
              debounceSubmit={false}
            />
          </div>
        </div>
        <br />
        <div id="minxDiv">
          <div className={adminStyles.editDiv}>
            <InLineEditInput
              value={automergeMission.projBoundsMinX?.toString()}
              editing={true}
              fieldProps={{
                name: "projBoundsMinX",
                ariaLabel: "Bounds MinX",
                style: { width: "100%" },
                validators: [mustBeNumber],
                label: { label: "Bounds MinX", className: adminStyles.editLabel },
              }}
              onSubmit={(value) => {
                changeAutomergeMission((m: Mission) => {
                  m.projBoundsMinX = parseFloat(value) || null;
                });
              }}
              key={`${automergeMission.id}-projBoundsMinX`}
              debounceSubmit={false}
            />
          </div>
        </div>
        <div id="minyDiv">
          <div className={adminStyles.editDiv}>
            <InLineEditInput
              value={automergeMission.projBoundsMinY?.toString()}
              editing={true}
              fieldProps={{
                name: "projBoundsMinY",
                ariaLabel: "Bounds MinY",
                style: { width: "100%" },
                validators: [mustBeNumber],
                label: { label: "Bounds MinY", className: adminStyles.editLabel },
              }}
              onSubmit={(value) => {
                changeAutomergeMission((m: Mission) => {
                  m.projBoundsMinY = parseFloat(value) || null;
                });
              }}
              key={`${automergeMission.id}-projBoundsMinY`}
              debounceSubmit={false}
            />
          </div>
        </div>
        <br />
        <div id="maxxDiv">
          <div className={adminStyles.editDiv}>
            <InLineEditInput
              value={automergeMission.projBoundsMaxX?.toString()}
              editing={true}
              fieldProps={{
                name: "projBoundsMaxX",
                ariaLabel: "Bounds MaxX",
                style: { width: "100%" },
                validators: [mustBeNumber],
                label: { label: "Bounds MaxX", className: adminStyles.editLabel },
              }}
              onSubmit={(value) => {
                changeAutomergeMission((m: Mission) => {
                  m.projBoundsMaxX = parseFloat(value) || null;
                });
              }}
              key={`${automergeMission.id}-projBoundsMaxX`}
              debounceSubmit={false}
            />
          </div>
        </div>
        <div id="maxyDiv">
          <div className={adminStyles.editDiv}>
            <InLineEditInput
              value={automergeMission.projBoundsMaxY?.toString()}
              editing={true}
              fieldProps={{
                name: "projBoundsMaxY",
                ariaLabel: "Bounds MaxY",
                style: { width: "100%" },
                validators: [mustBeNumber],
                label: { label: "Bounds MaxY", className: adminStyles.editLabel },
              }}
              onSubmit={(value) => {
                changeAutomergeMission((m: Mission) => {
                  m.projBoundsMaxY = parseFloat(value) || null;
                });
              }}
              key={`${automergeMission.id}-projBoundsMaxY`}
              debounceSubmit={false}
            />
          </div>
        </div>
        <br />
        <div id="originxDiv">
          <div className={adminStyles.editDiv}>
            <InLineEditInput
              value={automergeMission.projOriginX?.toString()}
              editing={true}
              fieldProps={{
                name: "projOriginX",
                ariaLabel: "Origin X",
                style: { width: "100%" },
                validators: [mustBeNumber],
                label: { label: "Origin X", className: adminStyles.editLabel },
              }}
              onSubmit={(value) => {
                changeAutomergeMission((m: Mission) => {
                  m.projOriginX = parseFloat(value) || null;
                });
              }}
              key={`${automergeMission.id}-projOriginX`}
              debounceSubmit={false}
            />
          </div>
        </div>
        <div id="originyDiv">
          <div className={adminStyles.editDiv}>
            <InLineEditInput
              value={automergeMission.projOriginY?.toString()}
              editing={true}
              fieldProps={{
                name: "projOriginY",
                ariaLabel: "Origin Y",
                style: { width: "100%" },
                validators: [mustBeNumber],
                label: { label: "Origin Y", className: adminStyles.editLabel },
              }}
              onSubmit={(value) => {
                changeAutomergeMission((m: Mission) => {
                  m.projOriginY = parseFloat(value) || null;
                });
              }}
              key={`${automergeMission.id}-projOriginY`}
              debounceSubmit={false}
            />
          </div>
        </div>
        <br />
        <div id="zoomDiv">
          <div className={adminStyles.editDiv}>
            <InLineEditInput
              value={automergeMission.projResZoomLevel?.toString()}
              editing={true}
              fieldProps={{
                name: "projResZoomLevel",
                ariaLabel: "At Zoom Level",
                style: { width: "100%" },
                validators: [mustBeNumber],
                label: { label: "At Zoom Level", className: adminStyles.editLabel },
              }}
              onSubmit={(value) => {
                changeAutomergeMission((m: Mission) => {
                  m.projResZoomLevel = parseInt(value) || null;
                });
              }}
              key={`${automergeMission.id}-projResZoomLevel`}
              debounceSubmit={false}
            />
          </div>
        </div>
        <div id="projResUnitsPerPixel">
          <div className={adminStyles.editDiv}>
            <InLineEditInput
              value={automergeMission.projResUnitsPerPixel?.toString()}
              editing={true}
              fieldProps={{
                name: "projResUnitsPerPixel",
                ariaLabel: "Units per Pixel",
                style: { width: "100%" },
                validators: [mustBeNumber],
                label: { label: "Units per Pixel", className: adminStyles.editLabel },
              }}
              onSubmit={(value) => {
                changeAutomergeMission((m: Mission) => {
                  m.projResUnitsPerPixel = parseFloat(value) || null;
                });
              }}
              key={`${automergeMission.id}-projResUnitsPerPixel`}
              debounceSubmit={false}
            />
          </div>
        </div>
      </div>
    </>
  );
};

export default Projection;
