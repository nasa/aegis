import type { FunctionComponent } from "react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { isLoggedIn } from "http-client/login";
import adminCommon from "./adminCommon.module.css";
import styles from "./index.module.css";

interface NavCardProps {
  to: string;
  title: string;
  description: string;
  enabled: boolean;
}

const NavCard: FunctionComponent<NavCardProps> = ({ to, title, description, enabled }) => {
  if (!enabled) {
    return (
      <div className={styles.disabledCard}>
        <h3 className={styles.navCardTitle}>{title}</h3>
        <p className={styles.navCardDescription}>{description}</p>
      </div>
    );
  }
  return (
    <Link to={to} className={styles.navCard}>
      <h3 className={styles.navCardTitle}>{title}</h3>
      <p className={styles.navCardDescription}>{description}</p>
    </Link>
  );
};

const Index: React.FunctionComponent = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<AppUser>(null);

  useEffect(() => {
    async function adminCheck() {
      const response = await isLoggedIn();
      if (response.status === "success") {
        const user = response.data;
        if (user.isAdmin || user.isSuperAdmin) {
          setUser(user);
        } else {
          navigate("/");
        }
      } else {
        navigate("/");
      }
    }
    adminCheck().catch(() => {
      // Something went wrong. Eventually would like a logger here.
    });
  }, [navigate]);

  if (!(user?.isAdmin || user?.isSuperAdmin)) {
    return null;
  }

  return (
    <main className={adminCommon.page}>
      <div className={adminCommon.container}>
        <header className={styles.pageHeader}>
          <div className={styles.headerLeft}>
            <img src="/images/EMSS.svg" alt="EMSS Emblem" className={styles.emblem} />
            <div>
              <h1 className={styles.wordMark}>AEGIS</h1>
              <p className={adminCommon.introText}>
                Manage missions, users, monitor system status, and configure application settings.
              </p>
            </div>
          </div>
          <div className={styles.headerRight}>
            <div className={styles.logoEmss} title="EMSS" />
            <img src="/images/logo_NASA.svg" alt="NASA" className={styles.meatball} />
          </div>
        </header>

        {/* Mission Management */}
        <section className={adminCommon.section} aria-labelledby="mission-management-heading">
          <h2 id="mission-management-heading" className={adminCommon.sectionHeading}>
            Mission Management
          </h2>
          <div className={adminCommon.details}>
            <nav className={styles.navGrid} aria-label="Mission management navigation">
              <NavCard
                to="/admin/missions"
                title="Missions"
                description="Create, edit, duplicate, and manage mission configurations and GIS data."
                enabled={true}
              />
            </nav>
          </div>
        </section>

        {/* User & System Management */}
        <section className={adminCommon.section} aria-labelledby="system-management-heading">
          <h2 id="system-management-heading" className={adminCommon.sectionHeading}>
            User &amp; System Management
          </h2>
          <div className={adminCommon.details}>
            <nav className={styles.navGrid} aria-label="System management navigation">
              <NavCard
                to="/admin/user"
                title="Users"
                description="Register new users, manage permissions, and configure access controls."
                enabled={!!user?.isSuperAdmin}
              />
              <NavCard
                to="/admin/serverSocketStatus"
                title="Visitor Activity"
                description="Real-time monitoring of all connected visitors organized by mission."
                enabled={!!user?.isSuperAdmin}
              />
              <NavCard
                to="/admin/environmentConfig"
                title="Environment Configuration"
                description="Configure server / environment settings that apply to all missions running on this instance."
                enabled={!!user?.isSuperAdmin}
              />
              <NavCard
                to="/admin/maestroV1"
                title="Maegistro v1 Monitor (Legacy)"
                description="Monitor legacy Maegistro v1 connections on /api/v1/socketio on the /maestro namespace."
                enabled={!!user?.isSuperAdmin}
              />
              <NavCard
                to="/admin/maestroV2"
                title="Maegistro v2 Monitor"
                description="Monitor Maegistro v2 connections on /socket on the /maestro/v2 namespace."
                enabled={!!user?.isSuperAdmin}
              />
              <NavCard
                to="/admin/emss"
                title="EMSS"
                description="Manage EMSS API Token."
                enabled={!!user?.isSuperAdmin}
              />
            </nav>
          </div>
        </section>
      </div>
    </main>
  );
};

export default Index;
