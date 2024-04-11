import { FunctionComponent } from "react";
import paneStyles from "../global-pane-styles.module.css";
import { SubpanelHeading } from "components/interface/_global-elements";
import { faFileExport } from "@fortawesome/free-solid-svg-icons";
import { Button } from "components/interface/form/globalFields";
import { deepEqual, useAppSelector } from "utils/useAppSelector";
import { FeatureCollection, LineString, Feature } from "geojson";

const Export_Panel: FunctionComponent = () => {
  const selectedEva = useAppSelector(
    (state) => state.eva.evas.find((eva) => eva.uuid === state.eva.selectedEvaUuid),
    deepEqual
  );
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
          fullTraverseCoordinates.push([pathItem.lng, pathItem.lat]);
        }
      }
    }
    return fullTraverseCoordinates;
  }, deepEqual);

  interface GeoJsonPoint {
    name: string;
    icon: string;
    coordinates: number[];
  }

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

  return (
    <div className={paneStyles.rightBody}>
      <div className={paneStyles.rightBodyTitle}>Data Export</div>
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
                  const traversesGeoJson: FeatureCollection<LineString> = {
                    type: "FeatureCollection",
                    features: [
                      {
                        type: "Feature",
                        geometry: {
                          type: "LineString",
                          coordinates: fullTraverseCoordinates,
                        },
                        properties: {
                          name: `Traverse for EVA: ${selectedEva.name} `,
                        },
                      },
                    ],
                  };
                  downloadGeoJson(traversesGeoJson, `${selectedEva.name}-traverse.geojson`);
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
                  downloadGeoJson(stationsGeoJson, `${selectedEva.name}-stations.geojson`);
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
                    `${selectedEva.name}-station-actions.geojson`
                  );
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Export_Panel;
