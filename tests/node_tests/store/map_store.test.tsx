import reducer, { initialState, setMapSublayerControls } from "store/map";
import { describe, expect, it } from "@jest/globals";
import { TextEncoder, TextDecoder } from "util";
import { v4 as uuidv4 } from "uuid";

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

describe("AEGIS Map Store Tests: ", () => {
  it("should return the initial state on first run", () => {
    // Arrange
    const nextState = initialState;

    // Act
    const result = reducer(undefined, {
      type: undefined,
    });

    // Assert
    expect(result).toEqual(nextState);
  });

  it("Set the State when loading Map sublayers", async () => {
    //create dummy controls
    const uuid1 = uuidv4();
    const uuid2 = uuidv4();
    const controls: MapSublayerControls = {};
    controls[uuid1] = {
      name: "sublayer1",
      sublayerUuid: uuid1,
      visible: false,
      style: null,
    };
    controls[uuid2] = {
      name: "sublayer2",
      sublayerUuid: uuid2,
      visible: false,
      style: null,
    };

    const mapState = reducer(initialState, setMapSublayerControls(controls));
    expect(mapState.mapSublayerControls).toMatchObject(controls);
  });

  describe("Map Store: updateMapDirective", () => {
    it("should update the map directive", () => {
      // Arrange
      const nextMapDirective = {
        type: "map/updateMapDirective",
        payload: {
          center: [0, 0],
          zoom: 0,
          bearing: 0,
          pitch: 0,
        },
      };

      // Act
      const result = reducer(initialState, nextMapDirective);

      // Assert
      expect(result.mapDirective).toEqual(nextMapDirective.payload);
    });
    // Should fail to update map Directive
    it("should fail to update the map directive", () => {
      // Arrange
      const nextMapDirective = {
        type: "map/updateMapDirective",
        payload: {
          center: [0, 0],
          zoom: 0,
          bearing: 0,
          pitch: 0,
        },
      };

      // Act
      const result = reducer(initialState, nextMapDirective);

      // Assert
      expect(result.mapDirective).not.toEqual(initialState.mapDirective);
    });
  });
});
