import { getElevationSinglePoint } from "http-client/elevation";
import { Dispatch, FunctionComponent, SetStateAction, useEffect } from "react";
import FileManager from "./fileManager";
import { Form } from "react-final-form";
import { AnyObject } from "final-form";
import { FFCheckbox, FFInput, FFTextArea } from "components/interface/form/globalFields";
import { validators } from "components/interface/form/formValidators";
import Projection from "components/admin/projection";
import adminStyles from "components/admin/admin.module.css";
import { pick, isEmpty } from "lodash";
import { upsertMissions } from "http-client/mission";
import { roundDateToSecond } from "utils/formatting";

const MissionEditor: FunctionComponent<{
  refreshMissionList: () => {};
  mission: Mission;
  setMission: Dispatch<SetStateAction<Mission>>;
}> = ({ refreshMissionList, mission, setMission }) => {
  //save the mission and call and upsert
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function onSubmit(values: Record<string, any>) {
    const missionKeys = Object.keys(mission);

    const missionValues = pick(values, missionKeys) as Mission;

    setMission(missionValues);

    const missionToSave: Mission = {
      ...missionValues,
      updatedAt: roundDateToSecond(new Date()).toISOString(),
    };
    const res = await upsertMissions([missionToSave]);
    if (res.status === "success") {
      refreshMissionList();
      setMission(res.data[0]);
    }
    alert(`${res.status} - ${res.message}`);
  }

  //calculate the lander elevation based on the lander location
  async function calcLanderElevation(mission: Mission) {
    if (!mission.landerLocation.lat || !mission.landerLocation.lat) {
      alert("invalid lander location, cannot calculate elevation");
    }

    const point: AEGISPoint = {
      lat: mission.landerLocation.lat,
      lng: mission.landerLocation.lng,
    };
    const elevation = (
      await getElevationSinglePoint(mission.id, mission.demFilePath, point, mission.planetRadius)
    ).data;

    setMission({
      ...mission,
      landerElevationMeters: elevation,
    });
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
        render={({ handleSubmit, values, errors }) => {
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
                  <div className={adminStyles.sectionDiv}>
                    Manage files in the /Data folder for this mission
                    <br />
                    <br />
                    {mission.id ? (
                      <>
                        <FileManager path={`missionFiles/${mission.id}/Data`} />
                      </>
                    ) : (
                      <div>A new mission must be saved first before you can upload files</div>
                    )}
                  </div>
                  <br />
                  <br />
                  <div id="missionDiv">
                    <div className={adminStyles.editDiv}>
                      <FFInput
                        name="name"
                        label={{ label: "Mission Name (Parent)" }}
                        initialValue={mission?.name}
                      />
                    </div>
                  </div>
                  <div id="bannerDiv">
                    <div className={adminStyles.editDiv}>
                      <FFInput
                        name="missionBanner"
                        label={{ label: "Mission Banner", title: "Mission Banner" }}
                        initialValue={mission?.missionBanner}
                      />
                    </div>
                  </div>
                  <div id="descriptionDiv">
                    <div className={adminStyles.editDiv}>
                      <FFTextArea
                        name="description"
                        label={{ label: "Mission Description", title: "Mission Description" }}
                        initialValue={mission?.description}
                      />
                    </div>
                  </div>
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
                        label={{ label: "Lander Location Latitude" }}
                        validators={[validators.mustBeNumber]}
                      />
                    </div>
                  </div>
                  <div id="landerLongDiv">
                    <div className={adminStyles.editDiv}>
                      <FFInput
                        name="landerLocation.lng"
                        label={{ label: "Lander Location Longitude" }}
                        validators={[validators.mustBeNumber]}
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
                          calcLanderElevation(values as Mission);
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
                  <div id="sunAzimuthDiv">
                    <div className={adminStyles.editDiv}>
                      <FFInput
                        name="sunAzimuth"
                        label={{ label: "Sun Azimuth (degrees)" }}
                        validators={[validators.mustBeNumber, validators.mustBeInteger]}
                      />
                    </div>
                  </div>
                  <div id="sunAzimuthEnabledDiv">
                    <div className={adminStyles.editDiv}>
                      <FFCheckbox
                        name="sunAzimuthEnabled"
                        label={{ label: "Sun Azimuth Enabled" }}
                      />
                    </div>
                  </div>
                  <div id="earthAzimuthDiv">
                    <div className={adminStyles.editDiv}>
                      <FFInput
                        name="earthAzimuth"
                        label={{ label: "Earth Azimuth (degrees)" }}
                        validators={[validators.mustBeNumber, validators.mustBeInteger]}
                      />
                    </div>
                  </div>
                  <div id="earthAzimuthEnabledDiv">
                    <div className={adminStyles.editDiv}>
                      <FFCheckbox
                        name="earthAzimuthEnabled"
                        label={{ label: "Earth Azimuth Enabled" }}
                      />
                    </div>
                  </div>
                  <h4>Digital Elevation Model (DEM)</h4>
                  <div className={adminStyles.sectionDiv}>
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
              </div>
            </form>
          );
        }}
      />
    )
  );
};

export default MissionEditor;
