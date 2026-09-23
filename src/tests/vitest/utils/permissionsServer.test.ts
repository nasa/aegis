import { describe, expect, it } from "vitest";

import {
  apiHasPerms,
  apiHasSuperUserOrToken,
  missionIdsAtLevel,
  logUsername,
} from "utils/permissionsServer";

const makeUser = (overrides: Partial<CurrentUser> = {}): CurrentUser => ({
  launchpadUser: null,
  appUser: null,
  permissions: {},
  isEmssToken: false,
  ...overrides,
});

/** A Launchpad token carrying a super-user NAMS role, which is the only source of super-user status. */
const superUserLaunchpadUser = {
  uupic: "su",
  auid: "su",
  display_name: "Super User",
  roles: ["AEGIS-Superuser"],
} as LaunchpadUser;

describe("hasPerms", () => {
  it("applies the pyramid to the resolved level", () => {
    const user = makeUser({ permissions: { 1: "editPartial" } });
    expect(apiHasPerms({ missionId: 1, requiredPermLevel: "viewer", user })).toBe(true);
    expect(apiHasPerms({ missionId: 1, requiredPermLevel: "editPartial", user })).toBe(true);
    expect(apiHasPerms({ missionId: 1, requiredPermLevel: "edit", user })).toBe(false);
  });

  it("denies everything without a user", () => {
    expect(apiHasPerms({ missionId: 1, requiredPermLevel: "viewer", user: undefined })).toBe(false);
  });
});

describe("isSuperUser", () => {
  it("is true for a NAMS super user and for the EMSS token", () => {
    expect(apiHasSuperUserOrToken(makeUser({ launchpadUser: superUserLaunchpadUser }))).toBe(true);
    expect(apiHasSuperUserOrToken(makeUser({ isEmssToken: true }))).toBe(true);
  });

  it("is false for a plain user, even one with edit everywhere", () => {
    expect(apiHasSuperUserOrToken(makeUser({ permissions: { 1: "edit" } }))).toBe(false);
    expect(apiHasSuperUserOrToken(undefined)).toBe(false);
  });
});

describe("missionIdsAtLevel", () => {
  it("filters by the pyramid", () => {
    const user = makeUser({
      permissions: {
        1: "viewer",
        2: "editPartial",
        3: "edit",
      },
    });
    expect(missionIdsAtLevel(user, "viewer").sort()).toEqual([1, 2, 3]);
    expect(missionIdsAtLevel(user, "editPartial").sort()).toEqual([2, 3]);
    expect(missionIdsAtLevel(user, "edit")).toEqual([3]);
  });

  it("returns empty for a super user, whose access carries no grant rows", () => {
    expect(
      missionIdsAtLevel(makeUser({ launchpadUser: superUserLaunchpadUser }), "viewer")
    ).toEqual([]);
  });
});

describe("logUsername", () => {
  it("prefers the managed row and falls back to the token", () => {
    expect(
      logUsername(
        makeUser({
          appUser: {
            id: 1,
            uupic: "u",
            auid: "managed",
            displayName: "d",
            isSystem: false,
            lastLoginAt: Date.now(),
          },
          launchpadUser: { auid: "token" } as LaunchpadUser,
        })
      )
    ).toBe("managed");

    expect(logUsername(makeUser({ launchpadUser: { auid: "token" } as LaunchpadUser }))).toBe(
      "token"
    );

    expect(logUsername(undefined)).toBeUndefined();
  });
});
