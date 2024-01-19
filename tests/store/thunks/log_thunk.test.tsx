import { StoreType } from "store";
import { createFullTestStore } from "tests/factories/makeTestStore";
import { thunkLogRexFull } from "store/thunk/thunkLog";

// mock all calls to the db so no transactions are actually made
// CAUTION, the import line must be below the jest.mock
jest.mock("http-client/log");
import * as httpClient_log from "http-client/log";

// jest will fail to parse thunkLog.ts due to the fact the file imports a function from utils/export.ts,
//    and export.ts imports from the library "string-strip-html". Mock the module here.
jest.mock("string-strip-html", () => ({
  stripHtml: () => jest.fn(),
}));

let store: StoreType;

beforeAll(() => {
  store = createFullTestStore();
});

beforeEach(async () => {
  jest.clearAllMocks(); // clear call count
});

afterAll(() => {
  jest.restoreAllMocks();
});

describe("Thunk Log Tests", () => {
  it("thunkLogRexFull", async () => {
    const rex = store.getState().rex.rexes[0];

    await store.dispatch(thunkLogRexFull({ rexUuid: rex.uuid, directive: "fullRexStart" }));
    const callArgument: Log = (httpClient_log.upsertLogs as jest.Mock).mock.calls[0][0][0];
    const payloadJson: { rex: ExportRex; eva: ExportEva } = JSON.parse(callArgument.payloadJson);

    expect(httpClient_log.upsertLogs).toHaveBeenCalledTimes(1);
    expect(callArgument.type).toEqual("fullRexStart");
    expect(payloadJson.rex.uuid).toEqual(rex.uuid);
    expect(payloadJson.eva.uuid).toEqual(rex.evaUuid);
  });
});
