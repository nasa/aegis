import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { isLoggedIn } from "http-client/login";
import styles from "components/admin/admin.module.css";
import Header from "components/interface/header";

const Index: React.FunctionComponent = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<AppUser>(null);
  const navigateMission = async () => {
    navigate("/admin/missions");
  };

  const navigateUser = async () => {
    navigate("/admin/user");
  };

  const navigateVisitors = async () => {
    navigate("/admin/serverSocketStatus");
  };

  const navigateEmss = async () => {
    navigate("/admin/emss");
  };

  //on load check login
  useEffect(() => {
    async function adminCheck() {
      const response = await isLoggedIn();
      if (response.status === "success") {
        const user = response.data;
        if (user.isAdmin || user.isSuperAdmin) {
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
      enabled: true,
    },
    {
      title: "Users",
      description: "Register new users, or edit the old ones (super admin only)",
      button: "Register or Edit Users",
      onClick: navigateUser,
      enabled: user?.isSuperAdmin,
    },
    {
      title: "Visitors",
      description: "View data on current visitors via sockets",
      button: "View",
      onClick: navigateVisitors,
      enabled: user?.isSuperAdmin,
    },
    {
      title: "EMSS",
      description: "View data on current EMSS connections",
      button: "View",
      onClick: navigateEmss,
      enabled: user?.isSuperAdmin,
    },
  ];

  return (
    <>
      {user?.isAdmin || user?.isSuperAdmin ? (
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
                      className={tile.enabled ? styles.actionTile : styles.disabledTile}
                    >
                      <div className={styles.content}>
                        <h2 className={styles.title}>{tile.title}</h2>
                        <div className={styles.description}>
                          <p>{tile.description}</p>
                        </div>
                        <button
                          className={tile.enabled ? styles.button : styles.disabledButton}
                          onClick={tile.onClick}
                          disabled={!tile.enabled}
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
