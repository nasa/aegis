import { Seeder } from "@mikro-orm/seeder";
import { Dictionary, EntityManager } from "@mikro-orm/core";
import { Mission } from "../../models/mission.model";

export class MissionSeeder extends Seeder {
  async run(em: EntityManager, context: Dictionary): Promise<void> {
    context.mission1 = em.create(Mission, {
      name: "Apollo_14",
      config: {
        msv: {
          mission: "Apollo_14",
          site: "",
          masterdb: false,
          view: ["-3.64602", "-17.47204", "14"],
          radius: { major: "1737400", minor: "1737400" },
          mapscale: "",
        },
        projection: {
          custom: false,
          epsg: "EPSG:3857",
          proj: "+proj=merc +a=1737400 +b=1737400 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +wktext  +no_defs",
          xmlpath: "",
          bounds: [
            "-17.52833106710000",
            "-3.91299838779177",
            "-17.38598938443003",
            "-2.96327743284100",
          ],
          origin: ["-17.52833106710000", "-3.91299838779177"],
          reszoomlevel: 8,
          resunitsperpixel: 611.49622617187504,
        },
        look: {
          pagename: "postgres",
          minimalist: false,
          zoomcontrol: true,
          graticule: false,
          coordll: true,
          coorden: true,
          coordrxy: true,
          coordsite: false,
          coordelev: false,
          coordelevurl: "",
          coordlngoffset: "",
          coordlatoffset: "",
          coordeastoffset: "",
          coordnorthoffset: "",
          coordeastmult: "",
          coordnorthmult: "",
          primarycolor: "",
          secondarycolor: "",
          tertiarycolor: "",
          accentcolor: "",
          bodycolor: "",
          topbarcolor: "",
          toolbarcolor: "",
          mapcolor: "",
          highlightcolor: "",
          copylink: true,
          screenshot: true,
          fullscreen: true,
          help: true,
          logourl: "",
          helpurl: "",
        },
        panels: ["viewer", "map", "globe"],
        panelSettings: { demFallbackPath: "", demFallbackFormat: null, demFallbackType: null },
        tools: [
          { name: "Layers", icon: "buffer", js: "LayersTool" },
          { name: "Legend", icon: "format-list-bulleted-type", js: "LegendTool" },
          { name: "Info", icon: "information-variant", js: "InfoTool" },
          {
            name: "Sites",
            icon: "pin",
            js: "SitesTool",
            variables: {
              sites: [{ name: "Landing Site", code: "LS", view: [-3.64602, -17.47204, 14] }],
            },
          },
          {
            name: "Isochrone",
            icon: "circle-double",
            js: "IsochroneTool",
            variables: {
              data: {
                DEM: [
                  {
                    name: "NAC Ortho 50cm M150633128",
                    tileurl: "Layers/NAC_ortho_50cm_1_v4/{z}/{x}/{y}.png",
                    minZoom: 8,
                    maxNativeZoom: 18,
                    resolution: 256,
                    interpolateSeams: true,
                  },
                ],
                slope: [{ "...": "..." }],
                cost: [{ "...": "..." }],
              },
              interpolateSeams: false,
              models: ["Traverse Time", "Isodistance", "..."],
            },
          },
          { name: "Chemistry", icon: "flask", js: "ChemistryTool" },
          { name: "Draw", icon: "lead-pencil", js: "DrawTool" },
          {
            name: "Identifier",
            icon: "map-marker",
            js: "IdentifierTool",
            variables: { tile_with_DEM: { url: "Data/missionDEM.tif", unit: "m" } },
          },
          {
            name: "Measure",
            icon: "chart-areaspline",
            js: "MeasureTool",
            variables: { dem: "Data/NAC_DTM_APOLLO14.TIF", resolution: "10" },
          },
        ],
        time: { enabled: false, visible: false, format: "" },
      },
      version: 4,
      landerLocation: { lat: -3.645421873728663, lng: -17.47186660766602 },
      landerElevationMeters: -1063.605,
      traverseSpeed: 3.4,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
}
