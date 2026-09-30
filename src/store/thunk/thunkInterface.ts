import appCreateAsyncThunk from "./thunkUtil";
import { setBottomPanelIsOpen, setRightPanelIsOpen } from "store/interface";
import { stmViewSetExpandedItems } from "store/stm";

export const thunkSetRightPanelIsOpenIfAuto = appCreateAsyncThunk<boolean>(
  "setRightPanelIsOpenIfAuto",
  async (isOpen, { getState, dispatch }) => {
    if (getState().interface.autoRightPanelOpen) dispatch(setRightPanelIsOpen(isOpen));
  }
);

export const thunkSetBottomPanelIsOpenIfAuto = appCreateAsyncThunk<boolean>(
  "setBottomPanelIsOpenIfAuto",
  async (isOpen, { getState, dispatch }) => {
    if (getState().interface.autoBottomPanelOpen) dispatch(setBottomPanelIsOpen(isOpen));
  }
);

export const thunkExpandAllLevel3s = appCreateAsyncThunk<void>(
  "expandAllLevel3s",
  async (_, { getState, dispatch }) => {
    const newExpandedItems: STMViewExpandedItem[] = [...getState().stm.stmViewExpandedItems];
    for (const level3 of getState().stm.level3s) {
      if (getState().stm.stmViewExpandedItems.includes({ type: "level3", uuid: level3.uuid })) {
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
    for (const expandedItem of getState().stm.stmViewExpandedItems) {
      if (expandedItem.type === "level3") {
        continue;
      } else {
        newExpandedItems.push(expandedItem);
      }
    }
    dispatch(stmViewSetExpandedItems(newExpandedItems));
  }
);
