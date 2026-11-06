import { PLANETS, supportsUploadedGrid } from "utils/planets";
import { getMissionDems } from "http-client/mission";
import { getElevationSinglePoint } from "http-client/terrainProfile";
import { isKnownElevation } from "utils/elevation";
import { applyMissionPlanet } from "operations/apply/apply-mission";
import AsyncStatus from "components/admin/asyncStatus";
import { useAsyncStatus } from "components/admin/useAsyncStatus";
import { useCallback, useEffect, useState } from "react";
import { useAppSelector, shallowEqual } from "utils/useAppSelector";
import { Link, useParams } from "react-router";
import adminStyles from "components/admin/admin.module.css";
import { useDocument } from "@automerge/automerge-repo-react-hooks";
import FileManager from "components/admin/fileManager";
import { InLineEditInput, TextArea } from "components/interface/form/globalFields";
import { validators } from "components/interface/form/formValidators";
import Projection from "components/admin/projection";
import AdminMissionGrid from "components/admin/gridUpload";
import adminCommon from "./adminCommon.module.css";
import type { AutomergeUrl } from "@automerge/automerge-repo";
import { maestroCreateDoc } from "http-client/maestro";
import { getCurrentUser } from "packages/getCurrentUser";
import type { MaestroAccessControl } from "server/maestro/v2/types/clientTypesMaestro";

import { getMissionDefaultLabelScheme, getMissionGridSystem } from "utils/lgrs/system";

type RouteParams = {
  id: string;
  automergeUrl: string;
};

const formatDemResolution = (resolution: number | null): string =>
  resolution == null ? "unknown" : Number(resolution.toPrecision(10)).toString();

