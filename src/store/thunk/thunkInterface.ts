import _ from "lodash";
import appCreateAsyncThunk from "./thunkUtil";
import { setRightPanelIsOpen } from "store/interface";

export const thunkSetRightPanelIsOpenIfAuto = appCreateAsyncThunk<boolean>(
  "setRightPanelIsOpenIfAuto",
  async (isOpen, { getState, dispatch }) => {
    if (getState().interface.autoRightPanelOpen) dispatch(setRightPanelIsOpen(isOpen));
  }
);
