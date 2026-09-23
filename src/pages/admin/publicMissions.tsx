import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";

import { getAppUsers } from "http-client/access/appUsers";
import {
  deleteMissionPermission,
  getPublicMissions,
  upsertMissionPermission,
} from "http-client/access/missionPermission";
import { getMissionHomepageItems } from "http-client/mission";
import { PUBLIC_UUPIC } from "utils/permissionsClient";
import adminCommon from "./adminCommon.module.css";

/**
 * Missions granted to the reserved Public user, which are the missions every signed-in AEGIS user
 * can view. Public is capped at viewer, so nothing here can hand out edit rights.
 */
const PublicMissions: React.FunctionComponent = () => {
  const [publicMissions, setPublicMissions] = useState<PublicMission[]>([]);
  const [missions, setMissions] = useState<MissionHomepageItem[]>([]);
  const [publicUserId, setPublicUserId] = useState<number | null>(null);
  const [showAllMissions, setShowAllMissions] = useState(false);
  const [notesDraft, setNotesDraft] = useState<Map<number, string>>(new Map());
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    const [publicRes, missionsRes, usersRes] = await Promise.all([
      getPublicMissions(),
      getMissionHomepageItems(true),
      getAppUsers({ search: PUBLIC_UUPIC }),
    ]);

    if (publicRes.status !== "success") {
      setError(publicRes.message ?? "Failed to load public missions.");
      return;
    }

    setPublicMissions(publicRes.data ?? []);
    setMissions(missionsRes.data ?? []);
    setPublicUserId((usersRes.data ?? []).find((u) => u.uupic === PUBLIC_UUPIC)?.id ?? null);
    setNotesDraft(new Map((publicRes.data ?? []).map((m) => [m.missionId, m.notes ?? ""])));
    setError(null);
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const apply = async (response: WrappedResponse<unknown>) => {
    if (response.status !== "success") {
      alert(
        `Error changing public access. Please let the AEGIS developers know. Status ${response.message}`
      );
      setError(response.message ?? "Failed to change public access.");
      return;
    }
    setError(null);
    await loadAll();
  };

  const handleToggle = async (missionId: number, makePublic: boolean) => {
    if (!publicUserId) return;
    await apply(
      makePublic
        ? await upsertMissionPermission({
            missionId,
            userId: publicUserId,
            permLevel: "viewer",
            notes: notesDraft.get(missionId) || null,
          })
        : await deleteMissionPermission({ missionId, userId: publicUserId })
    );
  };

  const handleNotesSave = async (missionId: number) => {
    if (!publicUserId) return;
    if (!publicMissions.some((m) => m.missionId === missionId)) return;
    await apply(
      await upsertMissionPermission({
        missionId,
        userId: publicUserId,
        permLevel: "viewer",
        notes: notesDraft.get(missionId) || null,
      })
    );
  };

  const publicMissionIds = new Set(publicMissions.map((m) => m.missionId));
  const visibleMissions = showAllMissions
    ? missions
    : missions.filter((m) => publicMissionIds.has(m.id));

  return (
    <main className={adminCommon.page}>
      <div className={adminCommon.container}>
        <Link to="/admin" className={adminCommon.backLink}>
          ← Admin
        </Link>
        <h1 className={adminCommon.pageTitle}>Public Missions</h1>
        <p className={adminCommon.introText}>
          <strong>Every</strong> signed-in AEGIS user can view these missions, whether or not they
          hold any grant of their own. Public access is always read-only.
        </p>

        {error && <div className={adminCommon.statusMessage}>{error}</div>}
        {!publicUserId && (
          <div className={adminCommon.statusMessage}>
            The reserved Public user is missing, so public access cannot be changed.
          </div>
        )}

        <section className={adminCommon.section}>
          <label className={adminCommon.checkboxItem}>
            <input
              type="checkbox"
              checked={showAllMissions}
              onChange={(event) => setShowAllMissions(event.target.checked)}
            />
            Show every mission, so one can be made public
          </label>

          <table className={adminCommon.table}>
            <thead>
              <tr>
                <th>Mission</th>
                <th>Public</th>
                <th>Note</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleMissions.map((mission) => {
                const isPublic = publicMissionIds.has(mission.id);
                return (
                  <tr key={mission.id}>
                    <td>{mission.name}</td>
                    <td>
                      <input
                        type="checkbox"
                        checked={isPublic}
                        disabled={!publicUserId}
                        onChange={(event) => handleToggle(mission.id, event.target.checked)}
                      />
                    </td>
                    <td>
                      <input
                        className={adminCommon.formInput}
                        disabled={!isPublic}
                        value={notesDraft.get(mission.id) ?? ""}
                        placeholder="Why this mission is public"
                        onChange={(event) =>
                          setNotesDraft((prev) => new Map(prev).set(mission.id, event.target.value))
                        }
                        onBlur={() => handleNotesSave(mission.id)}
                      />
                    </td>
                    <td>
                      <Link
                        to={`/admin/mission/${mission.id}/permissions`}
                        className={adminCommon.button}
                      >
                        Permissions
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {visibleMissions.length === 0 && (
                <tr>
                  <td colSpan={4} className={adminCommon.emptyState}>
                    No missions are public.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  );
};

export default PublicMissions;
