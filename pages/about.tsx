import type { NextPage } from "next";
import dynamic from "next/dynamic";
import styles from "./about.module.css";

const Head = dynamic(import("next/head"), {
  ssr: false,
});

const Left = () => {
  return (
    <div className={styles.left}>
      <div className={styles.logo}>
        <div
          className={styles.verticalCenter}
          style={{ cursor: "pointer" }}
          onClick={() => {
            window.open(
              "https://wiki.jsc.nasa.gov/exploration/index.php/Artemis_EVA_Geographic_Information_System",
              "_blank"
            );
          }}
        >
          <span className={styles.wordMark}>AEGIS</span>
        </div>
        <div className={styles.logoRight}>
          <img className={styles.meatball} src="/images/logo_NASA.svg" alt="NASA meatball" />
          <div
            className={styles.logoEmssWrapper}
            onClick={() => {
              window.open(
                "https://wiki.jsc.nasa.gov/exploration/index.php/EVA_Mission_System_Software",
                "_blank"
              );
            }}
          >
            <span className={styles.logoEmss}></span>
          </div>
        </div>
      </div>
      <div className={styles.description}>
        <div className={styles.strong}>Artemis EVA Geographic Information System</div>
        <p>
          Making maps meaningful and useful for EVA. A collaboration between JSC XI, CX, SK and JPL.
        </p>
      </div>

      <div className={styles.aboutSection}>
        <div className={styles.aboutSectionTitle}>Useful Links</div>
        <ul>
          <li>
            <a
              href={
                "https://wiki.jsc.nasa.gov/exploration/index.php/Artemis_EVA_Geographic_Information_System"
              }
              target={"_blank"}
            >
              About AEGIS
            </a>
          </li>
          <li>
            <a
              href={"https://wiki.jsc.nasa.gov/fod/index.php/EVA_Mission_Systems_Software"}
              target={"_blank"}
            >
              About the EMSS effort
            </a>
          </li>
        </ul>
        <div className={styles.aboutSectionTitle}>The Team</div>
        <ul className={styles.theTeamUl}>
          <li>
            <div>
              <a className={styles.teamName} href={"mailto:benjamin.f.feist@nasa.gov"}>
                Ben Feist
              </a>
            </div>
            <div className={styles.teamTitle}>
              Software Architecture Lead
              <br />
              <a className={styles.smallText} href={"mailto:benjamin.f.feist@nasa.gov"}>
                Email for help
              </a>
            </div>
          </li>
          <li>
            <div className={styles.creditHeading}>
              <a className={styles.teamName} href={"mailto:david.w.charney@nasa.gov"}>
                David Charney
              </a>
            </div>
            <div className={styles.teamTitle}>Interaction and Visual Design</div>
          </li>

          <li>
            <div className={styles.creditHeading}>
              <a className={styles.teamName} href={"mailto:matthew.j.miller-1@nasa.gov"}>
                Matthew Miller
              </a>
            </div>
            <div className={styles.teamTitle}>
              Project Management,
              <br />
              Concept Design
            </div>
          </li>
          <li>
            <div className={styles.creditHeading}>
              <a className={styles.teamName} href={"mailto:edwin.j.montalvo@nasa.gov"}>
                James Montalvo
              </a>
            </div>
            <div className={styles.teamTitle}>EMSS Lead</div>
          </li>
        </ul>
      </div>
    </div>
  );
};

const Right = () => {
  return <div className={styles.right}></div>;
};

const Home: NextPage = () => {
  return (
    <>
      <Head>
        <title>{process.env.NEXT_PUBLIC_TITLE}</title>
      </Head>
      <div className={styles.main}>
        <Left />
        <Right />
      </div>
    </>
  );
};
export default Home;
