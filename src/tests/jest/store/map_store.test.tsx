import reducer, { initialState } from "store/map";
import { describe, expect, it } from "@jest/globals";

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
