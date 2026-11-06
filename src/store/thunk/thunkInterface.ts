import Cookies from "js-cookie";
import appCreateAsyncThunk from "./thunkUtil";
import {
  setBottomPanelIsOpen,
  setGridLabelSchemeOverride,
  setRightPanelIsOpen,
} from "store/interface";
import { stmViewSetExpandedItems } from "store/stm";
import { getMissionDocHandle } from "client/automergeDocHandles";

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
    for (const level3 of Object.values(getMissionDocHandle()?.doc()?.stmLevel3s ?? {})) {
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

const GRID_LABEL_SCHEME_COOKIE = "AEGIS_Grid_Label_Scheme";
const GRID_LABEL_SCHEMES: readonly GridLabelScheme[] = ["lunar-acc", "mgrs"];

/** The user's saved Earth label scheme override, or null when there is none or it is invalid. */
export const readGridLabelSchemeCookie = (): GridLabelScheme | null => {
  const saved = Cookies.get(GRID_LABEL_SCHEME_COOKIE);
  return GRID_LABEL_SCHEMES.find((scheme) => scheme === saved) ?? null;
};

/** Set (or clear, with null) the user's Earth label scheme override and save it in a cookie. */
export const thunkSetGridLabelSchemeOverride = appCreateAsyncThunk<GridLabelScheme | null>(
  "setGridLabelSchemeOverride",
  async (scheme, { dispatch }) => {
    if (scheme === null) {
      Cookies.remove(GRID_LABEL_SCHEME_COOKIE, { path: "/" });
    } else {
      Cookies.set(GRID_LABEL_SCHEME_COOKIE, scheme, { path: "/", expires: 365 });
    }
    dispatch(setGridLabelSchemeOverride(scheme));
  }
);
