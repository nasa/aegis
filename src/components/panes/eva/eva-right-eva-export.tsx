import { FunctionComponent, useCallback } from "react";
import paneStyles from "../global-pane-styles.module.css";
import { SubpanelHeading } from "components/interface/_global-elements";
import { faFileExport } from "@fortawesome/free-solid-svg-icons";
import { Button } from "components/interface/form/globalFields";
import { deepEqual, refEqual, useAppSelector } from "utils/useAppSelector";
import { FeatureCollection, LineString, Feature } from "geojson";
import { useAppDispatch } from "utils/useAppDispatch";
import { thunkMakeExportRexString } from "store/thunk/thunkRex";
import { getAsPlannedEvaFromRefUuid } from "store/selectors";

interface GeoJsonPoint {
  name: string;
  icon: string;
  coordinates: number[];
}

const Export_Panel: FunctionComponent = () => {
  const dispatch = useAppDispatch();
  const selectedEva = useAppSelector(
    (state) => state.eva.evas.find((eva) => eva.uuid === state.eva.selectedEvaUuid),
    deepEqual
  );
  const selectedRexUuid = useAppSelector((state) => state.rex.selectedRexUuid, refEqual);
  const selectedRexName = useAppSelector(
    (state) => state.rex.rexes.find((rex) => rex.uuid === state.rex.selectedRexUuid)?.name,
    refEqual
  );
  const selectedAsPlannedEvaName = useAppSelector((state) => {
    const asPlannedEva = getAsPlannedEvaFromRefUuid(state, selectedEva.refUuid);
    return asPlannedEva ? asPlannedEva.name : null;
  }, refEqual);

  // traverse coordinates as nested [lng, lat] arrays
  const fullTraverseCoordinates: number[][] = useAppSelector((state) => {
    const traverseUuids = selectedEva.sequence
      .filter((sequence) => sequence.type === "traverse")
      .map((sequence) => sequence.uuid);

    const fullTraverseCoordinates: number[][] = [];
    for (const traverseUuid of traverseUuids) {
      const traverse = state.traverse.traverses.find((traverse) => traverse.uuid === traverseUuid);
      if (traverse) {
        for (const pathItem of traverse.path) {
          // push the coordinate if it's not the same as the last one
          if (
            fullTraverseCoordinates.length === 0 ||
            fullTraverseCoordinates[fullTraverseCoordinates.length - 1][0] !== pathItem.lng ||
            fullTraverseCoordinates[fullTraverseCoordinates.length - 1][1] !== pathItem.lat
          )
            fullTraverseCoordinates.push([pathItem.lng, pathItem.lat]);
        }
      }
    }
    return fullTraverseCoordinates;
  }, deepEqual);

  // all station coordinates as nested [lng, lat] arrays
  const allStationPoints: GeoJsonPoint[] = useAppSelector((state) => {
    const stationUuids = selectedEva.sequence
      .filter((sequence) => sequence.type === "station")
      .map((sequence) => sequence.uuid);

    const allStationPoints: GeoJsonPoint[] = [];
    for (const stationUuid of stationUuids) {
      const station = state.station.stations.find((station) => station.uuid === stationUuid);
      if (station) {
        allStationPoints.push({
          name: station.name,
          icon: station.icon,
          coordinates: [station.location.lng, station.location.lat],
        } as GeoJsonPoint);
      }
    }
    return allStationPoints;
  }, deepEqual);

  // all station actions as nested [lng, lat] arrays
  const allStationActionPoints: GeoJsonPoint[] = useAppSelector((state) => {
    const stationUuids = selectedEva.sequence
      .filter((sequence) => sequence.type === "station")
      .map((sequence) => sequence.uuid);

    const allStationActions: Action[] = state.action.actions.filter((action) =>
      stationUuids.includes(action.stationUuid)
    );

    const allStationActionPoints: GeoJsonPoint[] = [];
    for (const action of allStationActions) {
      if (action.location) {
        allStationActionPoints.push({
          name: action.name,
          icon: action.icon,
          coordinates: [action.location.lng, action.location.lat],
        } as GeoJsonPoint);
      }
    }
    return allStationActionPoints;
  }, deepEqual);

  const exportFile = useCallback(async () => {
    const output = await dispatch(
      thunkMakeExportRexString({
        rexUuid: selectedRexUuid,
      })
    );

    const element = document.createElement("a");
    const file = new Blob([output.payload as string], { type: "text/json" });
    element.href = URL.createObjectURL(file);
    let filename = `${selectedRexName}_rex_`;
    filename += "export.json";
    element.download = filename;
    document.body.appendChild(element); // Required for this to work in FireFox
    element.click();
  }, [dispatch, selectedRexUuid, selectedRexName]);

  return (
    <div className={paneStyles.rightBody}>
      <div className={paneStyles.rightBodyTitle}>
        Export EVA Data ({selectedRexName ? `${selectedRexName}` : "As Planned"})
      </div>
      <div className={paneStyles.rightBodyBody}>
        <div className={paneStyles.panelContainer}>
          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "8px" }}>
              <SubpanelHeading icon={faFileExport}>Export EVA Data as GeoJSON</SubpanelHeading>
            </div>
            <div className={paneStyles.panelSectionBody}>
              <Button
                icon={faFileExport}
                label="Export Full Traverse as GeoJSON"
                style={{ width: "225px", marginLeft: "18px", marginTop: "8px" }}
                onClick={() => {
                  const traversesGeoJson = {
                    type: "FeatureCollection",
                    start_datetime: selectedEva.datetime,
                    features: [
                      {
                        type: "Feature",
                        geometry: {
                          type: "LineString",
                          coordinates: fullTraverseCoordinates,
                        },
                        properties: {
                          name: `Traverse for EVA: ${selectedAsPlannedEvaName} `,
                        },
                      },
                    ],
                  } as unknown as FeatureCollection<LineString>;
                  downloadGeoJson(traversesGeoJson, `${selectedAsPlannedEvaName}-traverse.geojson`);
                }}
              />
              <Button
                icon={faFileExport}
                label="Export Stations as GeoJSON"
                style={{ width: "200px", marginLeft: "18px", marginTop: "8px" }}
                onClick={() => {
                  const stationFeatures: Feature[] = allStationPoints.map((geojsonPoint) => {
                    return {
                      type: "Feature",
                      geometry: {
                        type: "Point",
                        coordinates: geojsonPoint.coordinates,
                      },
                      properties: {
                        name: geojsonPoint.name,
                        icon: geojsonPoint.icon,
                      },
                    };
                  });
                  //eslint-disable-next-line
                  const stationsGeoJson: FeatureCollection<any> = {
                    type: "FeatureCollection",
                    features: stationFeatures,
                  };
                  downloadGeoJson(stationsGeoJson, `${selectedAsPlannedEvaName}-stations.geojson`);
                }}
              />
              <Button
                icon={faFileExport}
                label="Export Station Actions as GeoJSON"
                style={{ width: "240px", marginLeft: "18px", marginTop: "8px" }}
                onClick={() => {
                  const stationActionFeatures: Feature[] = allStationActionPoints.map(
                    (geojsonPoint) => {
                      return {
                        type: "Feature",
                        geometry: {
                          type: "Point",
                          coordinates: geojsonPoint.coordinates,
                        },
                        properties: {
                          name: geojsonPoint.name,
                          icon: geojsonPoint.icon,
                        },
                      };
                    }
                  );
                  //eslint-disable-next-line
                  const stationActionsGeoJson: FeatureCollection<any> = {
                    type: "FeatureCollection",
                    features: stationActionFeatures,
                  };
                  downloadGeoJson(
                    stationActionsGeoJson,
                    `${selectedAsPlannedEvaName}-station-actions.geojson`
                  );
                }}
              />
            </div>
          </div>
          {selectedRexUuid && (
            <div className={paneStyles.panelSection}>
              <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "8px" }}>
                <SubpanelHeading icon={faFileExport}>
                  Export this Real-time Execution (including position markers)
                </SubpanelHeading>
              </div>
              <div className={paneStyles.panelSectionBody}>
                <Button
                  icon={faFileExport}
                  label="Export JSON File"
                  style={{ width: "135px", marginLeft: "18px", marginTop: "8px" }}
                  onClick={() => {
                    exportFile();
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const downloadGeoJson = (geoJson: FeatureCollection, fileName: string) => {
  const element = document.createElement("a");
  const file = new Blob([JSON.stringify(geoJson)], {
    type: "application/json",
  });
  element.href = URL.createObjectURL(file);
  element.download = fileName;
  document.body.appendChild(element);
  element.click();
};

export default Export_Panel;
