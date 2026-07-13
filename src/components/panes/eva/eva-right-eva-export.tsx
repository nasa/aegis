import type { FunctionComponent } from "react";
import { useCallback, useMemo } from "react";
import paneStyles from "../global-pane-styles.module.css";
import { SubpanelHeading } from "components/interface/_global-elements";
import { faFileExport } from "@fortawesome/free-solid-svg-icons";
import { Button } from "components/interface/form/globalFields";
import { useAppSelector, refEqual, shallowEqual } from "utils/useAppSelector";
import type { FeatureCollection, LineString, Feature } from "geojson";
import { makeExportRexString } from "utils/export";
import { useMissionDocSelector } from "utils/useDocSelector";

interface MarkerPoint {
  name: string;
  icon: string;
  coordinates: number[];
}

interface PosEntryPoint {
  petSeconds: number;
  types: string[];
  source: string;
  coordinates: number[];
}

const Export_Panel: FunctionComponent = () => {
  const selectedEvaUuid = useAppSelector((state) => state.eva.selectedEvaUuid, refEqual);
  const selectedRexUuid = useAppSelector((state) => state.rex.selectedRexUuid, refEqual);

  const docMaps = useMissionDocSelector(
    (mission) => ({
      evas: mission.evas,
      rexes: mission.rexes,
      stations: mission.stations,
      actions: mission.actions,
      traverses: mission.traverses,
    }),
    shallowEqual
  );

  const selectedEva = useMemo(
    () => (selectedEvaUuid ? docMaps?.evas?.[selectedEvaUuid] : undefined),
    [docMaps, selectedEvaUuid]
  );
  const selectedRex = useMemo(
    () => (selectedRexUuid ? docMaps?.rexes?.[selectedRexUuid] : undefined),
    [docMaps, selectedRexUuid]
  );

  const selectedAsPlannedEvaName = useMemo(() => {
    if (!selectedEva || !docMaps?.evas || !docMaps?.rexes) return null;
    const allRexEvaUuids = Object.values(docMaps.rexes).map((r) => r.evaUuid);
    const asPlannedEva = Object.values(docMaps.evas).find(
      (e) => e.refUuid === selectedEva.refUuid && !allRexEvaUuids.includes(e.uuid)
    );
    return asPlannedEva?.name ?? null;
  }, [selectedEva, docMaps]);

  // Traverse coordinates as nested [lng, lat] arrays
  const fullTraverseCoordinates: number[][] = useMemo(() => {
    if (!docMaps || !selectedEva) return [];
    const traverseUuids = selectedEva.sequence
      .filter((sequence) => sequence.type === "traverse")
      .map((sequence) => sequence.uuid);

    const coords: number[][] = [];
    for (const traverseUuid of traverseUuids) {
      const traverse = docMaps.traverses?.[traverseUuid];
      if (!traverse) continue;
      for (const pathItem of traverse.path) {
        // Push the coordinate if it's not the same as the last one
        if (
          coords.length === 0 ||
          coords[coords.length - 1][0] !== pathItem.lng ||
          coords[coords.length - 1][1] !== pathItem.lat
        )
          coords.push([pathItem.lng, pathItem.lat]);
      }
    }
    return coords;
  }, [docMaps, selectedEva]);

  // All station coordinates
  const allStationPoints: MarkerPoint[] = useMemo(() => {
    if (!docMaps || !selectedEva) return [];
    const stationUuids = selectedEva.sequence
      .filter((sequence) => sequence.type === "station")
      .map((sequence) => sequence.uuid);

    const points: MarkerPoint[] = [];
    for (const stationUuid of stationUuids) {
      const station = docMaps.stations?.[stationUuid];
      if (!station) continue;
      points.push({
        name: station.name,
        icon: station.icon,
        coordinates: [station.location.lng, station.location.lat],
      } as MarkerPoint);
    }
    return points;
  }, [docMaps, selectedEva]);

  // All station actions
  const allStationActionPoints: MarkerPoint[] = useMemo(() => {
    if (!docMaps || !selectedEva) return [];
    const stationUuids = selectedEva.sequence
      .filter((sequence) => sequence.type === "station")
      .map((sequence) => sequence.uuid);

    const allStationActions: Action[] = Object.values(docMaps.actions ?? {}).filter((action) =>
      stationUuids.includes(action.stationUuid)
    );

    const points: MarkerPoint[] = [];
    for (const action of allStationActions) {
      if (!action.location) continue;
      points.push({
        name: action.name,
        icon: action.icon,
        coordinates: [action.location.lng, action.location.lat],
      } as MarkerPoint);
    }
    return points;
  }, [docMaps, selectedEva]);

  // All position entries
  const allPositionEntries: PosEntryPoint[] = useMemo(() => {
    if (!selectedRex || !selectedRex.posEntries) return [];
    const posEntryPoints: PosEntryPoint[] = [];
    for (const posEntry of selectedRex.posEntries) {
      if (!posEntry.location) continue;
      const posEntryTypes = posEntry.posTypeUuids.map((typeUuid) => {
        return selectedRex.posTypes.find((posSource) => posSource.uuid === typeUuid)?.name;
      });
      posEntryPoints.push({
        petSeconds: posEntry.petSeconds,
        types: posEntryTypes,
        source: selectedRex.posSources.find((source) => source.uuid === posEntry.posSourceUuid)
          ?.name,
        coordinates: [posEntry.location.lng, posEntry.location.lat],
      } as PosEntryPoint);
    }
    return posEntryPoints;
  }, [selectedRex]);

  const exportRex = useCallback(() => {
    const rex = docMaps?.rexes?.[selectedRexUuid];
    const output = makeExportRexString({ rex });
    const element = document.createElement("a");
    const file = new Blob([output], { type: "text/json" });
    element.href = URL.createObjectURL(file);
    let filename = `${selectedRex?.name}_rex_`;
    filename += "export.json";
    element.download = filename;
    document.body.appendChild(element);
    element.click();
  }, [selectedRexUuid, selectedRex?.name, docMaps]);

  return (
    <div className={paneStyles.rightBody}>
      <div className={paneStyles.rightBodyTitle}>
        Export EVA Data ({selectedRex?.name ? `${selectedRex.name}` : "As Planned"})
      </div>
      <div className={paneStyles.rightBodyBody}>
        <div className={paneStyles.panelContainer}>
          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "8px" }}>
              <SubpanelHeading icon={faFileExport}>Export EVA Data</SubpanelHeading>
            </div>
            <div>
              <Button
                icon={faFileExport}
                label="Export Full Traverse as GeoJSON"
                style={{ width: "225px", marginLeft: "18px", marginTop: "8px" }}
                onClick={() => {
                  const traversesGeoJson = {
                    type: "FeatureCollection",
                    start_datetime:
                      selectedEva?.datetime != null
                        ? new Date(selectedEva.datetime).toISOString()
                        : undefined,
                    features: [
                      {
                        type: "Feature",
                        geometry: { type: "LineString", coordinates: fullTraverseCoordinates },
                        properties: { name: `Traverse for EVA: ${selectedAsPlannedEvaName} ` },
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
                  const stationFeatures: Feature[] = allStationPoints.map((markerPoint) => ({
                    type: "Feature",
                    geometry: { type: "Point", coordinates: markerPoint.coordinates },
                    properties: { name: markerPoint.name, icon: markerPoint.icon },
                  }));
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
                    (markerPoint) => ({
                      type: "Feature",
                      geometry: { type: "Point", coordinates: markerPoint.coordinates },
                      properties: { name: markerPoint.name, icon: markerPoint.icon },
                    })
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
                  Export this Real-time Execution (REX)
                </SubpanelHeading>
              </div>
              <div>
                <Button
                  icon={faFileExport}
                  label="Export REX as JSON"
                  style={{ width: "154px", marginLeft: "18px", marginTop: "8px" }}
                  onClick={() => exportRex()}
                />
                <Button
                  icon={faFileExport}
                  label="Export Position Entries as GeoJSON"
                  style={{ width: "243px", marginLeft: "18px", marginTop: "8px" }}
                  onClick={() => {
                    const posEntryFeatures: Feature[] = allPositionEntries.map((posEntryPoint) => ({
                      type: "Feature",
                      geometry: { type: "Point", coordinates: posEntryPoint.coordinates },
                      properties: {
                        types: posEntryPoint.types,
                        petSeconds: posEntryPoint.petSeconds,
                        source: posEntryPoint.source,
                      },
                    }));
                    //eslint-disable-next-line
                    const posEntriesGeoJson: FeatureCollection<any> = {
                      type: "FeatureCollection",
                      features: posEntryFeatures,
                    };
                    downloadGeoJson(
                      posEntriesGeoJson,
                      `${selectedAsPlannedEvaName}-position-entries.geojson`
                    );
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
  const file = new Blob([JSON.stringify(geoJson)], { type: "application/json" });
  element.href = URL.createObjectURL(file);
  element.download = fileName;
  document.body.appendChild(element);
  element.click();
};

export default Export_Panel;
