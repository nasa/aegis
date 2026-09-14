import reducer, { initialState, setOriginalPoints, updateMapDirective } from "store/map";

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

  describe("Map Store: originalPoints", () => {
    const path: AEGISPoint[] = [
      { lat: 1, lng: 1 },
      { lat: 2, lng: 2 },
    ];

    it("should store a detached copy of the points", () => {
      // Act
      const result = reducer(initialState, setOriginalPoints(path));

      // Assert
      expect(result.originalPoints).toEqual(path);
      expect(result.originalPoints[0]).not.toBe(path[0]);
    });

    it("should clear the points when the directive is set to null", () => {
      // Arrange
      const withPoints = reducer(initialState, setOriginalPoints(path));

      // Act
      const result = reducer(withPoints, updateMapDirective(null));

      // Assert
      expect(result.originalPoints).toEqual([]);
    });

    it("should keep the points while a polyline edit directive is active", () => {
      // Arrange
      const withPoints = reducer(initialState, setOriginalPoints(path));

      // Act
      const result = reducer(
        withPoints,
        updateMapDirective({
          uuid: "traverse-1",
          mapItemType: "traverse",
          mapAction: "cancelEditPolyline",
        })
      );

      // Assert
      expect(result.originalPoints).toEqual(path);
    });

    it("should keep the array reference stable on a no-op clear", () => {
      // Act
      const result = reducer(initialState, setOriginalPoints([]));

      // Assert
      expect(result.originalPoints).toBe(initialState.originalPoints);
    });
  });
});
