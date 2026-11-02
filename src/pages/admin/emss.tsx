import AsyncStatus from "components/admin/asyncStatus";
import { useAsyncStatus } from "components/admin/useAsyncStatus";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { isLoggedIn } from "http-client/login";
import React from "react";
import adminCommon from "./adminCommon.module.css";

const Emss: React.FunctionComponent = () => {
  const loading = useAsyncStatus("Loading EMSS API status...");
  const { run: runLoad } = loading;
  const navigate = useNavigate();
  const action = useAsyncStatus();
  const [isEmssApiEnabled, setIsEmssApiEnabled] = useState<boolean>(null);

  //on load check login
  useEffect(() => {
    runLoad("Loading EMSS API status...", async () => {
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
      if (!emssRes.ok) throw new Error(`Unable to read API status (${emssRes.status})`);
      const emssData = await emssRes.json();
      setIsEmssApiEnabled(emssData.data);
    });
  }, [navigate, runLoad]);

  const toggleEmssApi = async () => {
    if (isEmssApiEnabled) {
      const response = confirm("Are you sure you want to turn off the EMSS API?");
      if (!response) return;
    }
    const updateRes = await fetch(`/api/v1/emss/enableEmssApi`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ enable: !isEmssApiEnabled }),
    });
    if (!updateRes.ok) throw new Error(`Unable to update API status (${updateRes.status})`);
    // Fetch updated status
    const emssRes = await fetch(`/api/v1/emss/enableEmssApi`);
    if (!emssRes.ok) throw new Error(`Unable to read API status (${emssRes.status})`);
    setIsEmssApiEnabled((await emssRes.json()).data);
  };

  return (
    <main className={adminCommon.page}>
      <div className={adminCommon.container}>
        <Link to="/admin" className={adminCommon.backLink}>
          ← Admin
        </Link>
        <h1 className={adminCommon.pageTitle}>EMSS </h1>
        <AsyncStatus {...loading} />
        <AsyncStatus {...action} />

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
                    {isEmssApiEnabled === null ? "Loading..." : isEmssApiEnabled ? "Yes" : "No"}
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
                disabled={
                  !!loading.pending ||
                  !!loading.error ||
                  !!action.pending ||
                  isEmssApiEnabled === null
                }
                onClick={() => action.run("Updating EMSS API status...", toggleEmssApi)}
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
