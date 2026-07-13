import type { FunctionComponent } from "react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { isLoggedIn } from "http-client/login";
import { getEnvironmentConfig, setEnvironmentConfigOverride } from "http-client/environmentConfig";
import adminCommon from "./adminCommon.module.css";

const EnvironmentConfig: FunctionComponent = () => {
  const navigate = useNavigate();

  const [config, setConfig] = useState<EnvironmentConfigData | null>(null);
  const [overrideInput, setOverrideInput] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    (async () => {
      const loginRes = await isLoggedIn();
      if (loginRes.status !== "success" || !loginRes.data.isSuperAdmin) {
        navigate("/");
        return;
      }

      const configRes = await getEnvironmentConfig();
      if (configRes.status === "success") {
        setConfig(configRes.data);
        setOverrideInput(configRes.data.urlOverride ?? "");
      }
    })();
  }, [navigate]);

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    const urlOverride = overrideInput.trim() || null;
    const res = await setEnvironmentConfigOverride(urlOverride);

    setSaving(false);
    if (res.status === "success") {
      setConfig(res.data);
      setOverrideInput(res.data.urlOverride ?? "");
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } else {
      setSaveError(res.message ?? "Failed to save.");
    }
  };

  const handleClear = async () => {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    const res = await setEnvironmentConfigOverride(null);

    setSaving(false);
    if (res.status === "success") {
      setConfig(res.data);
      setOverrideInput("");
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } else {
      setSaveError(res.message ?? "Failed to clear override.");
    }
  };

  if (!config) return null;

  return (
    <main className={adminCommon.page}>
      <div className={adminCommon.container}>
        <Link to="/admin" className={adminCommon.backLink}>
          ← Admin
        </Link>
        <h1 className={adminCommon.pageTitle}>Environment Configuration</h1>

        <section className={adminCommon.section}>
          <h2 className={adminCommon.sectionHeading}>Maestro Connection</h2>
          <div className={adminCommon.details}>
            <dl className={adminCommon.definitionList}>
              <div className={adminCommon.definitionRow}>
                <dt
                  style={{
                    color: "#94a3b8",
                    fontSize: "0.9rem",
                    fontWeight: 600,
                    padding: "6px 0",
                  }}
                >
                  Default URL (from env)
                </dt>
                <dd style={{ padding: "6px 0", margin: 0 }}>
                  <code>{config.defaultUrl}</code>
                </dd>
              </div>

              <div className={adminCommon.definitionRow}>
                <dt
                  style={{
                    color: "#94a3b8",
                    fontSize: "0.9rem",
                    fontWeight: 600,
                    padding: "6px 0",
                  }}
                >
                  Effective URL
                </dt>
                <dd
                  style={{
                    padding: "6px 0",
                    margin: 0,
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <code>{config.effectiveUrl}</code>
                  {config.isOverridden ? (
                    <span style={{ color: "#f59e0b", fontWeight: 600, fontSize: "0.85rem" }}>
                      (override active)
                    </span>
                  ) : (
                    <span style={{ color: "#4ade80", fontWeight: 600, fontSize: "0.85rem" }}>
                      (env default)
                    </span>
                  )}
                </dd>
              </div>
            </dl>

            <div style={{ marginTop: "20px" }}>
              <label
                htmlFor="urlOverride"
                style={{ display: "block", marginBottom: "6px", color: "#94a3b8", fontWeight: 600 }}
              >
                URL Override
              </label>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <input
                  id="urlOverride"
                  className={adminCommon.formInput}
                  type="text"
                  value={overrideInput}
                  onChange={(e) => setOverrideInput(e.target.value)}
                  placeholder={`e.g. ${config.defaultUrl}`}
                  style={{ flex: 1 }}
                />
                <button
                  className={adminCommon.buttonPrimary}
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? "Saving…" : "Save Override"}
                </button>
                {config.isOverridden && (
                  <button
                    className={adminCommon.buttonDanger}
                    onClick={handleClear}
                    disabled={saving}
                  >
                    Clear Override
                  </button>
                )}
              </div>
              <p style={{ marginTop: "6px", color: "#64748b", fontSize: "0.85rem" }}>
                Leave blank to use the environment default ({config.defaultUrl}).
              </p>
              {saveError && (
                <p style={{ color: "#f87171", marginTop: "8px", fontSize: "0.9rem" }}>
                  {saveError}
                </p>
              )}
              {saveSuccess && (
                <p style={{ color: "#4ade80", marginTop: "8px", fontSize: "0.9rem" }}>Saved.</p>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
};

export default EnvironmentConfig;
