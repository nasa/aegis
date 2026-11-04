import AsyncStatus from "components/admin/asyncStatus";
import { useAsyncStatus } from "components/admin/useAsyncStatus";
import type { FunctionComponent } from "react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { isLoggedIn } from "http-client/login";
import { getMissionSummaries } from "http-client/mission";
import {
  createNotificationBanner,
  deleteNotificationBanner,
  getAllNotificationBanners,
  updateNotificationBanner,
} from "http-client/notificationBanner";
import bannerStyles from "components/page/notificationBannerBar.module.css";
import adminCommon from "./adminCommon.module.css";

const MAX_MESSAGE_LENGTH = 500;
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const WHITE_TEXT_COLOR = "#FFFFFF";
const BLACK_TEXT_COLOR = "#000000";
// Text color is stored as hex, but the editor only offers white and black
const TEXT_COLOR_OPTIONS = [
  { label: "White", textColor: WHITE_TEXT_COLOR },
  { label: "Black", textColor: BLACK_TEXT_COLOR },
];

/** Preset background colors and the text color that reads best on each. */
const PRESET_BANNER_COLORS = {
  green: { backgroundColor: "#15803D", textColor: WHITE_TEXT_COLOR },
  blue: { backgroundColor: "#1D4ED8", textColor: WHITE_TEXT_COLOR },
  red: { backgroundColor: "#B91C1C", textColor: WHITE_TEXT_COLOR },
  orange: { backgroundColor: "#C2410C", textColor: WHITE_TEXT_COLOR },
  yellow: { backgroundColor: "#FACC15", textColor: BLACK_TEXT_COLOR },
} as const satisfies Record<string, { backgroundColor: string; textColor: string }>;

const BANNER_STATUS_COLORS = {
  Active: "#4ade80",
  Scheduled: "#60a5fa",
  Expired: "#94a3b8",
  Disabled: "#f87171",
} as const;

/** Formats a UTC ISO time in the viewer's local time zone, including the zone name. */
function formatBannerTime(isoTime: string, timeZone?: string): string {
  return new Date(isoTime).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    timeZone,
  });
}

