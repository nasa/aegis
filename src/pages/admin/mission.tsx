import { useCallback, useEffect } from "react";
import { Link, useParams } from "react-router";
import adminStyles from "components/admin/admin.module.css";
import { useDocument } from "@automerge/automerge-repo-react-hooks";
import { getElevationSinglePoint } from "http-client/elevation";
import FileManager from "components/admin/fileManager";
import { InLineEditInput, TextArea } from "components/interface/form/globalFields";
import { validators } from "components/interface/form/formValidators";
import Projection from "components/admin/projection";
import adminCommon from "./adminCommon.module.css";
import type { AutomergeUrl } from "@automerge/automerge-repo";

type RouteParams = {
  id: string;
  automergeUrl: string;
};

const Mission: React.FunctionComponent = () => {
  const params = useParams<RouteParams>();
  // Access the automerge mission document via the useDocument hook instead of the
  // useMissionDocSelector (to read) and useDocHandle (to write). This is because for this
  // component, in particular, we access most/all of the properties of mission and it is simpler
  const [automergeMission, changeMissionDoc] = useDocument<Mission>(
    params.automergeUrl as AutomergeUrl
  );

  // wrapper to also update the updatedAt field when any change is made
  const changeAutomergeMission = useCallback(
    (updateFn: (m: Mission) => void) => {
      changeMissionDoc((m: Mission) => {
        updateFn(m);
        m.updatedAt = new Date().getTime();
      });
    },
    [changeMissionDoc]
  );

  useEffect(() => {
    //put missionId in sessionStorage
    window.sessionStorage.setItem("missionId", params.id.toString()); //there's no id on a new mission
    //put a null socketId in sessionStorage
    window.sessionStorage.setItem("socketId", "null");
  }, [params]);

  //calculate the lander elevation based on the lander location
  const calcLanderElevation = useCallback(async () => {
    if (!automergeMission) return;
    if (
      !automergeMission.landerLocation.lat ||
      !automergeMission.landerLocation.lat ||
      !automergeMission.planetRadius ||
      !automergeMission.demFilePath
    ) {
      alert("Missing data. Must have lander location lat/lng, planet radius, and demFilePath");
    }

    const elevation = (
      await getElevationSinglePoint(
        automergeMission.id,
        automergeMission.demFilePath,
        automergeMission.landerLocation,
        automergeMission.planetRadius
      )
    ).data;

    // save back out to automerge doc
    changeAutomergeMission((m: Mission) => {
      m.landerElevationMeters = elevation;
    });
  }, [automergeMission, changeAutomergeMission]);

  return (
    <main className={adminCommon.page}>
      <div className={adminCommon.container}>
        <Link to="/admin/missions" className={adminCommon.backLink}>
          ← Missions
        </Link>
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
                    <div id="planetRadiusDiv">
                      <div className={adminStyles.editDiv}>
                        <InLineEditInput
                          value={automergeMission.planetRadius?.toString()}
                          editing={true}
                          fieldProps={{
                            name: "planetRadius",
                            ariaLabel: "Planet Radius",
                            style: { width: "100%" },
                            validators: [validators.mustBeNumber, validators.maxLength(8)],
                            label: {
                              label: "Planet Radius (m)",
                              className: adminStyles.editLabel,
                            },
                          }}
                          onSubmit={(value) => {
                            changeAutomergeMission((m: Mission) => {
                              m.planetRadius = +value || null;
                            });
                          }}
                          key={`${automergeMission.id}-planetRadius`}
                          debounceSubmit={false}
                        />
                        <span className={adminCommon.formHint}>
                          (Moon: 1737400, Earth: 6378137)
                        </span>
                      </div>
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
                              m.landerLocation.lat = +value || null;
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
                              m.landerLocation.lng = +value || null;
                            });
                          }}
                          key={`${automergeMission.id}-landerLocation.lng`}
                          debounceSubmit={false}
                        />
                      </div>
                    </div>
                    <div id="landerEleDiv">
                      <div className={adminStyles.editDiv}>
                        <InLineEditInput
                          value={automergeMission.landerElevationMeters?.toString()}
                          editing={true}
                          fieldProps={{
                            name: "landerElevationMeters",
                            ariaLabel: "Lander Location Elevation",
                            style: { width: "100%" },
                            validators: [validators.mustBeNumber],
                            label: {
                              label: "Lander Location Elevation",
                              className: adminStyles.editLabel,
                            },
                          }}
                          onSubmit={(value) => {
                            changeAutomergeMission((m: Mission) => {
                              m.landerElevationMeters = +value || null;
                            });
                          }}
                          key={`${automergeMission.id}-landerElevationMeters`}
                          debounceSubmit={false}
                        />
                        <button
                          className={adminCommon.button}
                          type="button"
                          onClick={() => {
                            calcLanderElevation();
                          }}
                        >
                          Calculate
                        </button>
                        <span className={adminCommon.formHint}>
                          {" "}
                          Lander Location must have value for elevation graph to show
                        </span>
                      </div>
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
                    <div id="usingLGRSCoordinates">
                      <div className={adminStyles.editDiv}>
                        <label className={adminCommon.checkboxItem}>
                          <input
                            type="checkbox"
                            checked={!!automergeMission.usingLGRSCoordinates}
                            onChange={(e) => {
                              changeAutomergeMission((m: Mission) => {
                                m.usingLGRSCoordinates = e.target.checked;
                              });
                            }}
                          />
                          Using LGRS Coordinate System
                        </label>
                      </div>
                    </div>
                  </div>
                </section>

                {/* DEM Section */}
                <section className={adminCommon.section} style={{ marginBottom: 16 }}>
                  <h2 className={adminCommon.sectionHeading}>Digital Elevation Model (DEM)</h2>
                  <div className={adminCommon.details}>
                    <div id="demFilePathDiv">
                      <div className={adminStyles.editDiv}>
                        <InLineEditInput
                          value={automergeMission.demFilePath}
                          editing={true}
                          fieldProps={{
                            name: "demFilePath",
                            ariaLabel: "DEM File Path",
                            style: { width: "100%" },
                            label: { label: "DEM File Path", className: adminStyles.editLabel },
                          }}
                          onSubmit={(value) => {
                            changeAutomergeMission((m: Mission) => {
                              m.demFilePath = value || "";
                            });
                          }}
                          key={`${automergeMission.id}-demFilePath`}
                          debounceSubmit={false}
                        />
                      </div>
                    </div>
                    <div id="demResolutionDiv">
                      <div className={adminStyles.editDiv}>
                        <InLineEditInput
                          value={automergeMission.demResolution?.toString()}
                          editing={true}
                          fieldProps={{
                            name: "demResolution",
                            ariaLabel: "DEM Resolution",
                            style: { width: "100%" },
                            validators: [
                              validators.mustBeNumber,
                              validators.mustBeInteger,
                              validators.maxLength(8),
                            ],
                            label: {
                              label: "DEM Resolution (m per pixel)",
                              className: adminStyles.editLabel,
                            },
                          }}
                          onSubmit={(value) => {
                            changeAutomergeMission((m: Mission) => {
                              m.demResolution = +value || null;
                            });
                          }}
                          key={`${automergeMission.id}-demResolution`}
                          debounceSubmit={false}
                        />
                      </div>
                    </div>
                  </div>
                </section>

                {/* Projection */}
                <Projection
                  automergeMission={automergeMission}
                  changeAutomergeMission={changeAutomergeMission}
                />
              </div>

              <div>
                {/* File Manager Section */}
                <section className={adminCommon.section}>
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
                      />
                    ) : (
                      <div className={adminCommon.emptyState}>
                        A new mission must be saved first before you can upload files.
                      </div>
                    )}
                  </div>
                </section>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
};

export default Mission;
