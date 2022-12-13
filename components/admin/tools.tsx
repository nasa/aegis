import { useEffect, useState, Dispatch, SetStateAction, FunctionComponent } from "react";
import styles from "./admin.module.css";
import _ from "lodash";

//Type used to track extra information about each tool needed to render the components
type WrappedTool = {
  name: string;
  tool?: MMGIS_Tool;
  helpText: string;
  active: boolean;
};

interface ToolProps {
  config_tools: MMGIS_Tool[];
  setConfig: Dispatch<SetStateAction<Config>>;
}

const Tools: FunctionComponent<ToolProps> = (props: ToolProps) => {
  const { config_tools, setConfig } = props;
  const [allWrappedTools, setAllWrappedTools] = useState<WrappedTool[]>([]);

  //set states with values incoming from the prop
  useEffect(() => {
    const allTools: WrappedTool[] = createTools();
    config_tools?.forEach((configTool: MMGIS_Tool) => {
      const foundTool: WrappedTool = allTools.find((t) => t.name === configTool.name);
      if (!foundTool) {
        //Found an unepxected tool in the config json. Add it to the tool list.
        allTools.push({
          name: configTool.name,
          tool: configTool,
          helpText: "",
          active: true,
        });
      } else {
        foundTool.tool = configTool;
        foundTool.active = true;
      }
    });
    setAllWrappedTools(allTools);
  }, [config_tools]);

  function updateConfig(tool: WrappedTool) {
    if (allWrappedTools?.length > 0) {
      const newTools: MMGIS_Tool[] = [];
      allWrappedTools.forEach((wrappedTool) => {
        if (wrappedTool.name === tool.name) {
          if (tool.active) {
            newTools.push(tool.tool);
          }
        } else if (wrappedTool.active) {
          newTools.push(wrappedTool.tool);
        }
      });
      setConfig((previousConfig: Config) => {
        return { ...previousConfig, tools: newTools };
      });
    }
  }

  return (
    <>
      <h4>Tools</h4>
      {allWrappedTools.map((tool) => {
        return (
          <div id={tool.name} key={tool.name}>
            <EditTool tool={tool} updateConfig={updateConfig} />
          </div>
        );
      })}
    </>
  );
};

/**
 * Component to render the Edit fields for a given tool
 * @param props takes in a WrappedTool to render, and the setState for updating the parent list of all WrappedTools
 * @returns
 */
const EditTool = (props: { tool: WrappedTool; updateConfig: (tools: WrappedTool) => void }) => {
  const [validMsg, setValidMsg] = useState("");
  const [jsonValue, setJsonValue] = useState("");

  function updateJSONconfig(value: JSON) {
    props.updateConfig({
      ...props.tool,
      active: value ? true : props.tool.active,
      tool: { ...props.tool.tool, variables: value },
    });
  }

  useEffect(() => {
    setValidMsg("");
    const json = JSON.stringify(props.tool.tool.variables);
    if (json) {
      setJsonValue(json);
    } else {
      setJsonValue("");
    }
  }, [props.tool]);

  return (
    <>
      <div className={styles.editDiv}>
        <label htmlFor="checkbox" title={props.tool.helpText}>
          {props.tool.name}
        </label>
      </div>
      <div className={styles.editDiv}>
        <input
          id="checkbox"
          type="checkbox"
          onChange={(e) => {
            props.updateConfig({ ...props.tool, active: e.target.checked });
          }}
          checked={props.tool.active}
          title={props.tool.name + " toggle"}
        />
      </div>

      <div className={styles.editDiv}>
        <label htmlFor="json">JSON</label>
      </div>
      <div className={styles.editDiv}>
        <textarea
          id="json"
          onChange={(e) => {
            setJsonValue(e.target.value);
            setValidMsg("");
            if (e.target.value === "") {
              updateJSONconfig(undefined);
            } else {
              try {
                const json = JSON.parse(e.target.value);
                updateJSONconfig(json);
              } catch (e) {
                setValidMsg("Invalid JSON");
              }
            }
          }}
          value={jsonValue}
          title={props.tool.name + "  json"}
        />
        <br />
        <span className={styles.validation}>{validMsg}</span>
      </div>

      <div className={styles.editDiv}>
        Icon&nbsp;
        <input
          id="icon"
          type="text"
          onChange={(e) => {
            props.updateConfig({
              ...props.tool,
              tool: { ...props.tool.tool, icon: e.target.value },
            });
          }}
          value={props.tool.tool?.icon}
          title={props.tool.name + " icon"}
        />
      </div>
    </>
  );
};

/**
 * Creates basic structure of all tools to render in the MMGIS config
 * @returns an array of tools wrapped in an object containing names and help texts from MMGIS
 */
function createTools(): WrappedTool[] {
  function createTool(name: string): MMGIS_Tool {
    return {
      name: name,
      icon: "",
      js: `${name}Tool`,
      variables: undefined,
    };
  }
  const allTools = [
    {
      name: "Layers",
      helpText: "Hierarchically toggle layers on and off and alter their opacities",
      active: false,
      tool: createTool("Layers"),
    },
    {
      name: "Legend",
      helpText: "Show a chart mapping colors and symbols to a meaning",
      active: false,
      tool: createTool("Legend"),
    },
    {
      name: "Info",
      helpText: "Display the geojason properties field of a clicked point",
      active: false,
      tool: createTool("Info"),
    },
    {
      name: "Sites",
      helpText: "A button bar to navigate between various map locations",
      active: false,
      tool: createTool("Sites"),
    },
    {
      name: "Isochrone",
      helpText: "Find the range of locations accessible to an explorer within a given time",
      active: false,
      tool: createTool("Isochrone"),
    },
    {
      name: "Viewshed",
      helpText: "Realtime user generated viewsheds",
      active: false,
      tool: createTool("Viewshed"),
    },
    {
      name: "Chemistry",
      helpText: "Display chemistry percentages via graphs of a clicked point",
      active: false,
      tool: createTool("Chemistry"),
    },
    { name: "Draw", helpText: "Advanced drawing", active: false, tool: createTool("Draw") },
    {
      name: "Identifier",
      helpText: "Mouse over the map for a by-pixel legend of a raster",
      active: false,
      tool: createTool("Identifier"),
    },
    {
      name: "Measure",
      helpText: "Measure distances and generates elevation profiles",
      active: false,
      tool: createTool("Measure"),
    },
  ];
  return allTools;
}
export default Tools;
