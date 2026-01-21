import reducer, { initialState, deleteActionsFromDbByUuid } from "store/action";
import { describe, expect, it } from "@jest/globals";
import { createCustomTestStore } from "../factories/makeTestStore";
import { initialState as actionInitialState } from "store/action";
import { generateBlankAction } from "store/storeUtils/action";

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
  describe("Action: upsertActions success", () => {
    it("action/upsertActions", () => {
      // Arrange

      // Action Array to dispatch
      const actions: Action[] = [
        generateBlankAction({ uuid: "test" }),
        generateBlankAction({ uuid: "test2" }),
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

    it("action/upsertActionsFromDb", () => {
      // Action Array to dispatch
      const actions: Action[] = [
        generateBlankAction({ uuid: "test" }),
        generateBlankAction({ uuid: "test2" }),
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
    it("Should delete multiple actions", () => {
      // Action Array to dispatch
      const actions: Action[] = [
        generateBlankAction({
          uuid: "test",
        }),
        generateBlankAction({
          uuid: "test2",
        }),
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
    const store = createCustomTestStore({
      action: {
        ...actionInitialState,
        actions: [],
        actionsFromDb: [
          generateBlankAction({
            uuid: "test",
            name: "Jest Action-0",
          }),
          generateBlankAction({
            uuid: "test2",
            name: "Jest Action-1",
          }),
          generateBlankAction({
            uuid: "test3",
            name: "Jest Action-2",
          }),
          generateBlankAction({
            uuid: "test4",
            name: "Jest Action-3",
          }),
        ],
      },
    });

    // ensure the actions are in the store
    expect(store.getState().action.actionsFromDb.length).toEqual(4);

    // force it to think that the array is Action[] since uuid is all deleteActions really needs
    store.dispatch(deleteActionsFromDbByUuid(["test", "test3"]));

    // ensure the actions were deleted from the store
    expect(store.getState().action.actionsFromDb.length).toEqual(2);
    expect(store.getState().action.actionsFromDb[0].name).toEqual("Jest Action-1");
    expect(store.getState().action.actionsFromDb[1].name).toEqual("Jest Action-3");
  });
});
