import type { NextPage } from "next";
import { useEffect, useMemo, useState } from "react";
import { useAppDispatch } from "utils/useAppDispatch";
import { useAppSelector, shallowEqual } from "utils/useAppSelector";
import dynamic from "next/dynamic";
import { useRouter } from "next/router";

import styles from "./mission.module.css";
import { setMissionPerms, setUserStore } from "store/user";
import { Tooltip } from "react-tooltip";
import _ from "lodash";
import { isLoggedIn } from "http-client/login";

/** Dynamically import the whole framework because nothing likes NextJS */
const LeftControlPanel = dynamic(
  import("components/interface/side-controls").then((mod) => mod.LeftControlPanel),
  {
    ssr: false,
  }
);
const RightControlPanel = dynamic(
  import("components/interface/side-controls").then((mod) => mod.RightControlPanel),
  {
    ssr: false,
  }
);

const SunEarthPosition = dynamic(import("components/interface/map/map-sunearth"), {
  ssr: false,
});
const Header = dynamic(import("components/interface/header"), {
  ssr: false,
});

const BottomControlPanel = dynamic(
  import("components/interface/side-controls").then((mod) => mod.BottomControlPanel),
  {
    ssr: false,
  }
);

const SocketClient = dynamic(import("components/interface/page/socketClient"), {
  ssr: false,
});

const PopulateStore = dynamic(import("components/interface/page/populateStore"), {
  ssr: false,
});

const Main: NextPage = () => {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const missionStore = useAppSelector((state) => state.mission, shallowEqual);

  //local state to ensure permissions have been checked first before running the other useEffects
  const [hasPermissions, setHasPermissions] = useState(false);

  const { id } = router.query;
  const intMissionId = parseInt(Array.isArray(id) ? id[0] : id);

  // changed this implementation to use useMemo with the dynamic import because Next 13 decided to compile leaflet even though ssr: false was set
  const MapBody = useMemo(
    () =>
      dynamic(() => import("components/interface/map/map-body-leaflet"), {
        loading: () => <p>A map is loading</p>,
        ssr: false,
      }),
    []
  );

  /**
   * On initial load, set the missionId and sessionId in sessionStorage
   */
  useEffect(() => {
    //put missionId in sessionStorage
    window.sessionStorage.setItem("missionId", intMissionId.toString());
    //put a null socketId in sessionStorage
    window.sessionStorage.setItem("socketId", "null");
  }, [intMissionId]);

  /**
   * Check if user is logged in and if the user has permissions for this mission page
   * If not, redirect them to the home page.
   */

  useEffect(() => {
    if (!intMissionId) return;
    (async () => {
      const response = await isLoggedIn();
      //Check if user is logged in.
      if (response.status === "success") {
        dispatch(setUserStore({ isLoggedIn: true, user: response.data.user, missionPerms: null }));

        //Check for permissions to this mission
        if (response.data.user.isSuperAdmin) {
          //super admin always has permissions
          dispatch(
            setMissionPerms({ missionId: intMissionId, permissions: { view: true, edit: true } })
          );
        } else {
          const perms = response.data.user.permissionList?.find(
            (permission) => permission.missionId === intMissionId
          );
          if (!perms || (!perms.permissions.view && !perms.permissions.edit)) router.push("/"); //Redirect to homepage
          dispatch(setMissionPerms(perms));
        }
        setHasPermissions(true);
      } else {
        router.push("/");
      }
    })();
  }, [router, intMissionId, dispatch]);

  const showSunEarth: boolean =
    missionStore.mission &&
    (missionStore.mission.earthAzimuthVisible || missionStore.mission.sunAzimuthVisible);

  return (
    <>
      {hasPermissions && (
        <div className={styles.page}>
          <Tooltip
            id="aegis-tooltip"
            className={styles.tooltip}
            clickable={true}
            delayShow={1000}
            delayHide={500}
          />
          <div className={styles.header}>
            <Header />
          </div>
          <div className={styles.body}>
            <div className={styles.bodyLeft}>
              <div className={styles.leftUpper}>
                <div className={styles.leftControl}>
                  <LeftControlPanel />
                </div>
                <div className={styles.mapBody}>
                  {missionStore.mission && missionStore.layers && <MapBody />}
                  {showSunEarth && <SunEarthPosition />}
                </div>
              </div>
              <BottomControlPanel />
            </div>
            <RightControlPanel />
          </div>

          <SocketClient missionId={intMissionId} />
          <PopulateStore missionId={intMissionId} hasPermissions={hasPermissions} />
        </div>
      )}
    </>
  );
};

export default Main;
