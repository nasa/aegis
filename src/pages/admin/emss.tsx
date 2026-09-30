import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { isLoggedIn } from "http-client/login";
import React from "react";
import adminCommon from "./adminCommon.module.css";

const Emss: React.FunctionComponent = () => {
  const navigate = useNavigate();
  const [isEmssApiEnabled, setIsEmssApiEnabled] = useState<boolean>(null);

  //on load check login
  useEffect(() => {
    (async () => {
      const response = await isLoggedIn();
      if (response.status === "success") {
        const user = response.data;
        if (!user.isSuperAdmin) {
          navigate("/"); //Redirect to homepage
        }
      } else {
        navigate("/");
      }
      // Fetch initial EMSS API status
      const emssRes = await fetch(`/api/v1/emss/enableEmssApi`);
      const emssData = await emssRes.json();
      setIsEmssApiEnabled(emssData.data);
    })();
  }, [navigate]);

  const toggleEmssApi = async () => {
    try {
      if (isEmssApiEnabled) {
        const response = confirm("Are you sure you want to turn off the EMSS API?");
        if (!response) return;
      }
      await fetch(`/api/v1/emss/enableEmssApi`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ enable: !isEmssApiEnabled }),
      });
      // Fetch updated status
      const emssRes = await fetch(`/api/v1/emss/enableEmssApi`);
      setIsEmssApiEnabled((await emssRes.json()).data);
    } catch (error) {
      console.error("Error toggling EMSS API status:", error);
    }
  };

  return (
    <main className={adminCommon.page}>
      <div className={adminCommon.container}>
        <Link to="/admin" className={adminCommon.backLink}>
          ← Admin
        </Link>
        <h1 className={adminCommon.pageTitle}>EMSS </h1>

        <section className={adminCommon.section}>
          <h2>EMSS API Controls</h2>
          <div className={adminCommon.details}>
            <div className={adminCommon.definitionList}>
              <div className={adminCommon.definitionRow}>
                <dt>EMSS API Enabled</dt>
                <dd>
                  <span
                    className={
                      isEmssApiEnabled
                        ? adminCommon.statusConnected
                        : adminCommon.statusDisconnected
                    }
                  >
                    {isEmssApiEnabled ? "Yes" : "No"}
                  </span>
                </dd>
              </div>
            </div>
            <p className={adminCommon.descriptionText}>
              Disabling the EMSS API will block the EMSS Token causing any connections validating
              via the token to be rejected.
            </p>
            <div className={adminCommon.formActions}>
              <button
                className={isEmssApiEnabled ? adminCommon.buttonDanger : adminCommon.buttonSuccess}
                onClick={toggleEmssApi}
              >
                {isEmssApiEnabled ? "Turn Off" : "Turn On"}
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
};

export default Emss;
