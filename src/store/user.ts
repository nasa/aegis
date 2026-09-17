import { createSlice } from "@reduxjs/toolkit";

export const initialState: UserState = {
  isLoggedIn: false,
  launchpadUser: null,
  appUserId: null,
  isSuperUser: false,
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
      state.isSuperUser = action.payload.isSuperUser;
      state.missionPermLevel = action.payload.missionPermLevel;
    },
    setLaunchpadUser: (state, action: { payload: LaunchpadUser }) => {
      state.launchpadUser = action.payload;
      state.isLoggedIn = !!action.payload;
    },
    setAppUserId: (state, action: { payload: number | null }) => {
      state.appUserId = action.payload;
    },
    setIsSuperUser: (state, action: { payload: boolean }) => {
      state.isSuperUser = action.payload;
    },
    setMissionPermLevel: (state, action: { payload: PermissionLevel | null }) => {
      state.missionPermLevel = action.payload;
    },
  },
});

export const { setUserState, setLaunchpadUser, setAppUserId, setIsSuperUser, setMissionPermLevel } =
  userSlice.actions;
