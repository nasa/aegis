import { Dispatch, FunctionComponent, SetStateAction, useEffect, useState } from "react";
import styles from "./admin.module.css";
import { FFCheckbox, FFTextArea, FFInput } from "components/interface/form/globalFields";
import { validators } from "utils/formValidators";
import { WrappedTool } from "./missionEditor";

const { mustBeValidJSON } = validators;

interface ToolProps {
  config_tools: MMGIS_Tool[];
  setConfig: Dispatch<SetStateAction<Config>>;
}

export const initializeTools = (configTools: MMGIS_Tool[]): WrappedTool[] => {
  return getAllTools(createTools(), configTools);
};

const Tools: FunctionComponent<ToolProps> = (props: ToolProps) => {
  const { config_tools, setConfig } = props;
  const [allWrappedTools, setAllWrappedTools] = useState<WrappedTool[]>([]);

  const allTools = getAllTools(createTools(), config_tools);

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
      <div className={styles.sectionDiv}>
        {allTools.map((tool, index) => {
          return (
            <div id={tool.name} key={tool.name}>
              <EditTool tool={tool} updateConfig={updateConfig} index={index} />
            </div>
          );
        })}
      </div>
    </>
  );
};

/**
 * Component to render the Edit fields for a given tool
 * @param props takes in a WrappedTool to render, and the setState for updating the parent list of all WrappedTools
 * @returns
 */
const EditTool = (props: {
  tool: WrappedTool;
  updateConfig: (tools: WrappedTool) => void;
  index: number;
}) => {
  return (
    <>
      <div className={styles.editDiv}>
        <label
          htmlFor="checkbox"
          data-tooltip-id="aegis-tooltip"
          data-tooltip-html={props.tool.helpText}
        >
          {props.tool.name}
        </label>
      </div>
      <div className={styles.editDiv}>
        <FFCheckbox name={`tools[${props.index}].active`} initialValue={props.tool.active} />
      </div>

      <FFTextArea
        name={`tools[${props.index}].variables`}
        initialValue={"awdwasd"}
        validators={[mustBeValidJSON]}
      />

      <div className={styles.editDiv}>
        Icon&nbsp;
        <FFInput name={`tools[${props.index}].tool.icon`} initialValue={props.tool?.tool.icon} />
      </div>
    </>
  );
};

const getAllTools = (createdTools: WrappedTool[], configTools: MMGIS_Tool[]): WrappedTool[] => {
  const wrappedConfigTools: WrappedTool[] = configTools.map((configTool) => {
    return {
      name: configTool.name,
      tool: configTool,
      helpText: "",
      active: true,
      variables: JSON.stringify(configTool.variables),
    };
  });

  return [
    ...wrappedConfigTools,
    ...createdTools.filter(
      (createdTool) => !wrappedConfigTools.find((t) => t.name === createdTool.name)
    ),
  ];
};

/**
 * Creates basic structure of all tools to render in the MMGIS config
 * @returns an array of tools wrapped in an object containing names and help texts from MMGIS
 */
export function createTools(): WrappedTool[] {
  function createTool(name: string): MMGIS_Tool {
    return {
      name: name,
      icon: "",
      js: `${name}Tool`,
      variables: undefined,
    };
  }
  return [
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
}
export default Tools;
