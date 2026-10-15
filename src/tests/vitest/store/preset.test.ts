import { describe, expect, it } from "vitest";

import {
  generateBlankPreset,
  migrateLegacyCircleControlHaloStyles,
  migrateLegacyHaloStyle,
} from "store/storeUtils/preset";
import * as Automerge from "@automerge/automerge";
import { defaultGridStyle, defaultSublayerStyle } from "store/storeUtils/sublayer";

type LegacyHaloStyle = MapSublayerStyle & {
  labelStrokeColor?: string;
  labelStrokeOpacity?: number;
  labelStrokeWidth?: number;
};

describe("preset date calculation persistence", () => {
  it.each([false, true])("round-trips date mode %s without changing manual azimuths", (enabled) => {
    const preset = generateBlankPreset({
      sunEarthFromDate: enabled,
      sunAzimuth: 123,
      earthAzimuth: 234,
    });
    const doc = Automerge.from({ preset });
    expect(Automerge.load<{ preset: Preset }>(Automerge.save(doc)).preset).toMatchObject({
      sunEarthFromDate: enabled,
      sunAzimuth: 123,
      earthAzimuth: 234,
    });
  });

  it("defaults new presets to manual mode", () => {
    expect(generateBlankPreset().sunEarthFromDate).toBe(false);
  });
});

describe("migrateLegacyHaloStyle", () => {
  it("maps legacy label stroke properties to halo properties idempotently", () => {
    const legacyStyle = {
      labelStrokeColor: "#000000",
      labelStrokeOpacity: 0.85,
      labelStrokeWidth: 2,
    } as LegacyHaloStyle;

    migrateLegacyHaloStyle(legacyStyle);
    migrateLegacyHaloStyle(legacyStyle);

    expect(legacyStyle).toMatchObject({
      labelHaloColor: "#000000",
      labelHaloOpacity: 0.85,
      labelHaloWidth: 2,
    });
    expect(legacyStyle).not.toHaveProperty("labelStrokeColor");
    expect(legacyStyle).not.toHaveProperty("labelStrokeOpacity");
    expect(legacyStyle).not.toHaveProperty("labelStrokeWidth");
  });

  it("preserves existing halo properties", () => {
    const mixedStyle = {
      labelHaloColor: "#FFFFFF",
      labelHaloOpacity: 0.5,
      labelHaloWidth: 3,
      labelStrokeColor: "#000000",
      labelStrokeOpacity: 0.85,
      labelStrokeWidth: 2,
    } as LegacyHaloStyle;

    migrateLegacyHaloStyle(mixedStyle);

    expect(mixedStyle).toMatchObject({
      labelHaloColor: "#FFFFFF",
      labelHaloOpacity: 0.5,
      labelHaloWidth: 3,
    });
    expect(mixedStyle).not.toHaveProperty("labelStrokeColor");
    expect(mixedStyle).not.toHaveProperty("labelStrokeOpacity");
    expect(mixedStyle).not.toHaveProperty("labelStrokeWidth");
  });

  it("migrates legacy styles in every circle control", () => {
    const circleControls: MapCircleControls = {
      first: {
        uuid: "first",
        visible: true,
        style: {
          labelStrokeColor: "#000000",
          labelStrokeOpacity: 0.85,
          labelStrokeWidth: 2,
        } as LegacyHaloStyle,
      },
      second: {
        uuid: "second",
        visible: false,
        style: {
          labelStrokeColor: "#FFFFFF",
          labelStrokeOpacity: 0.5,
          labelStrokeWidth: 3,
        } as LegacyHaloStyle,
      },
    };

    migrateLegacyCircleControlHaloStyles(circleControls);

    expect(circleControls.first.style).toMatchObject({
      labelHaloColor: "#000000",
      labelHaloOpacity: 0.85,
      labelHaloWidth: 2,
    });
    expect(circleControls.second.style).toMatchObject({
      labelHaloColor: "#FFFFFF",
      labelHaloOpacity: 0.5,
      labelHaloWidth: 3,
    });
  });
});

it("uses opaque hex colors for shared and grid halo defaults", () => {
  expect(defaultSublayerStyle.labelHaloColor).toBe("#000000");
  expect(defaultSublayerStyle.labelHaloOpacity).toBe(0.2);
  expect(defaultGridStyle.labelHaloColor).toBe("#000000");
  expect(defaultGridStyle.labelHaloOpacity).toBe(0.2);
});
