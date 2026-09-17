import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router";

import {
  getAppUsers,
  getKnownUsers,
  getMissionAccess,
  getUserGroups,
  grantMissionPermission,
  revokeMissionPermission,
} from "http-client/access";
import { getMissionHomepageItems } from "http-client/mission";
import {
  PERMISSION_LEVELS,
  permissionLevelLabel,
  PUBLIC_UUPIC,
  SUPER_USER_GROUP_NAME,
} from "utils/permissionLevels";
import adminCommon from "./adminCommon.module.css";

/**
 * Everyone who can reach one mission, and the controls to grant and revoke.
 *
 * superUser members are not listed: they hold no grant rows, reaching every mission implicitly.
 */
const MissionPermissions: React.FunctionComponent = () => {
  const params = useParams<{ id: string }>();
  const missionId = parseInt(params.id, 10);

  const [missionName, setMissionName] = useState("");
  const [subjects, setSubjects] = useState<MissionAccessSubject[]>([]);
  const [publicUserId, setPublicUserId] = useState<number | null>(null);
  const [groups, setGroups] = useState<UserGroupSummary[]>([]);
  const [knownUsers, setKnownUsers] = useState<KnownUser[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isPublic = subjects.some((s) => s.subjectType === "user" && s.subjectId === publicUserId);

  const loadAll = useCallback(async () => {
    if (!missionId) return;

    const [accessRes, groupsRes, usersRes, missionsRes] = await Promise.all([
      getMissionAccess(missionId),
      getUserGroups(),
      getAppUsers(false),
      getMissionHomepageItems(true),
    ]);

    setSubjects(accessRes.data?.subjects ?? []);
    setGroups((groupsRes.data ?? []).filter((g) => g.name !== SUPER_USER_GROUP_NAME));
    setPublicUserId((usersRes.data ?? []).find((u) => u.uupic === PUBLIC_UUPIC)?.id ?? null);
    setMissionName((missionsRes.data ?? []).find((m) => m.id === missionId)?.name ?? "");
  }, [missionId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    getKnownUsers(search).then((res) => setKnownUsers(res.data ?? []));
  }, [search]);

  const apply = async (response: WrappedResponse<unknown>) => {
    if (response.status !== "success") {
      setError(response.message ?? "Failed to change the grant.");
      return;
    }
    setError(null);
    await loadAll();
  };

  const handlePublicToggle = async (makePublic: boolean) => {
    if (!publicUserId) return;
    await apply(
      makePublic
        ? await grantMissionPermission({ missionId, userId: publicUserId, level: "viewer" })
        : await revokeMissionPermission({ missionId, userId: publicUserId })
    );
  };

  const handleSubjectLevel = async (subject: MissionAccessSubject, level: string) => {
    const target =
      subject.subjectType === "user"
        ? { userId: subject.subjectId }
        : { groupId: subject.subjectId };
    await apply(
      level
        ? await grantMissionPermission({ missionId, ...target, level: level as PermissionLevel })
        : await revokeMissionPermission({ missionId, ...target })
    );
  };

  const groupLevelFor = (groupId: number): PermissionLevel | "" =>
    subjects.find((s) => s.subjectType === "group" && s.subjectId === groupId)?.level ?? "";

  return (
    <main className={adminCommon.page}>
      <div className={adminCommon.container}>
        <Link to="/admin/missions" className={adminCommon.backLink}>
          ← Missions
        </Link>
        <h1 className={adminCommon.pageTitle}>{missionName || `Mission ${missionId}`}</h1>
        <p className={adminCommon.introText}>
          Everyone who can reach this mission. Members of the <strong>superUser</strong> group are
          not listed; they reach every mission implicitly.
        </p>

        {error && <div className={adminCommon.statusMessage}>{error}</div>}

        <section className={adminCommon.section}>
          <h2 className={adminCommon.sectionHeading}>Public access</h2>
          <div className={adminCommon.details}>
            <label>
              <input
                type="checkbox"
                checked={isPublic}
                disabled={!publicUserId}
                onChange={(event) => handlePublicToggle(event.target.checked)}
              />{" "}
              Public — visible to every signed-in AEGIS user
            </label>
            {isPublic && (
              <div className={adminCommon.missionSubheader}>
                <strong>Every</strong> signed-in AEGIS user can view this mission, whether or not
                they appear in the list below.
              </div>
            )}
          </div>
        </section>

        <section className={adminCommon.section}>
          <h2 className={adminCommon.sectionHeading}>Groups</h2>
          <div className={adminCommon.details}>
            <table className={adminCommon.table}>
              <thead>
                <tr>
                  <th>Group</th>
                  <th>Level</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  <tr key={group.id}>
                    <td>
                      <Link to={`/admin/group/${group.id}`}>{group.name}</Link>
                    </td>
                    <td>
                      <select
                        className={adminCommon.formInput}
                        value={groupLevelFor(group.id)}
                        onChange={(event) =>
                          handleSubjectLevel(
                            {
                              subjectType: "group",
                              subjectId: group.id,
                              subjectName: group.name,
                              level: "viewer",
                              notes: null,
                              grantedBy: null,
                            },
                            event.target.value
                          )
                        }
                      >
                        <option value="">None</option>
                        {PERMISSION_LEVELS.map((level) => (
                          <option key={level} value={level}>
                            {permissionLevelLabel(level)}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className={adminCommon.section}>
          <h2 className={adminCommon.sectionHeading}>Users</h2>
          <div className={adminCommon.details}>
            <table className={adminCommon.table}>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Level</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {subjects
                  .filter((s) => s.subjectType === "user" && s.subjectId !== publicUserId)
                  .map((subject) => (
                    <tr key={subject.subjectId}>
                      <td>
                        <Link to={`/admin/user/${subject.subjectId}`}>{subject.subjectName}</Link>
                      </td>
                      <td>
                        <select
                          className={adminCommon.formInput}
                          value={subject.level}
                          onChange={(event) => handleSubjectLevel(subject, event.target.value)}
                        >
                          <option value="">None</option>
                          {PERMISSION_LEVELS.map((level) => (
                            <option key={level} value={level}>
                              {permissionLevelLabel(level)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td title={subject.notes ?? ""}>{subject.notes ? "Yes" : "—"}</td>
                    </tr>
                  ))}
              </tbody>
            </table>

            <div className={adminCommon.formGroup}>
              <label className={adminCommon.formLabel} htmlFor="userSearch">
                Grant to a user
              </label>
              <span className={adminCommon.formHint}>
                Searches identities that have signed in at least once. Granting promotes them to a
                managed user.
              </span>
              <input
                id="userSearch"
                className={adminCommon.formInput}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by AUID or name"
              />
            </div>
            <table className={adminCommon.tableCompact}>
              <tbody>
                {knownUsers.slice(0, 20).map((known) => (
                  <tr key={known.id}>
                    <td>{known.displayName}</td>
                    <td>{known.auid}</td>
                    <td>
                      <button
                        type="button"
                        className={adminCommon.button}
                        onClick={async () =>
                          apply(
                            await grantMissionPermission({
                              missionId,
                              knownUserId: known.id,
                              level: "viewer",
                            })
                          )
                        }
                      >
                        Grant Viewer
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
};

export default MissionPermissions;
