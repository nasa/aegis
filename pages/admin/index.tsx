import { NextPage } from "next";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { isAdmin } from "http-client/login";
import styles from "components/admin/admin.module.css";
import Header from "components/interface/header";

const Index: NextPage = () => {
  const router = useRouter();
  const [admin, setAdmin] = useState(false);
  const [user, setUser] = useState<User>(null);
  const navigateMission = async () => {
    await router.push("/admin/mission");
  };

  const navigateUser = async () => {
    await router.push("/admin/user");
  };

  const navigatePOI = async () => {
    await router.push("/admin/poi");
  };

  //on load check login and mission id
  useEffect(() => {
    async function adminCheck() {
      const adminResponse = await isAdmin(); //check user is admin
      if (!adminResponse.data["admin"]) {
        await router.push("/"); //user is not logged in or an admin. Redirect to homepage
      } else {
        setAdmin(true);
        setUser(adminResponse.data["user"]);
      }
    }
    adminCheck().catch(() => {
      // Something went wrong. Eventually would like a logger here.
    });
  }, [router]);

  const tileLoop = [
    {
      title: "Missions",
      description: "Modify existing missions or add new ones",
      button: "Add/Edit Missions",
      onClick: navigateMission,
      userOneOnly: true,
    },
    {
      title: "Users",
      description: "Register new users, or edit the old ones",
      button: "Register or Edit Users",
      onClick: navigateUser,
      userOneOnly: user && user.id === 1,
    },
    {
      title: "POIs",
      description: "Add new POIs or edit existing ones",
      button: "Add/Edit POIs",
      onClick: navigatePOI,
      userOneOnly: true,
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
                    <div
                      key={tile.title}
                      className={tile.userOneOnly ? styles.actionTile : styles.disabledTile}
                    >
                      <div className={styles.content}>
                        <h2 className={styles.title}>{tile.title}</h2>
                        <div className={styles.description}>
                          <p>{tile.description}</p>
                        </div>
                        <button
                          className={tile.userOneOnly ? styles.button : styles.disabledButton}
                          onClick={tile.onClick}
                          disabled={!tile.userOneOnly}
                        >
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
        <>
          <span>Access Denied</span>
        </>
      )}
    </>
  );
};

export default Index;
