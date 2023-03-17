import { NextPage } from "next";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { isLoggedIn, isAdmin } from "http-client/internal-api";
import styles from "components/admin/admin.module.css";
import Header from "components/interface/header";

const Index: NextPage = () => {
  const router = useRouter();
  const [admin, setAdmin] = useState(false);
  const navigateMission = () => {
    router.push("/admin/mission");
  };

  const navigateUser = () => {
    router.push("/admin/user");
  };

  //on load check login and mission id
  useEffect(() => {
    (async () => {
      const response = await isLoggedIn(); //check user is logged in
      const adminResponse = await isAdmin(); //check user is admin
      if (response.status !== "success" || !adminResponse.data["admin"]) {
        router.push("/"); //user is not logged in or an admin. Redirect to homepage
      } else {
        setAdmin(true);
      }
    })();
  }, [router]);

  return (
    <>
      {admin ? (
        <>
          <div>
            <div className={styles.pageStyle}>
              <div className={styles.header}>
                <Header />
              </div>
              <div className={styles.bodyContent}>
                <div className={styles.actionTileContainer}>
                  <div className={styles.actionTile}>
                    <div className={styles.content}>
                      <h2 className={styles.title}>Missions</h2>
                      <div className={styles.description}>
                        <p>Modify existing missions or add new ones</p>
                      </div>
                      <button className={styles.button} onClick={navigateMission}>
                        Add/Edit Missions
                      </button>
                    </div>
                  </div>
                  <div className={styles.actionTile}>
                    <div className={styles.content}>
                      <h2 className={styles.title}>Users</h2>
                      <div className={styles.description}>
                        <p>Register new users, or edit the old ones</p>
                      </div>
                      <button className={styles.button} onClick={navigateUser}>
                        Register or Edit Users
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : (
        <></>
      )}
    </>
  );
};

export default Index;