const Mission: React.FunctionComponent = () => {
  const maestroStatus = useAsyncStatus();
  const demStatus = useAsyncStatus();
  const elevationStatus = useAsyncStatus();
  const [elevationAttempt, setElevationAttempt] = useState(0);
  const { run: runElevationTask, clearError: clearElevationError } = elevationStatus;
  const { run: runDemTask } = demStatus;
  const [dems, setDems] = useState<MissionDem[]>([]);
  const [dataFiles, setDataFiles] = useState<GISfile[]>([]);
  const params = useParams<RouteParams>();
  // Access the automerge mission document via the useDocument hook instead of the
  // useMissionDocSelector (to read) and useDocHandle (to write). This is because for this
  // component, in particular, we access most/all of the properties of mission and it is simpler
  const [automergeMission, changeMissionDoc] = useDocument<Mission>(
    params.automergeUrl as AutomergeUrl
  );

  const missionId = automergeMission?.id;
  const refreshDems = useCallback(() => {
    if (!missionId) return;
    return runDemTask("Reading DEM files...", async () => {
      setDems(await getMissionDems(missionId));
    });
  }, [missionId, runDemTask]);

  useEffect(() => {
    refreshDems();
  }, [refreshDems, dataFiles]);

  // wrapper to also update the updatedAt field when any change is made
  const changeAutomergeMission = useCallback(
    (updateFn: (m: Mission) => void) => {
      changeMissionDoc((m: Mission) => {
        const previousInputs = JSON.stringify([m.landerLocation, m.demFilePath, m.demResolution]);
        updateFn(m);
        if (JSON.stringify([m.landerLocation, m.demFilePath, m.demResolution]) !== previousInputs) {
          m.landerElevationMeters = null;
          for (const station of Object.values(m.stations ?? {})) {
            if (station.isLanderXgress) station.elevation = null;
          }
        }
        if (!supportsUploadedGrid(m)) m.serverFileGrid = null;
        m.updatedAt = new Date().getTime();
      });
    },
    [changeMissionDoc]
  );

  const landerLat = automergeMission?.landerLocation?.lat;
  const landerLng = automergeMission?.landerLocation?.lng;
  const demFilePath = automergeMission?.demFilePath;
  const demResolution = automergeMission?.demResolution;
  const landerElevation = automergeMission?.landerElevationMeters;
  useEffect(() => {
    clearElevationError();
    if (
      !missionId ||
      !demFilePath ||
      !Number.isFinite(landerLat) ||
      !Number.isFinite(landerLng) ||
      Math.abs(landerLat) > 90 ||
      Math.abs(landerLng) > 180 ||
      isKnownElevation(landerElevation)
    )
      return;
    let cancelled = false;
    runElevationTask("Calculating lander elevation...", async () => {
      try {
        const response = await getElevationSinglePoint({
          missionId,
          point: { lat: landerLat, lng: landerLng },
          expectedDem: { demFilePath, demResolution },
        });
        if (cancelled) return;
        if (response.status !== "success" || !isKnownElevation(response.data))
          throw new Error(response.message || "The DEM has no elevation at this location");
        changeMissionDoc((m) => {
          if (
            m.id !== missionId ||
            m.demFilePath !== demFilePath ||
            m.demResolution !== demResolution ||
            m.landerLocation?.lat !== landerLat ||
            m.landerLocation?.lng !== landerLng
          )
            return;
          m.landerElevationMeters = response.data;
          for (const station of Object.values(m.stations ?? {})) {
            if (station.isLanderXgress) station.elevation = response.data;
          }
        });
      } catch (error) {
        if (!cancelled) throw error;
      }
    });
    return () => {
      cancelled = true;
    };
  }, [
    missionId,
    params.automergeUrl,
    landerLat,
    landerLng,
    demFilePath,
    demResolution,
    landerElevation,
    elevationAttempt,
    changeMissionDoc,
    runElevationTask,
    clearElevationError,
  ]);

  useEffect(() => {
    //put missionId in sessionStorage
    window.sessionStorage.setItem("missionId", params.id.toString()); //there's no id on a new mission
    //put a null socketId in sessionStorage
    window.sessionStorage.setItem("socketId", "null");
  }, [params]);

  // Maestro section state
  const [maestroAccessControl, setMaestroAccessControl] = useState<MaestroAccessControl>("public");
  const maestroLoading = !!maestroStatus.pending;
  const [maestroError, setMaestroError] = useState<string | null>(null);
  const [maestroResponseMeta, setMaestroResponseMeta] = useState<unknown | null>(null);
  const maestroCurrentUser = useAppSelector((state) => state.user.launchpadUser, shallowEqual);
  const grid = automergeMission ? getMissionGridSystem(automergeMission) : null;
  const isEarthGrid = automergeMission?.planet === "earth";
  const handleCreateMaestroProject = useCallback(async () => {
    if (!automergeMission?.id) return;
    setMaestroError(null);
    setMaestroResponseMeta(null);

    const currentUser = await getCurrentUser();
    const owners: LaunchpadUser[] = currentUser instanceof Error ? [] : [currentUser];

    const response = await maestroCreateDoc({
      missionId: automergeMission.id,
      missionName: automergeMission.name,
      owners,
      accessControl: maestroAccessControl,
    });

    if (response.status === "error") {
      throw new Error(response.message || "Failed to create Maestro project");
    }

    setMaestroResponseMeta(response.data.alteredInitialState ?? null);
    // The project was created; a payload-level error is a warning about the created
    // document rather than a failure of this request.
    if (response.data.error) {
      const errStr =
        typeof response.data.error === "string"
          ? response.data.error
          : JSON.stringify(response.data.error);
      if (errStr && errStr !== "{}" && errStr !== "null") {
        setMaestroError(errStr);
      }
    }
    changeAutomergeMission((m: Mission) => {
      m.maestroDocId = response.data.documentId;
    });
  }, [automergeMission, changeAutomergeMission, maestroAccessControl]);

  const handleClearMaestroDocId = useCallback(() => {
    setMaestroError(null);
    setMaestroResponseMeta(null);
    changeAutomergeMission((m: Mission) => {
      m.maestroDocId = null;
    });
  }, [changeAutomergeMission]);

  return (
    <main className={adminCommon.page}>
      <div className={adminCommon.container}>
        <Link to="/admin/missions" className={adminCommon.backLink}>
          ← Missions
        </Link>
        {!automergeMission && <AsyncStatus pending="Loading mission..." />}
        {automergeMission && (
          <>
            <h1 className={adminCommon.pageTitle}>
              {automergeMission.id ? "Edit Mission" : "Add Mission"}
            </h1>
            {automergeMission.id && (
              <div className={adminCommon.missionSubheader}>
                <span className={adminCommon.missionSubheaderLabel}>Mission</span>
                <span className={adminCommon.missionSubheaderName}>{automergeMission.name}</span>
              </div>
            )}

            <div className={adminCommon.missionBodyContainer}>
              <div>
                {/* Mission Information Section */}
                <section className={adminCommon.section} style={{ marginBottom: 16 }}>
                  <h2 className={adminCommon.sectionHeading}>Mission Information</h2>
                  <div className={adminCommon.details}>
                    <div id="missionDiv">
                      <div className={adminStyles.editDiv}>
                        <InLineEditInput
                          value={automergeMission.name}
                          editing={true}
                          fieldProps={{
                            name: "name",
                            ariaLabel: "Mission Name *",
                            style: { width: "100%" },
                            validators: [validators.required, validators.maxLength(50)],
                            label: { label: "Mission Name", className: adminStyles.editLabel },
                          }}
                          onSubmit={(value) => {
                            changeAutomergeMission((m: Mission) => {
                              m.name = value || "";
                            });
                          }}
                          key={`${automergeMission.id}-name`}
                          debounceSubmit={false}
                        />
                      </div>
                    </div>
                    <div id="bannerDiv">
                      <div className={adminStyles.editDiv}>
                        <InLineEditInput
                          value={automergeMission.missionBanner}
                          editing={true}
                          fieldProps={{
                            name: "name",
                            ariaLabel: "Mission Banner",
                            style: { width: "100%" },
                            validators: [validators.maxLength(255)],
                            label: { label: "Mission Banner", className: adminStyles.editLabel },
                          }}
                          onSubmit={(value) => {
                            changeAutomergeMission((m: Mission) => {
                              m.missionBanner = value || "";
                            });
                          }}
                          key={`${automergeMission.id}-banner`}
                          debounceSubmit={false}
                        />
                      </div>
                    </div>
                    <div id="descriptionDiv">
                      <div className={`${adminStyles.editDiv} `}>
                        Description:
                        <TextArea
                          value={automergeMission.description || ""}
                          editing={true}
                          fieldProps={{
                            name: "description",
                            ariaLabel: "Mission Description",
                            className: adminStyles.inputTextArea,
                          }}
                          onSubmit={(value) => {
                            changeAutomergeMission((m: Mission) => {
                              m.description = value || "";
                            });
                          }}
                          debounceSubmit={false}
                        />
                      </div>
                    </div>
                    <div id="actionSystemVersionDiv">
                      <div className={adminStyles.editDiv}>
                        <InLineEditInput
                          value={automergeMission.actionSystemVersion?.toString()}
                          editing={true}
                          fieldProps={{
                            name: "actionSystemVersion",
                            ariaLabel: "Action System Version",
                            style: { width: "100%" },
                            validators: [
                              validators.required,
                              validators.mustBeInteger,
                              validators.maxLength(1),
                            ],
                            label: {
                              label: "Action System Version (1 or 2)",
                              className: adminStyles.editLabel,
                            },
                          }}
                          onSubmit={(value) => {
                            changeAutomergeMission((m: Mission) => {
                              m.actionSystemVersion = +value || null;
                            });
                          }}
                          key={`${automergeMission.id}-actionSystemVersion`}
                          debounceSubmit={false}
                        />
                      </div>
                    </div>
                  </div>
                </section>

                {/* Location & Physics Section */}
                <section className={adminCommon.section} style={{ marginBottom: 16 }}>
                  <h2 className={adminCommon.sectionHeading}>Location &amp; Physics</h2>
                  <div className={adminCommon.details}>
                    <div className={adminStyles.editDiv}>
                      <label htmlFor="missionPlanet" className={adminStyles.editLabel}>
                        Planet
                      </label>
                      <select
                        id="missionPlanet"
                        className={adminCommon.formInput}
                        value={automergeMission.planet}
                        onChange={(event) => {
                          const planet = event.target.value as Planet;
                          changeAutomergeMission((m) => applyMissionPlanet(m, planet));
                        }}
                      >
                        {(Object.keys(PLANETS) as Planet[]).map((planet) => (
                          <option key={planet} value={planet}>
                            {PLANETS[planet].name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div id="landerLatDiv">
                      <div className={adminStyles.editDiv}>
                        <InLineEditInput
                          value={automergeMission.landerLocation.lat?.toString()}
                          editing={true}
                          fieldProps={{
                            name: "landerLocationLat",
                            ariaLabel: "Lander Location Latitude",
                            style: { width: "100%" },
                            validators: [validators.mustBeNumber, validators.required],
                            label: {
                              label: "Lander Location Latitude *",
                              className: adminStyles.editLabel,
                            },
                          }}
                          onSubmit={(value) => {
                            changeAutomergeMission((m: Mission) => {
                              m.landerLocation.lat = value ? +value : null;
                            });
                          }}
                          key={`${automergeMission.id}-landerLocation.lat`}
                          debounceSubmit={false}
                        />
                      </div>
                    </div>
                    <div id="landerLongDiv">
                      <div className={adminStyles.editDiv}>
                        <InLineEditInput
                          value={automergeMission.landerLocation.lng?.toString()}
                          editing={true}
                          fieldProps={{
                            name: "landerLocationLng",
                            ariaLabel: "Lander Location Longitude",
                            style: { width: "100%" },
                            validators: [validators.mustBeNumber, validators.required],
                            label: {
                              label: "Lander Location Longitude *",
                              className: adminStyles.editLabel,
                            },
                          }}
                          onSubmit={(value) => {
                            changeAutomergeMission((m: Mission) => {
                              m.landerLocation.lng = value ? +value : null;
                            });
                          }}
                          key={`${automergeMission.id}-landerLocation.lng`}
                          debounceSubmit={false}
                        />
                      </div>
                    </div>
                    <div id="landerEleDiv" className={adminStyles.editDiv}>
                      <span className={adminStyles.editLabel}>Lander Elevation (m)</span>
                      <output aria-label="Lander Elevation">
                        {automergeMission.landerElevationMeters?.toFixed(0) ?? "Unknown"}
                      </output>
                      <AsyncStatus {...elevationStatus} />
                      {elevationStatus.error && (
                        <button
                          type="button"
                          className={adminCommon.button}
                          onClick={() => setElevationAttempt((attempt) => attempt + 1)}
                        >
                          Retry elevation
                        </button>
                      )}
                      <p className={adminCommon.formHint}>
                        {!automergeMission.demFilePath
                          ? "Add a DEM below to determine the lander elevation automatically."
                          : automergeMission.landerLocation.lat == null ||
                              automergeMission.landerLocation.lng == null
                            ? "Set the lander latitude and longitude to calculate elevation from the DEM."
                            : "Elevation is calculated automatically from the DEM. If unavailable, check that the DEM covers the lander location."}
                      </p>
                    </div>
                  </div>
                </section>

                {/* EVA Defaults Section */}
                <section className={adminCommon.section} style={{ marginBottom: 16 }}>
                  <h2 className={adminCommon.sectionHeading}>EVA Defaults</h2>
                  <div className={adminCommon.details}>
                    <div id="initialZoomDiv">
                      <div className={adminStyles.editDiv}>
                        <InLineEditInput
                          value={automergeMission.initialZoom?.toString()}
                          editing={true}
                          fieldProps={{
                            name: "initialZoom",
                            ariaLabel: "Initial Zoom Level",
                            style: { width: "100%" },
                            validators: [validators.mustBeNumber],
                            label: {
                              label: "Initial Zoom Level",
                              className: adminStyles.editLabel,
                            },
                          }}
                          onSubmit={(value) => {
                            changeAutomergeMission((m: Mission) => {
                              m.initialZoom = +value || null;
                            });
                          }}
                          key={`${automergeMission.id}-initialZoom`}
                          debounceSubmit={false}
                        />
                      </div>
                    </div>
                    <div id="durationDiv">
                      <div className={adminStyles.editDiv}>
                        <InLineEditInput
                          value={automergeMission.defaultEvaDuration?.toString()}
                          editing={true}
                          fieldProps={{
                            name: "defaultEvaDuration",
                            ariaLabel: "Default EVA Duration",
                            style: { width: "100%" },
                            validators: [
                              validators.mustBeNumber,
                              validators.maxLength(4),
                              validators.mustBeInteger,
                            ],
                            label: {
                              label: "Default EVA Duration (mins)",
                              className: adminStyles.editLabel,
                            },
                          }}
                          onSubmit={(value) => {
                            changeAutomergeMission((m: Mission) => {
                              m.defaultEvaDuration = +value || null;
                            });
                          }}
                          key={`${automergeMission.id}-defaultEvaDuration`}
                          debounceSubmit={false}
                        />
                      </div>
                    </div>
                    <div id="traverseDiv">
                      <div className={adminStyles.editDiv}>
                        <InLineEditInput
                          value={automergeMission.traverseRate?.toString()}
                          editing={true}
                          fieldProps={{
                            name: "traverseRate",
                            ariaLabel: "Default Traverse Rate",
                            style: { width: "100%" },
                            validators: [validators.mustBeNumber, validators.maxLength(8)],
                            label: {
                              label: "Default Traverse Rate (km/h)",
                              className: adminStyles.editLabel,
                            },
                          }}
                          onSubmit={(value) => {
                            changeAutomergeMission((m: Mission) => {
                              m.traverseRate = +value || null;
                            });
                          }}
                          key={`${automergeMission.id}-traverseRate`}
                          debounceSubmit={false}
                        />
                      </div>
                    </div>
                    <div id="walkbackDiv">
                      <div className={adminStyles.editDiv}>
                        <InLineEditInput
                          value={automergeMission.walkbackRate?.toString()}
                          editing={true}
                          fieldProps={{
                            name: "walkbackRate",
                            ariaLabel: "Default Walkback Rate",
                            style: { width: "100%" },
                            validators: [validators.mustBeNumber, validators.maxLength(8)],
                            label: {
                              label: "Default Walkback Rate (km/h)",
                              className: adminStyles.editLabel,
                            },
                          }}
                          onSubmit={(value) => {
                            changeAutomergeMission((m: Mission) => {
                              m.walkbackRate = +value || null;
                            });
                          }}
                          key={`${automergeMission.id}-walkbackRate`}
                          debounceSubmit={false}
                        />
                      </div>
                    </div>
                  </div>
                </section>

                {/* Coordinate System */}
                <section className={adminCommon.section} style={{ marginBottom: 16 }}>
                  <h2 className={adminCommon.sectionHeading}>Coordinate System</h2>
                  <div className={adminCommon.details}>
                    <p>
                      Coordinates:{" "}
                      {isEarthGrid && automergeMission.serverFileGrid
                        ? `Uploaded grid (${automergeMission.serverFileGrid.name})`
                        : grid?.system
                          ? isEarthGrid
                            ? "Earth (WGS84 UTM/UPS)"
                            : "LGRS"
                          : "Latitude / Longitude"}
                      . The reference system is selected automatically from the mission planet.
                    </p>
                    {automergeMission.planet === "moon" && (
                      <p>
                        The LGRS grid is generated dynamically across the whole Moon. No grid upload
                        is needed.
                      </p>
                    )}
                    {isEarthGrid && (
                      <>
                        <p>
                          {automergeMission.serverFileGrid
                            ? "Using the uploaded Earth grid. Remove it to use the dynamic grid."
                            : "The Earth grid is generated dynamically. Upload a custom grid below when needed."}
                        </p>
                        <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
                          <legend className={adminStyles.editLabel}>Default Label Scheme</legend>
                          {(["lunar-acc", "mgrs"] as const).map((scheme) => (
                            <label key={scheme} className={adminCommon.checkboxItem}>
                              <input
                                type="radio"
                                name="earthGridLabelScheme"
                                checked={getMissionDefaultLabelScheme(automergeMission) === scheme}
                                onChange={() =>
                                  changeAutomergeMission((m) => {
                                    m.earthGridLabelScheme = scheme;
                                  })
                                }
                              />
                              {scheme === "mgrs" ? "MGRS" : "ACC (lunar-style letters)"}
                            </label>
                          ))}
                          <p className={adminCommon.formHint}>
                            Used for the dynamic grid. Users can override its labels from the map
                            menu.
                          </p>
                        </fieldset>
                      </>
                    )}
                    {grid && !grid.compatibility.compatible && grid.system && (
                      <p>{grid.compatibility.reason}</p>
                    )}
                    {automergeMission.planet === "mars" && (
                      <p>No dynamic grid is available for Mars.</p>
                    )}
                  </div>
                </section>

                {/* DEM Section */}
                <section className={adminCommon.section} style={{ marginBottom: 16 }}>
                  <h2 className={adminCommon.sectionHeading}>Digital Elevation Model (DEM)</h2>
                  <div className={adminCommon.details}>
                    <label htmlFor="missionDem" className={adminStyles.editLabel}>
                      DEM file
                    </label>
                    <select
                      id="missionDem"
                      className={adminCommon.formInput}
                      value={automergeMission.demFilePath}
                      disabled={!!demStatus.pending || !automergeMission.id}
                      onChange={(event) => {
                        const demFilePath = event.target.value;
                        const dem = dems.find((item) => item.filePath === demFilePath);
                        if (demFilePath && (!dem || dem.error)) return;
                        changeAutomergeMission((m) => {
                          m.demFilePath = demFilePath;
                          m.demResolution = dem?.resolution ?? null;
                          m.landerElevationMeters = null;
                        });
                      }}
                    >
                      <option value="">No DEM</option>
                      {automergeMission.demFilePath &&
                        !dems.some((dem) => dem.filePath === automergeMission.demFilePath) && (
                          <option value={automergeMission.demFilePath} disabled>
                            {automergeMission.demFilePath} (unavailable - refresh files)
                          </option>
                        )}
                      {dems.map((dem) => (
                        <option key={dem.filePath} value={dem.filePath} disabled={!!dem.error}>
                          {dem.filePath.slice(5)} -{" "}
                          {dem.error || `${formatDemResolution(dem.resolution)} m/pixel`}
                        </option>
                      ))}
                    </select>
                    <p className={adminCommon.formHint}>
                      GeoTIFFs in this mission's Data folder. Resolution is detected from the file.
                      {automergeMission.demFilePath &&
                        ` Current resolution: ${formatDemResolution(automergeMission.demResolution)} m/pixel.`}
                    </p>
                    <button
                      type="button"
                      className={adminCommon.buttonCancel}
                      disabled={!!demStatus.pending || !automergeMission.id}
                      onClick={refreshDems}
                    >
                      Refresh DEM files
                    </button>
                    <AsyncStatus {...demStatus} />
                  </div>
                </section>

                {/* Projection */}
                <Projection
                  automergeMission={automergeMission}
                  changeAutomergeMission={changeAutomergeMission}
                />

                {/* Maegistro V2 section */}
                <section className={adminCommon.section} style={{ marginBottom: 16 }}>
                  <h2 className={adminCommon.sectionHeading}>Maegistro V2</h2>
                  <div className={adminCommon.details}>
                    {automergeMission.maestroDocId ? (
                      <div>
                        <div className={adminCommon.definitionList}>
                          <div className={adminCommon.definitionRow}>
                            <span className={adminCommon.infoLabel}>maestroDocId</span>
                            <span className={adminCommon.infoValue}>
                              {automergeMission.maestroDocId}
                            </span>
                          </div>
                        </div>
                        <p className={adminCommon.formHint} style={{ marginTop: 10 }}>
                          This mission is linked to a Maestro project. To unlink, visit{" "}
                          <a
                            href="https://maestro-beta.fit.nasa.gov/admin/aegis"
                            target="_blank"
                            rel="noreferrer"
                            style={{ color: "#60a5fa" }}
                          >
                            Maestro Admin → AEGIS
                          </a>
                          , then use the Clear button below to remove the stored ID in AEGIS.
                        </p>
                        <div className={adminCommon.actionButtons} style={{ marginTop: 12 }}>
                          <button
                            className={adminCommon.buttonDanger}
                            type="button"
                            onClick={handleClearMaestroDocId}
                          >
                            Clear
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <p className={adminCommon.descriptionText} style={{ marginBottom: 12 }}>
                          Create a new Maestro project linked to this mission. The current user will
                          be set as the owner.
                        </p>
                        <div className={adminCommon.formGroup}>
                          <span className={adminCommon.formLabel}>Access Control</span>
                          <div
                            className={adminCommon.checkboxGroup}
                            style={{ flexDirection: "row", gap: 20 }}
                          >
                            <label className={adminCommon.checkboxItem}>
                              <input
                                type="radio"
                                name="maestroAccessControl"
                                value="public"
                                checked={maestroAccessControl === "public"}
                                onChange={() => setMaestroAccessControl("public")}
                              />
                              Public
                            </label>
                            <label className={adminCommon.checkboxItem}>
                              <input
                                type="radio"
                                name="maestroAccessControl"
                                value="private"
                                checked={maestroAccessControl === "private"}
                                onChange={() => setMaestroAccessControl("private")}
                              />
                              Private
                            </label>
                          </div>
                        </div>
                        <div className={adminCommon.statusMessage} style={{ marginTop: 8 }}>
                          <details>
                            <summary style={{ cursor: "pointer", color: "#94a3b8" }}>
                              Request params
                            </summary>
                            <pre
                              style={{
                                marginTop: 8,
                                fontSize: "0.75rem",
                                whiteSpace: "pre-wrap",
                                wordBreak: "break-all",
                                color: "#cbd5e1",
                              }}
                            >
                              {JSON.stringify(
                                {
                                  missionId: automergeMission.id,
                                  missionName: automergeMission.name,
                                  owners: maestroCurrentUser ? [maestroCurrentUser] : [],
                                  accessControl: maestroAccessControl,
                                },
                                null,
                                2
                              )}
                            </pre>
                          </details>
                        </div>
                        <div className={adminCommon.actionButtons} style={{ marginTop: 12 }}>
                          <button
                            className={adminCommon.buttonPrimary}
                            type="button"
                            disabled={maestroLoading || !automergeMission.id}
                            onClick={() =>
                              maestroStatus.run(
                                "Creating Maestro project...",
                                handleCreateMaestroProject
                              )
                            }
                          >
                            {maestroLoading ? "Creating…" : "Create Project"}
                          </button>
                          <AsyncStatus {...maestroStatus} />
                        </div>
                        {!automergeMission.id && (
                          <p className={adminCommon.formHint} style={{ marginTop: 8 }}>
                            Mission must be saved before linking to Maestro.
                          </p>
                        )}
                      </div>
                    )}

                    {maestroError && (
                      <div
                        className={adminCommon.statusMessage}
                        style={{ borderLeftColor: "#f87171", marginTop: 12 }}
                      >
                        <span className={adminCommon.statusDisconnected}>Error: </span>
                        {maestroError}
                      </div>
                    )}
                    {maestroResponseMeta && (
                      <div className={adminCommon.statusMessage} style={{ marginTop: 8 }}>
                        <details>
                          <summary style={{ cursor: "pointer", color: "#94a3b8" }}>
                            Response metadata
                          </summary>
                          <pre
                            style={{
                              marginTop: 8,
                              fontSize: "0.75rem",
                              whiteSpace: "pre-wrap",
                              wordBreak: "break-all",
                              color: "#cbd5e1",
                            }}
                          >
                            {JSON.stringify(maestroResponseMeta, null, 2)}
                          </pre>
                        </details>
                      </div>
                    )}
                  </div>
                </section>
              </div>

              <div>
                {/* File Manager Section */}
                <section className={adminCommon.section} style={{ marginBottom: 16 }}>
                  <h2 className={adminCommon.sectionHeading}>Mission Data Files</h2>
                  <p className={adminCommon.descriptionText}>
                    Manage files in the /Data folder for this mission.
                  </p>
                  <div className={adminCommon.details}>
                    {automergeMission?.id ? (
                      <FileManager
                        missionId={automergeMission.id}
                        path={`missionFiles/${automergeMission.id}/Data`}
                        zipOnly={false}
                        setFileList={setDataFiles}
                      />
                    ) : (
                      <div className={adminCommon.emptyState}>
                        A new mission must be saved first before you can upload files.
                      </div>
                    )}
                  </div>
                </section>

                {/* Grid Section */}
                {supportsUploadedGrid(automergeMission) && (
                  <AdminMissionGrid
                    missionId={automergeMission.id}
                    grid={automergeMission.serverFileGrid ?? null}
                  />
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
};

export default Mission;
