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
        await router.push("/"); //user is not logged in or an admin. Redirect to homepage
      } else {
        setAdmin(true);
      }
    })();
  }, [router]);

  const tileLoop = [
    {
      title: "Missions",
      description: "Modify existing missions or add new ones",
      button: "Add/Edit Missions",
      onClick: navigateMission,
    },
    {
      title: "Users",
      description: "Register new users, or edit the old ones",
      button: "Register or Edit Users",
      onClick: navigateUser,
    },
  ];

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
                  {tileLoop.map((tile) => (
                    <div key={tile.title} className={styles.actionTile}>
                      <div className={styles.content}>
                        <h2 className={styles.title}>{tile.title}</h2>
                        <div className={styles.description}>
                          <p>{tile.description}</p>
                        </div>
                        <button className={styles.button} onClick={tile.onClick}>
                          {tile.button}
                        </button>
                      </div>
                    </div>
                  ))}
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
