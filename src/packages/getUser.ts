import { getUserFromJWT } from "@emss/oauth2-proxy-backend";
import type { EMSSRole } from "@emss/oauth2-proxy-common";
import type { Request } from "express";

// Used to override the mock user so tests can pass in multiple users with different perms
export const OVERRIDE_MOCK_USER_HEADER = "x-override-mock-user";

const getMockLaunchpadUser = (req?: Request): LaunchpadUser => {
  const overrideUupic = req?.headers?.[OVERRIDE_MOCK_USER_HEADER] as string | undefined;
  return {
    uupic: overrideUupic || process.env.MOCK_USER_UUPIC || "1234",
    email: process.env.MOCK_USER_EMAIL || "neil.armstrong@nasa.gov",
    auid: overrideUupic || process.env.MOCK_USER_AUID || "narmstra",
    givenname: process.env.MOCK_USER_GIVENNAME || "Neil",
    surname: process.env.MOCK_USER_SURNAME || "Armstrong",
    display_name:
      overrideUupic || process.env.MOCK_USER_DISPLAYNAME || "Armstrong, Neil A. (JSC-CB611)",
    roles: process.env.MOCK_USER_ROLES
      ? (process.env.MOCK_USER_ROLES.split(",") as EMSSRole[])
      : [
          "AEGIS-Editor",
          "AEGIS-Superuser",
          "CODA-Superuser",
          "Maestro-Superuser",
          "EMSS-Superuser",
        ],
    uscitizen: process.env.MOCK_USER_USCITIZEN ? Boolean(process.env.MOCK_USER_USCITIZEN) : true,
    legal_permanent_resident: process.env.MOCK_USER_LPR ? Boolean(process.env.MOCK_USER_LPR) : true,
    usperson: process.env.MOCK_USER_USPERSON ? Boolean(process.env.MOCK_USER_USPERSON) : true,
    ip_address: "1.2.3.4",
  };
};

export const getLaunchpadUser = (req: Request): LaunchpadUser | Error => {
  if (process.env.MOCK_USER === "true") {
    return getMockLaunchpadUser(req);
  }
  return getUserFromJWT(req);
};
