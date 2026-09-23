import { MikroORM } from "@mikro-orm/postgresql";

import { describe, expect, it } from "vitest";
import config from "server/database/mikro-orm.config";
import { globalValues } from "server/express/global";
import { Doc_Listing_db, Mission_Permission_db } from "server/database/models/_allModels";
import DocListingFactory from "../fixtures/entityFactories/DocListingFactory";

import {
  meetsPermLevel,
  PERMISSION_LEVELS,
  permissionLevelLabel,
  PUBLIC_UUPIC,
  isLaunchpadSuperUser,
} from "utils/permissionsClient";

let missions: Doc_Listing_db[];

beforeAll(async () => {
  globalValues.orm = await MikroORM.init(config);
  const em = globalValues.orm.em.fork();
  missions = await new DocListingFactory(em).create(3);
});

describe("hasSuperUserRole", () => {
  const baseUser = { uupic: "x", auid: "x", display_name: "x" } as LaunchpadUser;

  it("accepts either super-user role, as an array or a bare string", () => {
    expect(isLaunchpadSuperUser({ ...baseUser, roles: ["AEGIS-Superuser"] })).toBe(true);
    expect(isLaunchpadSuperUser({ ...baseUser, roles: ["EMSS-Superuser"] })).toBe(true);
    expect(isLaunchpadSuperUser({ ...baseUser, roles: "AEGIS-Superuser" })).toBe(true);
  });

  it("rejects a token without a super-user role", () => {
    expect(isLaunchpadSuperUser({ ...baseUser, roles: ["AEGIS-Editor"] })).toBe(false);
    expect(isLaunchpadSuperUser({ ...baseUser, roles: [] })).toBe(false);
    expect(isLaunchpadSuperUser({ ...baseUser, roles: undefined })).toBe(false);
    expect(isLaunchpadSuperUser(null)).toBe(false);
    expect(isLaunchpadSuperUser(undefined)).toBe(false);
  });
});

describe("meetsLevel", () => {
  it("edit satisfies every level", () => {
    expect(meetsPermLevel("edit", "edit")).toBe(true);
    expect(meetsPermLevel("edit", "editPartial")).toBe(true);
    expect(meetsPermLevel("edit", "viewer")).toBe(true);
  });

  it("editPartial satisfies viewer but not edit", () => {
    expect(meetsPermLevel("editPartial", "viewer")).toBe(true);
    expect(meetsPermLevel("editPartial", "editPartial")).toBe(true);
    expect(meetsPermLevel("editPartial", "edit")).toBe(false);
  });

  it("viewer satisfies only viewer", () => {
    expect(meetsPermLevel("viewer", "viewer")).toBe(true);
    expect(meetsPermLevel("viewer", "editPartial")).toBe(false);
    expect(meetsPermLevel("viewer", "edit")).toBe(false);
  });

  it("tolerates a null or undefined actual level", () => {
    expect(meetsPermLevel(null, "viewer")).toBe(false);
    expect(meetsPermLevel(undefined, "viewer")).toBe(false);
  });
});

describe("constants", () => {
  it("lists every level weakest first", () => {
    expect(PERMISSION_LEVELS).toEqual(["viewer", "editPartial", "edit"]);
  });

  it("labels every level", () => {
    expect(PERMISSION_LEVELS.map(permissionLevelLabel)).toEqual(["Viewer", "Edit Partial", "Edit"]);
  });

  it("keeps the reserved public sentinel stable", () => {
    expect(PUBLIC_UUPIC).toBe("__public__");
  });
});

afterAll(async () => {
  const em = globalValues.orm.em.fork();
  for (const mission of missions) {
    await em.nativeDelete(Mission_Permission_db, { missionId: mission.missionId });
    await em.nativeDelete(Doc_Listing_db, { missionId: mission.missionId });
  }

  await globalValues.orm.close();
  globalValues.orm = null;
});
