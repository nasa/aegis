import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import Layers_Panel from "components/panes/preset/preset-right-layers";
import { presetSlice } from "store/preset";
import { generateBlankLayer } from "store/storeUtils/layer";
import { generateBlankSublayer } from "store/storeUtils/sublayer";
import { generateBlankPreset } from "store/storeUtils/preset";
import { createReactHarness, type ReactHarness } from "./map/helpers/reactBrowserHarness";

const fixture = vi.hoisted(() => ({ mission: null as Mission | null }));
vi.mock("utils/useDocSelector", () => ({
  useMissionDocSelector: (selector: (mission: Mission | null) => unknown) =>
    selector(fixture.mission),
}));

const existingLayer = generateBlankLayer({ name: "Existing Layer" });
const existingSublayer = generateBlankSublayer({
  name: "Existing Sublayer",
  layerUuid: existingLayer.uuid,
});
const preset = generateBlankPreset({
  name: "Vitest Preset",
  layerOrder: [{ layerUuid: existingLayer.uuid, sublayerUuids: [existingSublayer.uuid] }],
});

/** Store populated with UI states for only the existing layer and sublayer, like at mission load. */
const makeStore = () =>
  configureStore({
    reducer: { preset: presetSlice.reducer },
    preloadedState: {
      preset: {
        ...presetSlice.getInitialState(),
        selectedPresetUuid: preset.uuid,
        presetLayersUIStates: {
          [preset.uuid]: {
            [existingLayer.uuid]: {
              expanded: true,
              tabSelected: null,
              name: existingLayer.name,
              type: "layer",
            },
            [existingSublayer.uuid]: {
              expanded: true,
              tabSelected: null,
              name: existingSublayer.name,
              type: "sublayer",
            },
          },
        },
      },
    },
  });

let harness: ReactHarness;
let store: ReturnType<typeof makeStore>;

const renderPanel = () =>
  harness.render(
    <Provider store={store}>
      <Layers_Panel editMode={false} />
    </Provider>
  );

beforeEach(() => {
  fixture.mission = {
    layers: { [existingLayer.uuid]: existingLayer },
    sublayers: { [existingSublayer.uuid]: existingSublayer },
    presets: { [preset.uuid]: structuredClone(preset) },
  } as unknown as Mission;
  store = makeStore();
  harness = createReactHarness();
});
afterEach(() => harness.unmount());

/** Add a layer/sublayer to the mission the way the server does, with no Redux UI state for it. */
const addToMission = ({ layer, sublayer }: { layer?: Layer; sublayer: Sublayer }) => {
  const mission = fixture.mission;
  const missionPreset = mission.presets[preset.uuid];
  if (layer) {
    mission.layers[layer.uuid] = layer;
    missionPreset.layerOrder.push({ layerUuid: layer.uuid, sublayerUuids: [] });
  }
  mission.sublayers[sublayer.uuid] = sublayer;
  missionPreset.layerOrder
    .find((entry) => entry.layerUuid === sublayer.layerUuid)
    .sublayerUuids.push(sublayer.uuid);
};

describe("Preset layers panel", () => {
  it("renders a sublayer added under an existing layer after the store was populated", () => {
    const addedSublayer = generateBlankSublayer({
      name: "Added Sublayer",
      layerUuid: existingLayer.uuid,
    });
    addToMission({ sublayer: addedSublayer });

    expect(() => renderPanel()).not.toThrow();
    expect(harness.container.textContent).toContain("Added Sublayer");
  });

  it("renders a sublayer added under a new layer as expanded", () => {
    const addedLayer = generateBlankLayer({ name: "Added Layer" });
    const addedSublayer = generateBlankSublayer({
      name: "Added Sublayer Under New Layer",
      layerUuid: addedLayer.uuid,
    });
    addToMission({ layer: addedLayer, sublayer: addedSublayer });

    renderPanel();
    expect(harness.container.textContent).toContain("Added Layer");
    expect(harness.container.textContent).toContain("Added Sublayer Under New Layer");
  });

  it("collapses a layer when its name is clicked", () => {
    renderPanel();
    // The innermost element holding the layer name (its ancestors share the same text)
    const layerName = [...harness.container.querySelectorAll("div")]
      .filter((element) => element.textContent === "Existing Layer")
      .pop();
    layerName.click();
    renderPanel();

    expect(
      store.getState().preset.presetLayersUIStates[preset.uuid][existingLayer.uuid].expanded
    ).toBe(false);
    expect(harness.container.textContent).not.toContain("Existing Sublayer");
  });
});
