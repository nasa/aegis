import { getElevationSinglePoint } from "http-client/elevation";
import { Dispatch, FunctionComponent, SetStateAction, useEffect, useRef } from "react";
import FileManager from "./fileManager";
import { Form } from "react-final-form";
import { AnyObject } from "final-form";
import { FFInput, FFTextArea } from "components/interface/form/globalFields";
import { validators } from "components/interface/form/formValidators";
import Projection from "components/admin/projection";
import adminStyles from "components/admin/admin.module.css";
import isEmpty from "lodash/isEmpty";
import pick from "lodash/pick";
import { upsertMissions } from "http-client/mission";
import { getAccurateNow } from "utils/formatting";

const MissionEditor: FunctionComponent<{
  mission: Mission;
  setMission: Dispatch<SetStateAction<Mission>>;
}> = ({ mission, setMission }) => {
  const formApiRef = useRef(null);

  //save the mission and call and upsert
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function onSubmit(values: Record<string, any>) {
    const missionKeys = Object.keys(mission);

    const missionValues = pick(values, missionKeys);

    const missionToSave: Mission = {
      id: mission.id,
      version: mission.version,
      name: missionValues.name,
      isArchived: missionValues.isArchived,
      actionSystemVersion: missionValues.actionSystemVersion,
      actionDefinitions: mission.actionDefinitions,
      equipmentItems: mission.equipmentItems,
      geographicUnits: mission.geographicUnits,
      actionTemplates: mission.actionTemplates,
      description: missionValues.description || "",
      missionBanner: missionValues.missionBanner || "",
      planetRadius: parseFloat(missionValues.planetRadius) || null,
      landerLocation: {
        lat: parseFloat(missionValues.landerLocation.lat),
        lng: parseFloat(missionValues.landerLocation.lng),
      } as AEGISPoint,
      circleDefinitions: mission.circleDefinitions,
      landerElevationMeters: parseFloat(missionValues.landerElevationMeters) || null,
      initialZoom: parseFloat(missionValues.initialZoom) || null,
      defaultEvaDuration: parseFloat(missionValues.defaultEvaDuration) || null,
      traverseRate: parseFloat(missionValues.traverseRate) || null,
      walkbackRate: parseFloat(missionValues.walkbackRate) || null,
      activeGridUuid: mission.activeGridUuid,
      demFilePath: missionValues.demFilePath || "",
      demResolution: parseFloat(missionValues.demResolution) || null,

      projIsCustom: missionValues.projIsCustom,
      projEpsg: missionValues.projEpsg || "",
      projProj4String: missionValues.projProj4String || "",
      projBoundsMinX: parseFloat(missionValues.projBoundsMinX) || null,
      projBoundsMinY: parseFloat(missionValues.projBoundsMinY) || null,
      projBoundsMaxX: parseFloat(missionValues.projBoundsMaxX) || null,
      projBoundsMaxY: parseFloat(missionValues.projBoundsMaxY) || null,
      projOriginX: parseFloat(missionValues.projOriginX) || null,
      projOriginY: parseFloat(missionValues.projOriginY) || null,
      projResZoomLevel: parseFloat(missionValues.projResZoomLevel) || null,
      projResUnitsPerPixel: parseFloat(missionValues.projResUnitsPerPixel) || null,

      createdAt: mission.createdAt,
      updatedAt: getAccurateNow().toISOString(),
    };

    const res = await upsertMissions([missionToSave]);
    if (res.status === "success") {
      setMission(res.data[0]);
    }
    alert(`${res.status} - ${res.message}`);
  }

  //calculate the lander elevation based on the lander location
  async function calcLanderElevation(point: AEGISPoint) {
    if (!mission.landerLocation.lat || !mission.landerLocation.lat) {
      alert("invalid lander location, cannot calculate elevation");
    }

    const elevation = (
      await getElevationSinglePoint(mission.id, mission.demFilePath, point, mission.planetRadius)
    ).data;

    // use the Final Form API to change the value of the landerElevationMeters field. Mission state is not updated until form is submitted
    formApiRef.current.change("landerElevationMeters", elevation);
  }

  const handleFormErrors = (errors: AnyObject) => {
    if (!isEmpty(errors)) {
      alert("Please fix the following form errors before submitting");
    }
  };

  /**
   * On initial load, set the missionId and sessionId in sessionStorage
   */
  useEffect(() => {
    if (!mission) return;
    //put missionId in sessionStorage
    window.sessionStorage.setItem("missionId", mission.id?.toString()); //there's no id on a new mission
    //put a null socketId in sessionStorage
    window.sessionStorage.setItem("socketId", "null");
  }, [mission]);

  return (
    mission && (
      <Form
        onSubmit={(values) => onSubmit(values)}
        initialValues={{
          ...mission,
        }}
        render={({ form, handleSubmit, values, errors }) => {
          formApiRef.current = form; // save form instance so we can change values programmatically later

          return (
            <form onSubmit={handleSubmit}>
              <div className={adminStyles.container}>
                <div className={adminStyles.editMissionDiv}>
                  {mission.id ? (
                    <h3>Edit Mission &quot;{mission.name}&quot;</h3>
                  ) : (
                    <h3>Add Mission</h3>
                  )}
                  <button type="submit" onClick={() => handleFormErrors(errors)}>
                    Save Mission
                  </button>
                  <br />
                  <br />
                  <div className={adminStyles.missionBodyContainer}>
                    <div>
                      <div className={adminStyles.sectionDiv}>
                        <div className={adminStyles.sectionDivHeading}>Mission Information</div>
                        <div id="missionDiv">
                          <div className={adminStyles.editDiv}>
                            <FFInput
                              name="name"
                              label={{ label: "Mission Name *" }}
                              validators={[validators.required]}
                            />
                          </div>
                        </div>
                        <div id="bannerDiv">
                          <div className={adminStyles.editDiv}>
                            <FFInput
                              name="missionBanner"
                              label={{ label: "Mission Banner", title: "Mission Banner" }}
                            />
                          </div>
                        </div>
                        <div id="descriptionDiv">
                          <div className={adminStyles.editDiv}>
                            <FFTextArea
                              name="description"
                              label={{ label: "Mission Description", title: "Mission Description" }}
                            />
                          </div>
                        </div>
                        <div id="actionSystemVersionDiv">
                          <div className={adminStyles.editDiv}>
                            <FFInput
                              name="actionSystemVersion"
                              label={{
                                label: "Action System Version (1 or 2)",
                                title: "Action System Version",
                              }}
                              validators={[validators.required, validators.mustBeInteger]}
                            />
                          </div>
                        </div>
                        <br />
                        <div id="planetRadiusDiv">
                          <div className={adminStyles.editDiv}>
                            <FFInput
                              name="planetRadius"
                              label={{ label: "Planet Radius (m)" }}
                              validators={[validators.mustBeNumber]}
                            />
                          </div>
                        </div>
                        <div id="landerLatDiv">
                          <div className={adminStyles.editDiv}>
                            <FFInput
                              name="landerLocation.lat"
                              label={{ label: "Lander Location Latitude *" }}
                              validators={[validators.mustBeNumber, validators.required]}
                            />
                          </div>
                        </div>
                        <div id="landerLongDiv">
                          <div className={adminStyles.editDiv}>
                            <FFInput
                              name="landerLocation.lng"
                              label={{ label: "Lander Location Longitude *" }}
                              validators={[validators.mustBeNumber, validators.required]}
                            />
                          </div>
                        </div>
                        <div id="landerEleDiv">
                          <div className={adminStyles.editDiv}>
                            <FFInput
                              name="landerElevationMeters"
                              label={{ label: "Lander Location Elevation" }}
                              validators={[validators.mustBeNumber]}
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const point: AEGISPoint = {
                                  lat: parseFloat(values.landerLocation.lat),
                                  lng: parseFloat(values.landerLocation.lng),
                                };
                                calcLanderElevation(point);
                              }}
                            >
                              Calculate
                            </button>
                          </div>
                        </div>
                        <div id="initialZoomDiv">
                          <div className={adminStyles.editDiv}>
                            <FFInput
                              name="initialZoom"
                              label={{ label: "Initial Zoom Level" }}
                              validators={[validators.mustBeNumber]}
                            />
                          </div>
                        </div>
                        <div id="durationDiv">
                          <div className={adminStyles.editDiv}>
                            <FFInput
                              name="defaultEvaDuration"
                              label={{ label: "Default EVA Duration (mins)" }}
                              validators={[validators.mustBeNumber, validators.mustBeInteger]}
                            />
                          </div>
                        </div>
                        <div id="traverseDiv">
                          <div className={adminStyles.editDiv}>
                            <FFInput
                              name="traverseRate"
                              label={{ label: "Default Traverse Rate (km/h)" }}
                              validators={[validators.mustBeNumber, validators.mustBeInteger]}
                            />
                          </div>
                        </div>
                        <div id="walkbackDiv">
                          <div className={adminStyles.editDiv}>
                            <FFInput
                              name="walkbackRate"
                              label={{ label: "Default Walkback Rate (km/h)" }}
                              validators={[validators.mustBeNumber, validators.mustBeInteger]}
                            />
                          </div>
                        </div>
                      </div>
                      <div className={adminStyles.sectionDiv}>
                        <div className={adminStyles.sectionDivHeading}>
                          Digital Elevation Model (DEM)
                        </div>

                        <div id="demFilePathDiv">
                          <div className={adminStyles.editDiv}>
                            <FFInput
                              name="demFilePath"
                              label={{ label: "DEM File Path" }}
                              validators={[]}
                            />
                          </div>
                        </div>
                        <div id="demResolutionDiv">
                          <div className={adminStyles.editDiv}>
                            <FFInput
                              name="demResolution"
                              label={{ label: "DEM Resolution (m per pixel)" }}
                              validators={[validators.mustBeNumber, validators.mustBeInteger]}
                            />
                          </div>
                        </div>
                      </div>
                      <Projection />
                    </div>
                    <div>
                      <div className={adminStyles.sectionDiv}>
                        <div className={adminStyles.sectionDivHeading}>
                          Manage files in the /Data folder for this mission
                        </div>
                        {mission.id ? (
                          <FileManager
                            missionId={mission.id}
                            path={`missionFiles/${mission.id}/Data`}
                          />
                        ) : (
                          <div>A new mission must be saved first before you can upload files</div>
                        )}
                      </div>
                      <br />
                      <br />
                    </div>
                  </div>

                  <button type="submit" onClick={() => handleFormErrors(errors)}>
                    Save Mission
                  </button>
                </div>
              </div>
            </form>
          );
        }}
      />
    )
  );
};

export default MissionEditor;
