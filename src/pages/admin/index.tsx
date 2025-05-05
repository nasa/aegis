import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { isLoggedIn } from "http-client/login";
import styles from "components/admin/admin.module.css";
import Header from "components/interface/header";

const Index: React.FunctionComponent = () => {
  const navigate = useNavigate();
  const [admin, setAdmin] = useState(false);
  const [user, setUser] = useState<User>(null);
  const navigateMission = async () => {
    await navigate("/admin/missions");
  };

  const navigateUser = async () => {
    await navigate("/admin/user");
  };

  const navigatePOI = async () => {
    await navigate("/admin/poi");
  };

  //on load check login and mission id
  useEffect(() => {
    async function adminCheck() {
      const response = await isLoggedIn();
      if (response.status === "success") {
        const user = response.data.user;
        if (user.isAdmin || user.isSuperAdmin) {
          setAdmin(true);
          setUser(user);
        } else {
          navigate("/"); //Redirect to homepage
        }
      } else {
        navigate("/");
      }
    }
    adminCheck().catch(() => {
      // Something went wrong. Eventually would like a logger here.
    });
  }, [navigate]);

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
      description: "Register new users, or edit the old ones (super admin only)",
      button: "Register or Edit Users",
      onClick: navigateUser,
      userOneOnly: user && user.isSuperAdmin,
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
