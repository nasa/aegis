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
    setUserStore: (state, action: { payload: UserState }) => {
      state.isLoggedIn = action.payload.isLoggedIn;
      state.user = action.payload.user;
      state.missionPerms = action.payload.missionPerms;
    },
    setMissionPerms: (state, action: { payload: Permission }) => {
      state.missionPerms = action.payload;
    },
    clearUserStore: (state) => {
      state.user = null;
      state.isLoggedIn = false;
      state.missionPerms = null;
    },
  },
});

export const { setUserStore, setMissionPerms, clearUserStore } = userSlice.actions;
