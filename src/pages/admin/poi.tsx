import { ChangeEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { isLoggedIn } from "http-client/login";
import { getPOIs, upsertPOIs } from "http-client/poi";
import styles from "components/admin/admin.module.css";
import Header from "components/interface/header";
import { getMissions } from "http-client/mission";
import { faArrowAltCircleLeft } from "@fortawesome/free-regular-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { decodeEmoji, roundDateToSecond } from "utils/formatting";
import { GeoJsonFile } from "typings/geojson";
import { validators } from "components/interface/form/formValidators";
import { Feature } from "geojson";

const PoiPage: React.FunctionComponent = () => {
  const navigate = useNavigate();
  const mustBeValidJSON = validators.mustBeValidJSON;
  const [missionList, setMissionList] = useState<Mission[]>([]);
  const [mission, setMission] = useState<Mission>();
  const [admin, setAdmin] = useState<boolean>(false);
  const [errorList, setErrorList] = useState<string[]>([]);
  const [poiList, setPoiList] = useState<POI[]>([]);
  const [tempPOI, setTempPOI] = useState<string>("");
  const [progressBarWidth, setProgressBarWidth] = useState<number>(0);
  const [progressBarText, setProgressBarText] = useState<string>("");
  const [progressBarColor, setProgressBarColor] = useState<string>("#00ff00");
  //get current user data
  const [currentUser, setCurrentUser] = useState<AppUser>();
  //on load check login and mission id
  useEffect(() => {
    const isLoggedInAsync = async () => {
      const response = await isLoggedIn();
      if (response.status === "success") {
        const user = response.data;
        if (user.isAdmin || user.isSuperAdmin) {
          setAdmin(true);
          setCurrentUser(user);
        } else {
          navigate("/"); //Redirect to homepage
        }
      } else {
        navigate("/");
      }

      const missions = (await getMissions()).data;
      setMissionList(missions);
    };
    isLoggedInAsync();
  }, [navigate]);

  const handleBack = () => {
    if (mission) {
      setMission(undefined);
      setTempPOI("");
    } else {
      navigate("/admin");
    }
  };

  const handleMissionSelect = async (mission: Mission) => {
    setMission(mission);
    // put mission id in session so api endpoints don't fail
    sessionStorage.setItem("missionId", mission.id.toString());
    // get POIS from mission
    const pois = await getPOIs(mission.id);
    setPoiList(pois.data);
  };

  async function updatePOITemp(event: ChangeEvent<HTMLTextAreaElement>) {
    setTempPOI(event.target.value);
  }

  async function handlePOIImport(): Promise<void> {
    const geoJsonPOIs: GeoJsonFile = JSON.parse(tempPOI);
    if (geoJsonPOIs) {
      const errorHolder = [];
      if (geoJsonPOIs.features.length > 0) {
        for (const poi of geoJsonPOIs.features) {
          //Assign a random emoji
          let emoji: string;

          if (!poi.properties.emoji) {
            emoji = "26AA"; // Default to a white/grey dot.
          } else {
            emoji = poi.properties.emoji;
          }

          const poiData: POI = {
            missionId: mission.id,
            ownerId: currentUser.id,
            actionOrderUuids: [],
            priorityOverride: 0,
            elevation: null,
            radius: 5,
            status: "Candidate",
            tags: [],
            uuid: "",
            name: poi.properties.name,
            description: poi.properties.description ? poi.properties.description : "",
            location: {
              lat: poi.properties.y,
              lng: poi.properties.x,
            },
            icon: emoji,
            updatedAt: roundDateToSecond(new Date()).toISOString(),
            createdAt: roundDateToSecond(new Date()).toISOString(),
          };
          const poiSet = await upsertPOIs([poiData]);
          if (poiSet.status !== "success") {
            if (poi.properties.name) {
              errorHolder.push(poi.properties.name);
            } else {
              errorHolder.push("Unnamed POI");
            }
          }
        }
      }
      // set progress bar to 100
      setProgressBarWidth(100);
      setProgressBarText("Import Complete");
      setProgressBarColor("#00ff00");
      setErrorList(errorHolder);
    }
    await handleMissionSelect(mission);
  }

  async function handlePOIExport(): Promise<void> {
    // Get all POIS
    setProgressBarWidth(0);
    setProgressBarText("Looking for POIs");
    setProgressBarColor("#00ff00");
    const pois = await getPOIs(mission.id);
    if (!pois.data) {
      setProgressBarText("No POIs to export");
      return;
    }
    setProgressBarWidth(25);
    setProgressBarText("Exporting POIs");
    // Make sure the POIs conform to geojson
    const geoJsonPOIs: GeoJsonFile = {
      type: "FeatureCollection",
      features: [],
      _metadata: {
        name: mission.name,
        file_description: "Exported from AEGIS",
        file_owner: "AEGIS-" + currentUser.username,
        public: true,
        hidden: false,
      },
    };
    for (const poi of pois.data) {
      if (!poi.location) {
        continue; // not worth exporting
      }
      const feature: Feature = {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [poi.location.lng, poi.location.lat],
        },
        properties: {
          name: poi.name,
          description: poi.description,
          emoji: poi.icon,
        },
      };
      geoJsonPOIs.features.push(feature);
    }
    // Export the POIs
    setTempPOI(JSON.stringify(geoJsonPOIs, null, 2));
    setProgressBarWidth(100);
    setProgressBarText("Export Complete");
  }

  async function handlePOIDownload(): Promise<void> {
    if (!tempPOI) {
      setProgressBarText("No POIs to download");
      return;
    }

    setProgressBarWidth(0);
    setProgressBarText("Downloading POIs");
    setProgressBarColor("#00ff00");
    try {
      if (tempPOI) {
        const tempPOIJson = JSON.parse(tempPOI);
        const element = document.createElement("a");
        const file = new Blob([JSON.stringify(tempPOIJson)], { type: "text/plain" });
        element.href = URL.createObjectURL(file);
        element.download = tempPOIJson._metadata.name + ".geojson";
        document.body.appendChild(element); // Required for this to work in FireFox
        element.click();
        setProgressBarWidth(100);
        setProgressBarText("Download Complete");
      } else {
        setProgressBarText("No POIs to download");
      }
    } catch (e) {
      setProgressBarWidth(100);
      setProgressBarText("Error Downloading POIs");
      setProgressBarColor("#ff0000");
    }
  }

  return (
    <>
      {admin ? (
        <div className={styles.pageStyle}>
          <div className={styles.header}>
            <Header />
          </div>
          <div className={styles.bodyContent}>
            {!mission ? (
              <>
                <h1 className={styles.centerHeader}>Select Mission</h1>
                <div className={styles.backButton}>
                  <FontAwesomeIcon icon={faArrowAltCircleLeft} size="xl" onClick={handleBack} />
                </div>
              </>
            ) : (
              <>
                <h1 className={styles.centerHeader}>Upload POIs</h1>

                <div className={styles.backButton}>
                  <FontAwesomeIcon icon={faArrowAltCircleLeft} size="xl" onClick={handleBack} />
                </div>
              </>
            )}
            {!mission ? (
              <div className={styles.body}>
                <div className={styles.missionList}>
                  {missionList?.map((mission) => {
                    if (
                      currentUser.isSuperAdmin ||
                      currentUser.permissionList.some(
                        (p) => p.missionId === mission.id && p.permissions.edit === true
                      )
                    ) {
                      return (
                        <div className={styles.mission} key={mission.id}>
                          <div
                            className={styles.missionName}
                            onClick={() => {
                              handleMissionSelect(mission);
                            }}
                          >
                            <h3>{mission.name}</h3>
                          </div>
                        </div>
                      );
                    } else {
                      return (
                        <div className={styles.mission} key={mission.id}>
                          <div className={styles.missionDisabled}>
                            <h3>
                              {mission.name}
                              <span className={styles.smallGrey}>no edit permission</span>
                            </h3>
                          </div>
                        </div>
                      );
                    }
                  })}
                </div>
              </div>
            ) : (
              <div className={styles.body}>
                <div className={styles.leftPanel}>
                  <div className={styles.importMission}>
                    <div className={styles.rightFlexCenter}>
                      <div className={styles.configDiv}>
                        <label className={styles.title} htmlFor="configImport">
                          <span className={styles.label}>Import/Export POIs w/(geojson)</span>
                        </label>

                        <textarea
                          id="configImport"
                          className={styles.configImport}
                          value={tempPOI}
                          onChange={updatePOITemp}
                        />
                        <div className={styles.progressBarContainer}>
                          <div
                            className={styles.progressBar}
                            style={{
                              width: `${progressBarWidth}%`,
                              backgroundColor: progressBarColor,
                            }}
                          >
                            <div
                              className={styles.progressBarFill}
                              style={{
                                width: `${progressBarWidth}%`,
                                backgroundColor: progressBarColor,
                              }}
                            />
                          </div>
                          <div className={styles.progressBarText}>{progressBarText}</div>
                        </div>
                        <div className={styles.buttonContainer}>
                          <button
                            type="button"
                            className={styles.importButton}
                            onClick={() => {
                              if (tempPOI.length && mustBeValidJSON(tempPOI) === undefined) {
                                setProgressBarText("Importing POIs");
                                handlePOIImport();
                              } else {
                                setProgressBarText("Invalid/Missing JSON");
                                setProgressBarColor("#ff0000");
                                setProgressBarWidth(100);
                              }
                            }}
                          >
                            Import Json
                          </button>
                          <button
                            className={styles.exportButton}
                            type="button"
                            onClick={() => {
                              handlePOIExport();
                            }}
                          >
                            Export Json
                          </button>
                          <button
                            type={"button"}
                            className={styles.downloadButton}
                            onClick={() => {
                              handlePOIDownload();
                            }}
                          >
                            Download Json
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  {errorList.length > 0 ? (
                    <div className={styles.errorList}>
                      <div className={styles.errorListContainer}>
                        <p className={styles.errorHeader}>The following could not be uploaded:</p>
                        {errorList.map((error) => (
                          <div className={styles.errorListItem} key={error}>
                            <p>{error}</p>
                          </div>
                        ))}
                        <span className={styles.smallText}>
                          Did you forget to add a name, or lat lng??
                        </span>
                      </div>
                    </div>
                  ) : (
                    <></>
                  )}
                </div>
                <div className={styles.rightPanel}>
                  <div className={styles.poiList}>
                    {poiList.map((poi) => (
                      <div className={styles.poiCard} key={poi.uuid}>
                        <div className={styles.poiIcon}>{decodeEmoji(poi.icon)}</div>
                        <div className={styles.poiName}>
                          <h3>{poi.name}</h3>
                        </div>
                        <div>
                          <div className={styles.poiDescription}>
                            <p>{poi.description}</p>
                          </div>
                          <div className={styles.poiLocation}>
                            {poi.location !== null ? (
                              <>
                                <p>Lat: {poi.location.lat.toFixed(5)}</p>
                                <p>Lng: {poi.location.lng.toFixed(5)}</p>
                              </>
                            ) : (
                              <p>Location not set</p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <></>
      )}
    </>
  );
};

export default PoiPage;
