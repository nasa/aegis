import { getUserFromJWT } from "@emss/oauth2-proxy-backend";
import type { EMSSRole } from "@emss/oauth2-proxy-common";
import type { Request } from "express";

// Used to override the mock user so tests can pass in multiple users with different perms
export const OVERRIDE_MOCK_UUPIC_HEADER = "x-override-mock-uupic";

/**
 * Overrides the mock user's NAMS roles, comma-separated. Send an empty string for an identity with
 * no roles at all, which is how a test exercises a non-super-user.
 */
export const OVERRIDE_MOCK_ROLES_HEADER = "x-override-mock-roles";

// Returns either the mocked role, or a default set of roles
const getRoles = (req?: Request): EMSSRole[] => {
  const overrideRoles = req?.headers?.[OVERRIDE_MOCK_ROLES_HEADER] as string | undefined;
  if (overrideRoles !== undefined) {
    return overrideRoles
      .split(",")
      .map((role) => role.trim())
      .filter((role) => !!role) as EMSSRole[];
  }
  // Nothing mocked, return all roles
  return [
    "AEGIS-Editor",
    "AEGIS-Superuser",
    "CODA-Superuser",
    "Maestro-Superuser",
    "EMSS-Superuser",
  ];
};

const getMockLaunchpadUser = (req?: Request): LaunchpadUser => {
  const overrideUupic = req?.headers?.[OVERRIDE_MOCK_UUPIC_HEADER] as string | undefined;
  return {
    uupic: overrideUupic || "1234",
    email: "neil.armstrong@nasa.gov",
    auid: overrideUupic || "narmstra",
    givenname: "Neil",
    surname: "Armstrong",
    display_name: overrideUupic || "Armstrong, Neil A. (JSC-CB611)",
    roles: getRoles(req),
    uscitizen: true,
    legal_permanent_resident: true,
    usperson: true,
    ip_address: "1.2.3.4",
  };
};

export const getLaunchpadUser = (req: Request): LaunchpadUser | Error => {
  if (process.env.MOCK_USER === "true") {
    return getMockLaunchpadUser(req);
  }
  return getUserFromJWT(req);
};
