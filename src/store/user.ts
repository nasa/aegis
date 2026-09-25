import { createSlice } from "@reduxjs/toolkit";

export const initialState: UserState = {
  isLoggedIn: false,
  launchpadUser: null,
  appUserId: null,
  missionPermLevel: null,
};

export const userSlice = createSlice({
  name: "user",
  initialState,
  reducers: {
    setUserState: (state, action: { payload: UserState }) => {
      state.isLoggedIn = action.payload.isLoggedIn;
      state.launchpadUser = action.payload.launchpadUser;
      state.appUserId = action.payload.appUserId;
      state.missionPermLevel = action.payload.missionPermLevel;
    },
    setLaunchpadUser: (state, action: { payload: LaunchpadUser }) => {
      state.launchpadUser = action.payload;
      state.isLoggedIn = !!action.payload;
    },
    setAppUserId: (state, action: { payload: number | null }) => {
      state.appUserId = action.payload;
    },
  },
});

export const { setUserState, setLaunchpadUser, setAppUserId } = userSlice.actions;
