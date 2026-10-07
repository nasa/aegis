import {
  getMissionDocHandle,
  setMissionAutomergeDocHandle,
  withMissionChange,
} from "client/automergeDocHandles";
import {
  applyCreateReportCampaign,
  applyDeleteReportCampaign,
  applyUpdateReportCampaignByField,
} from "operations/apply/apply-mission-reportCampaign";

beforeAll(() => setMissionAutomergeDocHandle(null));

beforeEach(() => {
  vi.clearAllMocks();
  getMissionDocHandle().change((m) => {
    m.reportCampaigns = {};
  });
});

afterAll(() => vi.restoreAllMocks());

describe("apply-mission-reportCampaign", () => {
  test("creates a campaign with defaults, uuid, and timestamps", () => {
    const missionDocHandle = getMissionDocHandle();
    const before = missionDocHandle.doc().updatedAt;
    vi.spyOn(Date.prototype, "getTime")
      .mockReturnValueOnce(before + 10)
      .mockReturnValueOnce(before + 20);

    const uuid = withMissionChange((m) => applyCreateReportCampaign(m));
    const campaign = missionDocHandle.doc().reportCampaigns?.[uuid];

    expect(campaign).toMatchObject({
      uuid,
      name: "(Campaign Name)",
      description: null,
      memberEvaUuids: [],
      executionRexUuidByEvaUuid: null,
      updatedAt: null,
    });
    expect(campaign?.createdAt).toBeGreaterThan(before);
    expect(missionDocHandle.doc().updatedAt).toBeGreaterThan(before);
  });

  test("lazily initializes a null campaign map", () => {
    getMissionDocHandle().change((m) => {
      m.reportCampaigns = null;
    });
    const uuid = withMissionChange((m) => applyCreateReportCampaign(m));
    expect(getMissionDocHandle().doc().reportCampaigns?.[uuid]).toBeDefined();
  });

  test("updates a field and both campaign and mission updatedAt", () => {
    const uuid = withMissionChange((m) => applyCreateReportCampaign(m));
    const before = getMissionDocHandle().doc().updatedAt;
    vi.spyOn(Date.prototype, "getTime").mockReturnValueOnce(before + 10);

    withMissionChange((m) =>
      applyUpdateReportCampaignByField(m, {
        reportCampaignUuid: uuid,
        fieldName: "memberEvaUuids",
        value: ["eva1", "eva2"],
      })
    );

    const doc = getMissionDocHandle().doc();
    expect(doc.reportCampaigns?.[uuid].memberEvaUuids).toEqual(["eva1", "eva2"]);
    expect(doc.reportCampaigns?.[uuid].updatedAt).toBeGreaterThan(before);
    expect(doc.updatedAt).toBeGreaterThan(before);
  });

  test("deletes only the requested campaign and bumps mission updatedAt", () => {
    const uuid1 = withMissionChange((m) => applyCreateReportCampaign(m));
    const uuid2 = withMissionChange((m) => applyCreateReportCampaign(m));
    const before = getMissionDocHandle().doc().updatedAt;
    vi.spyOn(Date.prototype, "getTime").mockReturnValueOnce(before + 10);

    withMissionChange((m) => applyDeleteReportCampaign(m, { reportCampaignUuid: uuid1 }));

    const doc = getMissionDocHandle().doc();
    expect(doc.reportCampaigns?.[uuid1]).toBeUndefined();
    expect(doc.reportCampaigns?.[uuid2]).toBeDefined();
    expect(doc.updatedAt).toBeGreaterThan(before);
  });

  test("missing campaign updates and deletes are no-ops", () => {
    const before = getMissionDocHandle().doc().updatedAt;
    withMissionChange((m) =>
      applyUpdateReportCampaignByField(m, {
        reportCampaignUuid: "missing",
        fieldName: "name",
        value: "Nope",
      })
    );
    withMissionChange((m) => applyDeleteReportCampaign(m, { reportCampaignUuid: "missing" }));
    expect(getMissionDocHandle().doc().updatedAt).toBe(before);
  });
});
