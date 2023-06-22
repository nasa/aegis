import { getElevationSinglePoint } from "http-client/elevation";
import { Dispatch, FunctionComponent, SetStateAction, useEffect, useState } from "react";
import FileManager from "./fileManager";
import { createNewConfig, stringToJSON } from "./helper";
import { Form } from "react-final-form";
import { AnyObject } from "final-form";
import { FFInput } from "components/interface/form/globalFields";
import { validators } from "components/interface/form/formValidators";
import Look from "./look";
import MSV from "./msv";
import Projection from "components/admin/projection";
import Panels from "./panels";
import Time from "./time";
import Tools, { createTools, initializeTools } from "./tools";
import adminStyles from "components/admin/admin.module.css";
import { forIn, pick, isEmpty } from "lodash";
import { upsertMission } from "http-client/mission";

//Type used to track extra information about each tool needed to render the components
export type WrappedTool = {
  name: string;
  tool?: MMGIS_Tool;
  helpText: string;
  active: boolean;
  variables?: string;
};

const MissionEditor: FunctionComponent<{
  refreshMissionList: () => {};
  mission: Mission;
  setMission: Dispatch<SetStateAction<Mission>>;
}> = ({ refreshMissionList, mission, setMission }) => {
  const [config, setConfig] = useState<Config>(createNewConfig());
  useEffect(() => {
    if (mission) {
      setConfig(mission.config);
    }
  }, [mission]);

  //save the mission and call and upsert
  async function onSubmit(values) {
    const panelArray = [];
    forIn(values.panelValues, (value, key) => {
      if (value) {
        panelArray.push(key);
      }
    });

    const configTools: MMGIS_Tool[] = [];
    const defaultWrappedTools = createTools();

    const allWrappedTools: WrappedTool[] = values.tools;

    if (allWrappedTools?.length > 0) {
      allWrappedTools.forEach((wrappedTool) => {
        if (wrappedTool.active) {
          const tool = wrappedTool.tool;
          const toolVariables = stringToJSON(wrappedTool.variables);
          configTools.push({
            ...tool,
            variables: toolVariables,
          });
        } else {
          configTools.push(defaultWrappedTools.find((t) => t.name === wrappedTool.name).tool);
        }
      });
    }

    const missionKeys = Object.keys(mission);

    const missionValues = pick(values, missionKeys) as Mission;

    setMission(missionValues);

    const configToSave: Config = {
      ...missionValues.config,
      tools: configTools,
      panels: panelArray,
      panelSettings: {
        ...config.panelSettings,
        ...values.panelSettings,
      },
    };
    const missionToSave: Mission = { ...missionValues, config: configToSave };
    const res = await upsertMission(missionToSave);
    if (res.status === "success") {
      refreshMissionList();
    }
    alert(`${res.status} - ${res.message}`);
  }

  //calculate the lander elevation based on the lander location
  async function calcLanderElevation(mission: Mission) {
    if (!mission.landerLocation.lat || !mission.landerLocation.lat) {
      alert("invalid lander location, cannot calculate elevation");
    }

    const radius = parseFloat(mission?.config.msv.radius.minor);
    const measureJson = mission?.config.tools.find((tool) => tool.name === "Measure")?.variables;
    const demFilepath: string = measureJson["dem"];
    const point: AEGISPoint = {
      lat: mission.landerLocation.lat,
      lng: mission.landerLocation.lng,
    };
    const elevation = (await getElevationSinglePoint(mission.id, demFilepath, point, radius)).data;
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

  return (
    mission && (
      <Form
        onSubmit={(values) => onSubmit(values)}
        initialValues={{
          ...mission,
          config: config,
          panelValues: {
            viewer: config.panels.includes("viewer"),
            map: config.panels.includes("map"),
            globe: config.panels.includes("globe"),
          },
          panelSettings: {
            demFallbackPath: config.panelSettings.demFallbackPath,
            demFallbackFormat: config.panelSettings.demFallbackFormat,
            demFallbackType: config.panelSettings.demFallbackType,
          },
          tools: initializeTools(config.tools),
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
                        name="config.missionBanner"
                        label={{ label: "Mission Banner", title: "Mission Banner" }}
                        initialValue={mission?.name}
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
                  <div id="traverseDiv">
                    <div className={adminStyles.editDiv}>
                      <FFInput
                        name="traverseSpeed"
                        label={{ label: "Default Traverse Speed" }}
                        validators={[validators.mustBeNumber]}
                      />
                    </div>
                  </div>
                  <MSV />
                  <Tools config_tools={config?.tools} setConfig={setConfig} />
                  <Projection />
                  <Look />
                  <Panels />
                  <Time />
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
