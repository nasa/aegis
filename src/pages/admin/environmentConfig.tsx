import type { FunctionComponent } from "react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { isLoggedIn } from "http-client/login";
import { getAllEnvironmentConfigs, setEnvironmentConfigValue } from "http-client/environmentConfig";
import adminCommon from "./adminCommon.module.css";

const EnvironmentConfig: FunctionComponent = () => {
  const navigate = useNavigate();

  const [configs, setConfigs] = useState<EnvironmentConfigData[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const loginRes = await isLoggedIn();
      if (loginRes.status !== "success" || !loginRes.data.isSuperAdmin) {
        navigate("/");
        return;
      }

      const configRes = await getAllEnvironmentConfigs();
      if (configRes.status === "success") {
        setConfigs(configRes.data);
      } else {
        setLoadError(configRes.message ?? "Failed to load environment configs.");
      }
    })();
  }, [navigate]);

  const handleEntryUpdated = (updated: EnvironmentConfigData) => {
    setConfigs((prev) => (prev ? prev.map((c) => (c.key === updated.key ? updated : c)) : prev));
  };

  return (
    <main className={adminCommon.page}>
      <div className={adminCommon.container}>
        <Link to="/admin" className={adminCommon.backLink}>
          ← Admin
        </Link>
        <h1 className={adminCommon.pageTitle}>Environment Configuration</h1>

        <p style={{ color: "#94a3b8", margin: 0 }}>
          These values apply to every mission on this AEGIS instance. Each entry has a default
          sourced from the deployment environment and an optional override stored in the database.
          Leave the override blank to fall back to the environment default.
        </p>

        {loadError && <p style={{ color: "#f87171", fontSize: "0.9rem" }}>{loadError}</p>}

        {configs?.length === 0 && (
          <p style={{ color: "#94a3b8" }}>No environment config entries are registered.</p>
        )}

        {configs?.map((entry) => (
          <EnvironmentConfigEntry key={entry.key} entry={entry} onUpdated={handleEntryUpdated} />
        ))}
      </div>
    </main>
  );
};

export default EnvironmentConfig;

// ─── Single entry card ───────────────────────────────────────────────────────

const EnvironmentConfigEntry: FunctionComponent<{
  entry: EnvironmentConfigData;
  onUpdated: (updated: EnvironmentConfigData) => void;
}> = ({ entry, onUpdated }) => {
  const [input, setInput] = useState<string>(entry.config?.value ?? "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Keep the input in sync when the parent hands us a fresh entry.
  useEffect(() => {
    setInput(entry.config?.value ?? "");
  }, [entry.config?.value]);

  const flashSuccess = () => {
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const save = async (newValue: string | null) => {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    const res = await setEnvironmentConfigValue(entry.key, newValue);
    setSaving(false);
    if (res.status === "success") {
      onUpdated(res.data);
      flashSuccess();
    } else {
      setSaveError(res.message ?? "Failed to save.");
    }
  };

  const handleSave = () => save(input.trim() || null);
  const handleClear = () => save(null);

  return (
    <section className={adminCommon.section}>
      <h2 className={adminCommon.sectionHeading}>
        <code>{entry.key}</code>
      </h2>
      <div className={adminCommon.details}>
        {entry.config?.description && (
          <p style={{ margin: 0, color: "#94a3b8", fontSize: "0.9rem" }}>
            {entry.config.description}
          </p>
        )}

        <dl className={adminCommon.definitionList} style={{ marginTop: "12px" }}>
          <div className={adminCommon.definitionRow}>
            <dt style={dtStyle}>Default (from env)</dt>
            <dd style={ddStyle}>
              <code>{formatValue(entry.defaultValue)}</code>
            </dd>
          </div>

          <div className={adminCommon.definitionRow}>
            <dt style={dtStyle}>Database Value</dt>
            <dd style={ddStyle}>
              <code>{formatValue(entry.config?.value ?? null)}</code>
            </dd>
          </div>

          <div className={adminCommon.definitionRow}>
            <dt style={dtStyle}>Effective value</dt>
            <dd style={{ ...ddStyle, display: "flex", alignItems: "center", gap: "8px" }}>
              <code>{formatValue(entry.effectiveValue)}</code>
              {entry.isOverridden ? (
                <span style={badgeOverride}>(override active)</span>
              ) : (
                <span style={badgeDefault}>(env default)</span>
              )}
            </dd>
          </div>

          <div className={adminCommon.definitionRow}>
            <dt style={dtStyle}>Created</dt>
            <dd style={ddStyle}>{formatTimestamp(entry.config?.createdAt ?? null)}</dd>
          </div>

          <div className={adminCommon.definitionRow}>
            <dt style={dtStyle}>Updated</dt>
            <dd style={ddStyle}>{formatTimestamp(entry.config?.updatedAt ?? null)}</dd>
          </div>
        </dl>

        <div style={{ marginTop: "20px" }}>
          <label htmlFor={`env-${entry.key}`} style={labelStyle}>
            Override value
          </label>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <input
              id={`env-${entry.key}`}
              className={adminCommon.formInput}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={entry.defaultValue ?? "(no default)"}
              style={{ flex: 1 }}
            />
            <button className={adminCommon.buttonPrimary} onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save Override"}
            </button>
            {entry.isOverridden && (
              <button className={adminCommon.buttonDanger} onClick={handleClear} disabled={saving}>
                Clear Override
              </button>
            )}
          </div>
          <p style={{ marginTop: "6px", color: "#64748b", fontSize: "0.85rem" }}>
            Leave blank to use the environment default
            {entry.defaultValue ? ` (${entry.defaultValue}).` : "."}
          </p>
          {saveError && (
            <p style={{ color: "#f87171", marginTop: "8px", fontSize: "0.9rem" }}>{saveError}</p>
          )}
          {saveSuccess && (
            <p style={{ color: "#4ade80", marginTop: "8px", fontSize: "0.9rem" }}>Saved.</p>
          )}
        </div>
      </div>
    </section>
  );
};

// ─── Small style helpers ─────────────────────────────────────────────────────

const dtStyle: React.CSSProperties = {
  color: "#94a3b8",
  fontSize: "0.9rem",
  fontWeight: 600,
  padding: "6px 0",
};

const ddStyle: React.CSSProperties = { padding: "6px 0", margin: 0 };

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: "6px",
  color: "#94a3b8",
  fontWeight: 600,
};

const badgeOverride: React.CSSProperties = {
  color: "#f59e0b",
  fontWeight: 600,
  fontSize: "0.85rem",
};

const badgeDefault: React.CSSProperties = {
  color: "#4ade80",
  fontWeight: 600,
  fontSize: "0.85rem",
};

const formatValue = (v: string | null): string => (v === null || v === "" ? "(not set)" : v);

const formatTimestamp = (iso: string | null): string => {
  if (!iso) return "(never)";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
};
