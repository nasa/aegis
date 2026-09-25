import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router";

import { getAppUsers } from "http-client/access/appUsers";
import {
  getUserAccessForMission,
  upsertMissionPermission,
  deleteMissionPermission,
} from "http-client/access/missionPermission";
import { getUserGroups } from "http-client/access/userGroup";
import { getMissionHomepageItems } from "http-client/mission";
import { PERMISSION_LEVELS, permissionLevelLabel } from "utils/permissionsClient";
import adminCommon from "./adminCommon.module.css";

/**
 * Everyone who can reach one mission, and the controls to grant and revoke.
 *
 * Group rows expand to their members, so the page answers "who can see this mission?" rather than
 * only "which subjects hold a grant?". Users holding the Launchpad super-user role are not listed:
 * they reach every mission implicitly and hold no grant rows.
 */
const MissionPermissions: React.FunctionComponent = () => {
  const params = useParams<{ id: string }>();
  const missionId = parseInt(params.id, 10);

  const [missionName, setMissionName] = useState("");
  const [summary, setSummary] = useState<MissionAccessSummary | null>(null);
  const [groups, setGroups] = useState<UserGroupSummary[]>([]);
  const [candidates, setCandidates] = useState<AppUserSummary[]>([]);
  const [search, setSearch] = useState("");
  const [notesDraft, setNotesDraft] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState<string | null>(null);

  const subjects = summary?.subjects ?? [];
  const publicUserId = summary?.publicUserId ?? null;
  const isPublic = summary?.isPublic ?? false;

  const noteKey = (subject: MissionAccessSubject): string =>
    `${subject.subjectType}-${subject.subjectId}`;

  const loadAll = useCallback(async () => {
    if (!missionId) return;

    const responses = await Promise.all([
      getUserAccessForMission(missionId),
      getUserGroups(),
      getMissionHomepageItems(true),
    ]);

    // A failed request would otherwise render as an empty page, which on a permissions screen
    // reads as "nobody can reach this mission" rather than "we could not find out".
    const failure = responses.find((response) => response.status !== "success");
    if (failure) {
      setError(failure.message ?? "Failed to load the permissions for this mission.");
      return;
    }
    setError(null);

    const [accessRes, groupsRes, missionsRes] = responses;
    setSummary(accessRes.data ?? null);
    setGroups(groupsRes.data ?? []);
    setMissionName((missionsRes.data ?? []).find((m) => m.id === missionId)?.name ?? "");

    const drafts = new Map<string, string>();
    for (const subject of accessRes.data?.subjects ?? []) {
      drafts.set(`${subject.subjectType}-${subject.subjectId}`, subject.notes ?? "");
    }
    setNotesDraft(drafts);
  }, [missionId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    getAppUsers({ search }).then((res) => setCandidates(res.data ?? []));
  }, [search]);

  const apply = async (response: WrappedResponse<unknown>) => {
    if (response.status !== "success") {
      alert(
        `Error changing the grant. Please let the AEGIS developers know. Status ${response.message}`
      );
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
        ? await upsertMissionPermission({ missionId, userId: publicUserId, permLevel: "viewer" })
        : await deleteMissionPermission({ missionId, userId: publicUserId })
    );
  };

  const handleSubjectLevel = async (
    target: { userId?: number; groupId?: number },
    permLevel: string,
    notes?: string | null
  ) => {
    await apply(
      permLevel
        ? await upsertMissionPermission({
            missionId,
            ...target,
            permLevel: permLevel as PermissionLevel,
            notes: notes ?? null,
          })
        : await deleteMissionPermission({ missionId, ...target })
    );
  };

  const groupSubjectFor = (groupId: number): MissionAccessSubject | undefined =>
    subjects.find((s) => s.subjectType === "group" && s.subjectId === groupId);

  const userSubjects = subjects.filter(
    (s) => s.subjectType === "user" && s.subjectId !== publicUserId
  );
  const grantedUserIds = new Set(userSubjects.map((s) => s.subjectId));

  return (
    <main className={adminCommon.page}>
      <div className={adminCommon.container}>
        <Link to="/admin/missions" className={adminCommon.backLink}>
          ← Missions
        </Link>
        <h1 className={adminCommon.pageTitle}>{missionName || `Mission ${missionId}`}</h1>
        <p className={adminCommon.introText}>
          Everyone who can reach this mission. Users holding the Launchpad super-user role are not
          listed; they reach every mission implicitly.
        </p>

        {error && <div className={adminCommon.statusMessage}>{error}</div>}

        <section className={adminCommon.section}>
          <h2 className={adminCommon.sectionHeading}>Public access</h2>
          <div className={adminCommon.details}>
            <label className={adminCommon.checkboxItem}>
              <input
                type="checkbox"
                checked={isPublic}
                disabled={!publicUserId}
                onChange={(event) => handlePublicToggle(event.target.checked)}
              />
              Public — visible to every signed-in AEGIS user
            </label>
            {isPublic && (
              <div className={adminCommon.missionSubheader}>
                <strong>Every</strong> signed-in AEGIS user can view this mission, whether or not
                they appear in the lists below.
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
                  <th>Permission Level</th>
                  <th>Members reaching this mission</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => {
                  const subject = groupSubjectFor(group.id);
                  const key = `group-${group.id}`;
                  return (
                    <tr key={group.id}>
                      <td>
                        <Link to={`/admin/group/${group.id}`}>{group.name}</Link>
                      </td>
                      <td>
                        <select
                          className={adminCommon.formInput}
                          value={subject?.permLevel ?? ""}
                          onChange={(event) =>
                            handleSubjectLevel(
                              { groupId: group.id },
                              event.target.value,
                              notesDraft.get(key)
                            )
                          }
                        >
                          <option value="">None</option>
                          {PERMISSION_LEVELS.map((permLevel) => (
                            <option key={permLevel} value={permLevel}>
                              {permissionLevelLabel(permLevel)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        {subject?.members?.length ? (
                          <ul className={adminCommon.definitionList}>
                            {subject.members.map((member) => (
                              <li key={member.id} className={adminCommon.definitionRow}>
                                <Link to={`/admin/user/${member.id}`}>{member.displayName}</Link> (
                                {member.auid})
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className={adminCommon.mutedIcon}>
                            {subject ? "No members" : "—"}
                          </span>
                        )}
                      </td>
                      <td>
                        <input
                          className={adminCommon.formInput}
                          disabled={!subject}
                          value={notesDraft.get(key) ?? ""}
                          placeholder="Why this grant exists"
                          onChange={(event) =>
                            setNotesDraft((prev) => new Map(prev).set(key, event.target.value))
                          }
                          onBlur={() =>
                            subject &&
                            handleSubjectLevel(
                              { groupId: group.id },
                              subject.permLevel,
                              notesDraft.get(key)
                            )
                          }
                        />
                      </td>
                    </tr>
                  );
                })}
                {groups.length === 0 && (
                  <tr>
                    <td colSpan={4} className={adminCommon.emptyState}>
                      No groups exist yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className={adminCommon.section}>
          <h2 className={adminCommon.sectionHeading}>Users with a direct grant</h2>
          <div className={adminCommon.details}>
            <table className={adminCommon.table}>
              <thead>
                <tr>
                  <th>User</th>
                  <th>AUID</th>
                  <th>Permission Level</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {userSubjects.map((subject) => {
                  const key = noteKey(subject);
                  return (
                    <tr key={subject.subjectId}>
                      <td>
                        <Link to={`/admin/user/${subject.subjectId}`}>{subject.subjectName}</Link>
                      </td>
                      <td>{subject.subjectAuid ?? "—"}</td>
                      <td>
                        <select
                          className={adminCommon.formInput}
                          value={subject.permLevel}
                          onChange={(event) =>
                            handleSubjectLevel(
                              { userId: subject.subjectId },
                              event.target.value,
                              notesDraft.get(key)
                            )
                          }
                        >
                          <option value="">None</option>
                          {PERMISSION_LEVELS.map((permLevel) => (
                            <option key={permLevel} value={permLevel}>
                              {permissionLevelLabel(permLevel)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          className={adminCommon.formInput}
                          value={notesDraft.get(key) ?? ""}
                          placeholder="Why this grant exists"
                          onChange={(event) =>
                            setNotesDraft((prev) => new Map(prev).set(key, event.target.value))
                          }
                          onBlur={() =>
                            handleSubjectLevel(
                              { userId: subject.subjectId },
                              subject.permLevel,
                              notesDraft.get(key)
                            )
                          }
                        />
                      </td>
                    </tr>
                  );
                })}
                {userSubjects.length === 0 && (
                  <tr>
                    <td colSpan={4} className={adminCommon.emptyState}>
                      No direct user grants.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            <div className={adminCommon.formGroup}>
              <label className={adminCommon.formLabel} htmlFor="userSearch">
                Grant to a user
              </label>
              <span className={adminCommon.formHint}>
                Searches everyone who has signed in at least once.
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
                {candidates
                  .filter((c) => !grantedUserIds.has(c.id) && c.id !== publicUserId)
                  .slice(0, 20)
                  .map((candidate) => (
                    <tr key={candidate.id}>
                      <td>{candidate.displayName}</td>
                      <td>{candidate.auid}</td>
                      <td>
                        <button
                          type="button"
                          className={adminCommon.button}
                          onClick={() => handleSubjectLevel({ userId: candidate.id }, "viewer")}
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
