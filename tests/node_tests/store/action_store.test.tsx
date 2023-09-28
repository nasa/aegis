import reducer, { initialState, deleteActionsFromDbByUuid } from "store/action";
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { getORM, getEM, closeORM } from "utils/mikro";
import { v4 as uuidv4 } from "uuid";
import UserFactory from "../../factories/UserFactory";
import MissionFactory from "../../factories/MissionFactory";
import makeTestStore from "../../factories/makeTestStore";
import { Mission as Mission_db } from "server/database/models/mission.model";
import { User as User_db } from "server/database/models/user.model";

let testMission: Mission_db;
let testAdmin: User_db;

beforeAll(async () => {
  await getORM();
  const em = getEM();
  testMission = await new MissionFactory(em).createOne();
  testAdmin = await new UserFactory(em).createOne({
    permissionList: [
      {
        missionId: testMission.id,
        permissions: {
          edit: true,
          view: true,
        },
      },
    ],
  });
});

describe("Action Store Tests", () => {
  it("should return the initial state on first run", () => {
    // Arrange
    const nextState = initialState;

    // Act
    const result = reducer(undefined, {
      type: undefined,
    });

    // Assert
    expect(result).toEqual(nextState);
  });
  describe("Action: upsertAction success", () => {
    it("should upsert an action by UUID", () => {
      // Arrange
      const nextAction = {
        type: "action/upsertAction",
        payload: {
          uuid: "test",
          name: "test",
          description: "test",
          priority: 5,
          durationLower: 5,
          equipmentItemsUsage: [],
          mass: 1,
          type: "measurement",
          status: "Candidate",
          missionId: 5000,
          rexStatus: null,
          createdAt: "test",
          updatedAt: "test",
        } as Action,
      };

      // Act
      const result = reducer(initialState, nextAction);
      // Assert
      expect(result.actions[0]).toEqual(nextAction.payload);
    });

    it("should upsert multiple actions", () => {
      // Arrange

      // Action Array to dispatch
      const actions: Action[] = [
        {
          uuid: "test",
          name: "test",
          description: "test",
          location: null,
          elevation: 1,
          icon: null,
          priority: 5,
          durationLower: 5,
          equipmentItemsUsage: [],
          geographicUnitsUsage: [],
          mass: 1,
          type: "measurement",
          status: "Candidate",
          enabled: true,
          missionId: 5000,
          crewAssigned: [],
          rexStatus: null,
          createdAt: "test",
          updatedAt: "test",
        },
        {
          uuid: "test2",
          name: "test2",
          description: "test2",
          location: null,
          elevation: 1,
          icon: null,
          priority: 5,
          durationLower: 5,
          equipmentItemsUsage: [],
          geographicUnitsUsage: [],
          mass: 1,
          type: "measurement",
          status: "Candidate",
          enabled: true,
          missionId: 2002,
          crewAssigned: [],
          rexStatus: null,
          createdAt: "test2",
          updatedAt: "test2",
        },
      ];

      // Act
      const result = reducer(initialState, {
        type: "action/upsertActions",
        payload: actions,
      });
      // Assert
      expect(result.actions[0]).toEqual(actions[0]);
      expect(result.actions[1]).toEqual(actions[1]);
    });

    it("Should Upsert an action from DB", () => {
      // Action Array to dispatch
      const actions: Action[] = [
        {
          uuid: "test",
          name: "test",
          description: "test",
          location: null,
          elevation: 1,
          icon: null,
          priority: 5,
          durationLower: 5,
          equipmentItemsUsage: [],
          geographicUnitsUsage: [],
          mass: 1,
          type: "measurement",
          status: "Candidate",
          enabled: true,
          missionId: 5000,
          crewAssigned: [],
          rexStatus: null,
          createdAt: "test",
          updatedAt: "test",
        },
        {
          uuid: "test2",
          name: "test2",
          description: "test2",
          location: null,
          elevation: 1,
          icon: null,
          priority: 5,
          durationLower: 5,
          equipmentItemsUsage: [],
          geographicUnitsUsage: [],
          mass: 1,
          type: "measurement",
          status: "Candidate",
          enabled: true,
          missionId: 2002,
          crewAssigned: [],
          rexStatus: null,
          createdAt: "test2",
          updatedAt: "test2",
        },
      ];

      // Act
      const result = reducer(initialState, {
        type: "action/upsertActionsFromDb",
        payload: actions,
      });
      // Assert
      expect(result.actionsFromDb[0]).toEqual(actions[0]);
      expect(result.actionsFromDb[1]).toEqual(actions[1]);
    });
    it("Should delete an single action", () => {
      // Arrange
      const nextAction = {
        type: "action/upsertAction",
        payload: {
          uuid: "test",
          name: "test",
          description: "test",
          priority: 5,
          durationLower: 5,
          equipmentItemsUsage: [],
          mass: 1,
          type: "measurement",
          status: "Candidate",
          enabled: true,
          missionId: 5000,
          createdAt: "test",
          updatedAt: "test",
        } as Action,
      };

      // Act
      const result = reducer(initialState, nextAction);
      // Assert
      expect(result.actions[0]).toEqual(nextAction.payload);
      const deleteAction = {
        type: "action/deleteActionByUuid",
        payload: "test",
      };
      const result2 = reducer(result, deleteAction);
      expect(result2.actions.length).toEqual(0);
    });
    it("Should delete multiple actions", () => {
      // Action Array to dispatch
      const actions: Action[] = [
        {
          uuid: "test",
          name: "test",
          description: "test",
          location: null,
          elevation: 1,
          icon: null,
          priority: 5,
          durationLower: 5,
          equipmentItemsUsage: [],
          geographicUnitsUsage: [],
          mass: 1,
          type: "measurement",
          status: "Candidate",
          enabled: true,
          missionId: 5000,
          crewAssigned: [],
          rexStatus: null,
          createdAt: "test",
          updatedAt: "test",
        },
        {
          uuid: "test2",
          name: "test2",
          description: "test2",
          location: null,
          elevation: 1,
          icon: null,
          priority: 5,
          durationLower: 5,
          equipmentItemsUsage: [],
          geographicUnitsUsage: [],
          mass: 1,
          type: "measurement",
          status: "Candidate",
          enabled: true,
          missionId: 2002,
          crewAssigned: [],
          rexStatus: null,
          createdAt: "test2",
          updatedAt: "test2",
        },
      ];

      // Act
      const result = reducer(initialState, {
        type: "action/upsertActions",
        payload: actions,
      });
      // Assert
      expect(result.actions[0]).toEqual(actions[0]);
      expect(result.actions[1]).toEqual(actions[1]);
      const deleteAction = {
        type: "action/deleteActionsByUuid",
        payload: ["test", "test2"],
      };
      const result2 = reducer(result, deleteAction);
      expect(result2.actions.length).toEqual(0);
    });
  });
});