const NotificationBanners: FunctionComponent = () => {
  const loading = useAsyncStatus("Loading notification banners...");
  const { run: runLoad } = loading;
  const navigate = useNavigate();

  const [banners, setBanners] = useState<NotificationBanner[] | null>(null);
  const [missions, setMissions] = useState<MissionSummary[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  // null: no editor open; "new": creating; otherwise the banner being edited
  const [editing, setEditing] = useState<NotificationBanner | "new" | null>(null);

  useEffect(() => {
    runLoad("Loading notification banners...", async () => {
      const loginRes = await isLoggedIn();
      if (loginRes.status !== "success" || !loginRes.data.isSuperAdmin) {
        navigate("/");
        return;
      }

      const [bannerRes, missionRes] = await Promise.all([
        getAllNotificationBanners(),
        // The banner list is still usable without mission names
        getMissionSummaries().catch((): null => null),
      ]);
      if (bannerRes.status === "success") {
        setBanners(bannerRes.data ?? []);
      } else {
        setLoadError(bannerRes.message ?? "Failed to load notification banners.");
      }
      if (missionRes?.status === "success") {
        setMissions(missionRes.data ?? []);
      }
    });
  }, [navigate, runLoad]);

  const missionNameById = new Map(missions.map((mission) => [mission.id, mission.name]));

  const handleSaved = (saved: NotificationBanner) => {
    setBanners((previous) => {
      const others = (previous ?? []).filter((banner) => banner.id !== saved.id);
      return [saved, ...others].sort((a, b) => (b.id ?? 0) - (a.id ?? 0));
    });
    setEditing(null);
  };

  const handleDeleted = (id: number) => {
    setBanners((previous) => (previous ?? []).filter((banner) => banner.id !== id));
    if (editing !== "new" && editing?.id === id) setEditing(null);
  };

  return (
    <main className={adminCommon.page}>
      <div className={adminCommon.container}>
        <Link to="/admin" className={adminCommon.backLink}>
          ← Admin
        </Link>
        <h1 className={adminCommon.pageTitle}>Notification Banners</h1>
        <AsyncStatus {...loading} />

        <p style={mutedText}>
          Banners appear at the top of every page except the dashboard. Application-wide banners
          show everywhere, including the homepage. Mission banners show only on the selected
          missions&apos; mission pages. Open pages update without a refresh. Users can dismiss a
          banner until they refresh the page.
        </p>
        <p style={mutedText}>
          <strong>Note:</strong> Banners never show on the dashboard page, for any scope.
        </p>

        {loadError && <p style={errorText}>{loadError}</p>}

        {editing === null && banners && (
          <div>
            <button className={adminCommon.buttonPrimary} onClick={() => setEditing("new")}>
              New Banner
            </button>
          </div>
        )}

        {editing !== null && (
          <BannerEditor
            key={editing === "new" ? "new" : editing.id}
            banner={editing === "new" ? null : editing}
            missions={missions}
            onSaved={handleSaved}
            onCancel={() => setEditing(null)}
          />
        )}

        {banners?.length === 0 && (
          <p style={mutedText}>No notification banners have been created.</p>
        )}

        {banners?.map((banner) => (
          <BannerCard
            key={banner.id}
            banner={banner}
            missionNameById={missionNameById}
            onEdit={() => setEditing(banner)}
            onSaved={handleSaved}
            onDeleted={handleDeleted}
          />
        ))}
      </div>
    </main>
  );
};

export default NotificationBanners;

// ─── Banner card ─────────────────────────────────────────────────────────────

const BannerCard: FunctionComponent<{
  banner: NotificationBanner;
  missionNameById: Map<number, string>;
  onEdit: () => void;
  onSaved: (saved: NotificationBanner) => void;
  onDeleted: (id: number) => void;
}> = ({ banner, missionNameById, onEdit, onSaved, onDeleted }) => {
  const action = useAsyncStatus();
  const busy = !!action.pending;
  const status = getBannerStatus(banner, new Date());

  const handleToggleEnabled = () =>
    action.run(banner.enabled ? "Disabling banner..." : "Enabling banner...", async () => {
      if (banner.id === null) throw new Error("Banner has no id.");
      const res = await updateNotificationBanner(banner.id, {
        ...clearServerSetFields(banner),
        enabled: !banner.enabled,
      });
      if (res.status !== "success") throw new Error(res.message ?? "Failed to save.");
      onSaved(res.data);
    });

  const handleDelete = () => {
    if (!window.confirm("Delete this notification banner?")) return;
    action.run("Deleting banner...", async () => {
      if (banner.id === null) throw new Error("Banner has no id.");
      const res = await deleteNotificationBanner(banner.id);
      if (res.status !== "success") throw new Error(res.message ?? "Failed to delete.");
      onDeleted(banner.id);
    });
  };

  const scopeLabel =
    banner.scope === "application"
      ? "Application-wide"
      : banner.missionIds
          .map((missionId) =>
            missionNameById.has(missionId)
              ? `${missionNameById.get(missionId)} (${missionId})`
              : `(deleted mission ${missionId})`
          )
          .join(", ");

  return (
    <section className={adminCommon.section}>
      <h2 className={adminCommon.sectionHeading}>
        Banner {banner.id}
        <span style={{ ...statusBadge, color: BANNER_STATUS_COLORS[status] }}>{status}</span>
      </h2>
      <div className={adminCommon.details}>
        <AsyncStatus {...action} />
        <BannerPreview
          message={banner.message}
          backgroundColor={banner.backgroundColor}
          textColor={banner.textColor}
        />

        <dl className={adminCommon.definitionList} style={{ marginTop: "12px" }}>
          <div className={adminCommon.definitionRow}>
            <dt style={dtStyle}>Shows on</dt>
            <dd style={ddStyle}>{scopeLabel}</dd>
          </div>
          <div className={adminCommon.definitionRow}>
            <dt style={dtStyle}>Starts</dt>
            <dd style={ddStyle}>
              <TimeWithUtc isoTime={banner.startsAt} emptyLabel="Immediately" />
            </dd>
          </div>
          <div className={adminCommon.definitionRow}>
            <dt style={dtStyle}>Ends</dt>
            <dd style={ddStyle}>
              <TimeWithUtc isoTime={banner.endsAt} emptyLabel="No end time" />
            </dd>
          </div>
          <div className={adminCommon.definitionRow}>
            <dt style={dtStyle}>Colors</dt>
            <dd style={ddStyle}>
              <code>{banner.backgroundColor}</code> background, <code>{banner.textColor}</code> text
            </dd>
          </div>
        </dl>

        <div className={adminCommon.formActions}>
          <button className={adminCommon.buttonPrimary} onClick={onEdit} disabled={busy}>
            Edit
          </button>
          <button
            className={adminCommon.buttonCancel}
            onClick={handleToggleEnabled}
            disabled={busy}
          >
            {banner.enabled ? "Disable" : "Enable"}
          </button>
          <button className={adminCommon.buttonDanger} onClick={handleDelete} disabled={busy}>
            Delete
          </button>
        </div>
      </div>
    </section>
  );
};

// ─── Editor form ─────────────────────────────────────────────────────────────

const BannerEditor: FunctionComponent<{
  banner: NotificationBanner | null;
  missions: MissionSummary[];
  onSaved: (saved: NotificationBanner) => void;
  onCancel: () => void;
}> = ({ banner, missions, onSaved, onCancel }) => {
  const action = useAsyncStatus();
  const saving = !!action.pending;
  const [values, setValues] = useState<NotificationBannerFormValues>(() =>
    toFormValues(banner, missions)
  );
  // Raw text of the hex field, so partially typed values are not rejected while typing
  const [hexText, setHexText] = useState(values.backgroundColor);
  const [missionFilter, setMissionFilter] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  const setValue = <K extends keyof NotificationBannerFormValues>(
    key: K,
    value: NotificationBannerFormValues[K]
  ) => setValues((previous) => ({ ...previous, [key]: value }));

  const selectedPreset = Object.entries(PRESET_BANNER_COLORS).find(
    ([, preset]) => preset.backgroundColor === values.backgroundColor.toUpperCase()
  )?.[0];

  const selectPreset = (preset: keyof typeof PRESET_BANNER_COLORS) => {
    const { backgroundColor, textColor } = PRESET_BANNER_COLORS[preset];
    setValues((previous) => ({ ...previous, backgroundColor, textColor }));
    setHexText(backgroundColor);
  };

  const setCustomColor = (hex: string) => {
    setHexText(hex);
    if (HEX_COLOR_PATTERN.test(hex)) setValue("backgroundColor", hex.toUpperCase());
  };

  const toggleMission = (missionId: number) =>
    setValue(
      "missionIds",
      values.missionIds.includes(missionId)
        ? values.missionIds.filter((id) => id !== missionId)
        : [...values.missionIds, missionId]
    );

  const handleSave = () => {
    const errorMessage = getFormError(values, hexText);
    setValidationError(errorMessage);
    if (errorMessage) return;

    action.run("Saving banner...", async () => {
      const requestBanner = toBannerFromForm(values);
      if (banner && banner.id === null) throw new Error("Banner has no id.");
      const res = banner
        ? await updateNotificationBanner(banner.id, requestBanner)
        : await createNotificationBanner(requestBanner);
      if (res.status !== "success") throw new Error(res.message ?? "Failed to save.");
      onSaved(res.data);
    });
  };

  const filteredMissions = missions.filter((mission) =>
    `${mission.name} ${mission.id}`.toLowerCase().includes(missionFilter.trim().toLowerCase())
  );

  return (
    <section className={adminCommon.section}>
      <h2 className={adminCommon.sectionHeading}>
        {banner ? `Edit Banner ${banner.id}` : "New Banner"}
      </h2>
      <div className={adminCommon.details}>
        <AsyncStatus {...action} />
        <div className={adminCommon.form}>
          <div className={adminCommon.formGroup}>
            <label htmlFor="banner-message" className={adminCommon.formLabel}>
              Message
            </label>
            <textarea
              id="banner-message"
              className={adminCommon.formInput}
              rows={3}
              maxLength={MAX_MESSAGE_LENGTH}
              value={values.message}
              onChange={(e) => setValue("message", e.target.value)}
            />
            <span className={adminCommon.formHint}>
              {values.message.length} / {MAX_MESSAGE_LENGTH} characters
            </span>
          </div>

          <label className={adminCommon.checkboxItem}>
            <input
              type="checkbox"
              checked={values.enabled}
              onChange={(e) => setValue("enabled", e.target.checked)}
            />
            Enabled (uncheck to turn the banner off regardless of its time window)
          </label>

          <TimeWindowInput
            id="banner-starts-at"
            label="Start time"
            noLimitLabel="Start immediately"
            value={values.startsAtLocal}
            onChange={(value) => setValue("startsAtLocal", value)}
          />
          <TimeWindowInput
            id="banner-ends-at"
            label="End time"
            noLimitLabel="No end time"
            value={values.endsAtLocal}
            onChange={(value) => setValue("endsAtLocal", value)}
          />

          <div className={adminCommon.formGroup}>
            <span className={adminCommon.formLabel}>Shows on</span>
            <label className={adminCommon.checkboxItem}>
              <input
                type="radio"
                name="banner-scope"
                checked={values.scope === "application"}
                onChange={() => setValue("scope", "application")}
              />
              Application-wide (every page except the dashboard, including the homepage)
            </label>
            <label className={adminCommon.checkboxItem}>
              <input
                type="radio"
                name="banner-scope"
                checked={values.scope === "missions"}
                onChange={() => setValue("scope", "missions")}
              />
              Specific missions (mission pages only)
            </label>
            {values.scope === "missions" && (
              <div style={{ marginLeft: "26px" }}>
                <input
                  className={adminCommon.formInput}
                  type="text"
                  placeholder="Filter missions by name or id"
                  value={missionFilter}
                  onChange={(e) => setMissionFilter(e.target.value)}
                  style={{ width: "100%", boxSizing: "border-box" }}
                />
                <div className={adminCommon.checkboxGroup} style={missionListStyle}>
                  {filteredMissions.map((mission) => (
                    <label key={mission.id} className={adminCommon.checkboxItem}>
                      <input
                        type="checkbox"
                        checked={values.missionIds.includes(mission.id)}
                        onChange={() => toggleMission(mission.id)}
                      />
                      {mission.name} ({mission.id}){mission.archivedAt ? " — archived" : ""}
                    </label>
                  ))}
                  {filteredMissions.length === 0 && (
                    <span style={mutedText}>No missions match.</span>
                  )}
                </div>
                <span className={adminCommon.formHint}>
                  {values.missionIds.length} mission(s) selected
                </span>
              </div>
            )}
          </div>

          <div className={adminCommon.formGroup}>
            <span className={adminCommon.formLabel}>Background color</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
              {(Object.keys(PRESET_BANNER_COLORS) as (keyof typeof PRESET_BANNER_COLORS)[]).map(
                (preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => selectPreset(preset)}
                    aria-pressed={selectedPreset === preset}
                    style={{
                      ...swatchStyle,
                      backgroundColor: PRESET_BANNER_COLORS[preset].backgroundColor,
                      color: PRESET_BANNER_COLORS[preset].textColor,
                      outline: selectedPreset === preset ? "3px solid #e2e8f0" : "none",
                    }}
                  >
                    {preset}
                  </button>
                )
              )}
              <input
                type="color"
                aria-label="Custom background color"
                value={values.backgroundColor.toLowerCase()}
                onChange={(e) => setCustomColor(e.target.value)}
                style={{ width: "44px", height: "34px", padding: 0, border: "none" }}
              />
              <input
                className={adminCommon.formInput}
                type="text"
                aria-label="Custom background hex value"
                value={hexText}
                onChange={(e) => setCustomColor(e.target.value.trim())}
                placeholder="#RRGGBB"
                style={{ width: "110px" }}
              />
              {!selectedPreset && <span style={mutedText}>(custom)</span>}
            </div>
          </div>

          <div className={adminCommon.formGroup}>
            <span className={adminCommon.formLabel}>Text color</span>
            <div style={{ display: "flex", gap: "16px" }}>
              {TEXT_COLOR_OPTIONS.map(({ label, textColor }) => (
                <label key={textColor} className={adminCommon.checkboxItem}>
                  <input
                    type="radio"
                    name="banner-text-color"
                    checked={values.textColor.toUpperCase() === textColor}
                    onChange={() => setValue("textColor", textColor)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <div className={adminCommon.formGroup}>
            <span className={adminCommon.formLabel}>Preview</span>
            <BannerPreview
              message={values.message || "Banner message"}
              backgroundColor={values.backgroundColor}
              textColor={values.textColor}
            />
          </div>

          {validationError && <p style={errorText}>{validationError}</p>}

          <div className={adminCommon.formActions}>
            <button className={adminCommon.buttonPrimary} onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
            <button className={adminCommon.buttonCancel} onClick={onCancel} disabled={saving}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};

/** `datetime-local` input with a "no limit" checkbox and the UTC equivalent shown below. */
const TimeWindowInput: FunctionComponent<{
  id: string;
  label: string;
  noLimitLabel: string;
  value: string;
  onChange: (value: string) => void;
}> = ({ id, label, noLimitLabel, value, onChange }) => {
  const noLimit = value === "";
  const isoTime = localInputToIso(value);
  return (
    <div className={adminCommon.formGroup}>
      <label htmlFor={id} className={adminCommon.formLabel}>
        {label} (your local time)
      </label>
      <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
        <input
          id={id}
          className={adminCommon.formInput}
          type="datetime-local"
          value={value}
          disabled={noLimit}
          onChange={(e) => onChange(e.target.value)}
        />
        <label className={adminCommon.checkboxItem}>
          <input
            type="checkbox"
            checked={noLimit}
            onChange={(e) =>
              onChange(e.target.checked ? "" : isoToLocalInput(new Date().toISOString()))
            }
          />
          {noLimitLabel}
        </label>
      </div>
      {isoTime && (
        <span className={adminCommon.formHint}>
          Local: {formatBannerTime(isoTime)} · UTC: {formatBannerTime(isoTime, "UTC")}
        </span>
      )}
    </div>
  );
};

/** Shows a stored time in local time and UTC. */
const TimeWithUtc: FunctionComponent<{ isoTime: string | null; emptyLabel: string }> = ({
  isoTime,
  emptyLabel,
}) => {
  if (!isoTime) return <>{emptyLabel}</>;
  return (
    <>
      {formatBannerTime(isoTime)}
      <span style={{ color: "#94a3b8" }}> · {formatBannerTime(isoTime, "UTC")}</span>
    </>
  );
};

/** Renders a banner the way users see it, using the same styles as the live banner. */
const BannerPreview: FunctionComponent<{
  message: string;
  backgroundColor: string;
  textColor: string;
}> = ({ message, backgroundColor, textColor }) => (
  <div
    className={bannerStyles.banner}
    style={{ backgroundColor, color: textColor, borderRadius: 4 }}
  >
    <div className={bannerStyles.bannerText}>
      <span className={bannerStyles.bannerMessage}>{message}</span>
    </div>
  </div>
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Same rules as the server's active check, plus whether an inactive banner is upcoming or past. */
function getBannerStatus(banner: NotificationBanner, now: Date): keyof typeof BANNER_STATUS_COLORS {
  if (!banner.enabled) return "Disabled";
  if (banner.endsAt && now >= new Date(banner.endsAt)) return "Expired";
  if (banner.startsAt && now < new Date(banner.startsAt)) return "Scheduled";
  return "Active";
}

/** Copy of a banner for a create/update request, with the fields the server sets nulled out. */
function clearServerSetFields(banner: NotificationBanner): NotificationBanner {
  return {
    ...banner,
    id: null,
    createdBy: null,
    updatedBy: null,
    createdAt: null,
    updatedAt: null,
  };
}

/**
 * Initial editor values. Deleted missions are dropped so saving does not fail on them; the list is
 * left unchanged when the mission list could not be loaded.
 */
function toFormValues(
  banner: NotificationBanner | null,
  missions: MissionSummary[]
): NotificationBannerFormValues {
  if (!banner) {
    return {
      message: "",
      enabled: true,
      startsAtLocal: "",
      endsAtLocal: "",
      scope: "application",
      missionIds: [],
      ...PRESET_BANNER_COLORS.blue,
    };
  }
  const existingMissionIds = new Set(missions.map((mission) => mission.id));
  return {
    message: banner.message,
    enabled: banner.enabled,
    startsAtLocal: banner.startsAt ? isoToLocalInput(banner.startsAt) : "",
    endsAtLocal: banner.endsAt ? isoToLocalInput(banner.endsAt) : "",
    scope: banner.scope,
    missionIds:
      missions.length > 0
        ? banner.missionIds.filter((missionId) => existingMissionIds.has(missionId))
        : banner.missionIds,
    backgroundColor: banner.backgroundColor,
    textColor: banner.textColor,
  };
}

function toBannerFromForm(values: NotificationBannerFormValues): NotificationBanner {
  return {
    id: null,
    createdBy: null,
    updatedBy: null,
    createdAt: null,
    updatedAt: null,
    message: values.message.trim(),
    enabled: values.enabled,
    startsAt: localInputToIso(values.startsAtLocal),
    endsAt: localInputToIso(values.endsAtLocal),
    scope: values.scope,
    missionIds: values.scope === "missions" ? values.missionIds : [],
    backgroundColor: values.backgroundColor,
    textColor: values.textColor,
  };
}

/** Client-side copy of the server's validation rules, for immediate feedback. */
function getFormError(values: NotificationBannerFormValues, hexText: string): string | null {
  if (values.message.trim() === "") return "Enter a message.";
  if (!HEX_COLOR_PATTERN.test(hexText)) return "Background color must be a hex color like #1D4ED8.";
  if (values.scope === "missions" && values.missionIds.length === 0) {
    return "Select at least one mission.";
  }
  const startsAt = localInputToIso(values.startsAtLocal);
  const endsAt = localInputToIso(values.endsAtLocal);
  if (startsAt && endsAt && new Date(startsAt) >= new Date(endsAt)) {
    return "Start time must be before end time.";
  }
  return null;
}

/** Converts a `datetime-local` value (admin's local time) to a UTC ISO string; "" becomes null. */
function localInputToIso(localValue: string): string | null {
  if (!localValue) return null;
  const date = new Date(localValue);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Converts a UTC ISO string to a `datetime-local` value in the admin's local time. */
function isoToLocalInput(isoTime: string): string {
  const date = new Date(isoTime);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

// ─── Small style helpers ─────────────────────────────────────────────────────

const mutedText: React.CSSProperties = { color: "#94a3b8", margin: 0 };

const errorText: React.CSSProperties = { color: "#f87171", fontSize: "0.9rem", margin: 0 };

const dtStyle: React.CSSProperties = {
  color: "#94a3b8",
  fontSize: "0.9rem",
  fontWeight: 600,
  padding: "6px 0",
};

const ddStyle: React.CSSProperties = { padding: "6px 0", margin: 0 };

const statusBadge: React.CSSProperties = {
  marginLeft: "12px",
  fontSize: "0.9rem",
  fontWeight: 600,
};

const swatchStyle: React.CSSProperties = {
  border: "1px solid #00000066",
  borderRadius: "4px",
  padding: "6px 12px",
  cursor: "pointer",
  fontWeight: 600,
  textTransform: "capitalize",
};

const missionListStyle: React.CSSProperties = {
  maxHeight: "220px",
  overflowY: "auto",
  padding: "8px",
  border: "1px solid var(--admin-border)",
  borderRadius: "6px",
};
