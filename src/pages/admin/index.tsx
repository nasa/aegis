import type { FunctionComponent } from "react";
import { Link } from "react-router";
import adminCommon from "./adminCommon.module.css";
import styles from "./index.module.css";

interface NavCardProps {
  to: string;
  title: string;
  description: string;
}

const NavCard: FunctionComponent<NavCardProps> = ({ to, title, description }) => {
  return (
    <Link to={to} className={styles.navCard}>
      <h3 className={styles.navCardTitle}>{title}</h3>
      <p className={styles.navCardDescription}>{description}</p>
    </Link>
  );
};

const Index: React.FunctionComponent = () => {
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
                description="Search everyone who has signed in and manage their per-mission grants."
              />
              <NavCard
                to="/admin/group"
                title="Groups"
                description="Manage groups, their members, and the missions each group can reach."
              />
              <NavCard
                to="/admin/serverSocketStatus"
                title="Visitor Activity"
                description="Real-time monitoring of all connected visitors organized by mission."
              />
              <NavCard
                to="/admin/environmentConfig"
                title="Environment Configuration"
                description="Configure server / environment settings that apply to all missions running on this instance."
              />
              <NavCard
                to="/admin/maestroV2"
                title="Maegistro v2 Monitor"
                description="Monitor Maegistro v2 connections on /api/socket on the /maestro/v2 namespace."
              />
            </nav>
          </div>
        </section>
      </div>
    </main>
  );
};

export default Index;