describe("Action Store Tests with mock store", () => {
  test("Delete actions", () => {
    const uuids = [uuidv4(), uuidv4(), uuidv4(), uuidv4()];

    const store = makeTestStore({
      action: {
        actions: [],
        actionsFromDb: [
          {
            uuid: uuids[0],
            name: "Jest Action-0",
            missionId: 1,
            priority: 1,
            type: "measurement",
            description: "",
            location: null,
            elevation: 1,
            icon: null,
            durationLower: 5,
            equipmentItemsUsage: [],
            geographicUnitsUsage: [],
            crewAssigned: [],
            rexStatus: null,
            mass: 1,
            status: "Approved",
            enabled: true,
          },
          {
            uuid: uuids[1],
            name: "Jest Action-1",
            missionId: 1,
            priority: 1,
            type: "measurement",
            description: "",
            location: null,
            elevation: 1,
            icon: null,
            durationLower: 5,
            equipmentItemsUsage: [],
            geographicUnitsUsage: [],
            crewAssigned: [],
            rexStatus: null,
            mass: 1,
            status: "Approved",
            enabled: true,
          },
          {
            uuid: uuids[2],
            name: "Jest Action-2",
            missionId: 1,
            priority: 1,
            type: "measurement",
            description: "",
            location: null,
            elevation: 1,
            icon: null,
            durationLower: 5,
            equipmentItemsUsage: [],
            geographicUnitsUsage: [],
            crewAssigned: [],
            rexStatus: null,
            mass: 1,
            status: "Approved",
            enabled: true,
          },
          {
            uuid: uuids[3],
            name: "Jest Action-3",
            missionId: 1,
            priority: 1,
            type: "measurement",
            description: "",
            location: null,
            elevation: 1,
            icon: null,
            durationLower: 5,
            equipmentItemsUsage: [],
            geographicUnitsUsage: [],
            crewAssigned: [],
            rexStatus: null,
            mass: 1,
            status: "Approved",
            enabled: true,
          },
        ],
      },
    });

    // ensure the actions are in the store
    expect(store.getState().action.actionsFromDb.length).toEqual(4);

    // force it to think that the array is Action[] since uuid is all deleteActions really needs
    store.dispatch(deleteActionsFromDbByUuid([uuids[0], uuids[2]]));

    // ensure the actions were deleted from the store
    expect(store.getState().action.actionsFromDb.length).toEqual(2);
    expect(store.getState().action.actionsFromDb[0].name).toEqual("Jest Action-1");
    expect(store.getState().action.actionsFromDb[1].name).toEqual("Jest Action-3");
  });
});

afterAll(async () => {
  //Cleanup our Database
  const em = getEM();
  await em.nativeDelete(Mission_db, { id: testMission.id });
  await em.nativeDelete(User_db, { id: testAdmin.id });
  // Closing the DB connection allows Jest to exit successfully.
  await closeORM();
});
