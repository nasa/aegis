import { createSlice } from "@reduxjs/toolkit";

export const initialState: UserState = {
  isLoggedIn: false,
  user: null,
  missionPerms: null,
};

export const userSlice = createSlice({
  name: "user",
  initialState,
  reducers: {
    /* only called for populating store  */
    setUserStore: (state, action: { payload: UserState }) => {
      state.isLoggedIn = action.payload.isLoggedIn;
      state.user = action.payload.user;
      state.missionPerms = action.payload.missionPerms;
    },
    /* only called for populating store  */
    setMissionPerms: (state, action: { payload: Permission }) => {
      state.missionPerms = action.payload;
    },
  },
});

export const { setUserStore, setMissionPerms } = userSlice.actions;
