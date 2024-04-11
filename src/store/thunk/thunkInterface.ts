import appCreateAsyncThunk from "./thunkUtil";
import { setRightPanelIsOpen, stmViewSetExpandedItems } from "store/interface";

export const thunkSetRightPanelIsOpenIfAuto = appCreateAsyncThunk<boolean>(
  "setRightPanelIsOpenIfAuto",
  async (isOpen, { getState, dispatch }) => {
    if (getState().interface.autoRightPanelOpen) dispatch(setRightPanelIsOpen(isOpen));
  }
);

export const thunkExpandAllLevel3s = appCreateAsyncThunk<void>(
  "expandAllLevel3s",
  async (_, { getState, dispatch }) => {
    const newExpandedItems: STMViewExpandedItem[] = [...getState().interface.stmViewExpandedItems];
    for (const level3 of getState().stm.level3s) {
      if (
        getState().interface.stmViewExpandedItems.includes({ type: "level3", uuid: level3.uuid })
      ) {
        continue;
      } else {
        newExpandedItems.push({ type: "level3", uuid: level3.uuid });
      }
    }
    dispatch(stmViewSetExpandedItems(newExpandedItems));
  }
);

export const thunkCollapseAllLevel3s = appCreateAsyncThunk<void>(
  "collapseAllLevel3s",
  async (_, { getState, dispatch }) => {
    const newExpandedItems: STMViewExpandedItem[] = [];
    for (const expandedItem of getState().interface.stmViewExpandedItems) {
      if (expandedItem.type === "level3") {
        continue;
      } else {
        newExpandedItems.push(expandedItem);
      }
    }
    dispatch(stmViewSetExpandedItems(newExpandedItems));
  }
);
