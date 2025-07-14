import { createSlice } from "@reduxjs/toolkit";

export const initialState: UserState = {
  isLoggedIn: false,
  appUser: null,
  missionPerms: null,
  launchpadUser: null,
};

export const userSlice = createSlice({
  name: "user",
  initialState,
  reducers: {
    setAppUser: (
      state,
      action: {
        payload: {
          isLoggedIn: boolean;
          user: AppUser;
          missionPerms: Permission | null;
        };
      }
    ) => {
      state.isLoggedIn = action.payload.isLoggedIn;
      state.appUser = action.payload.user;
      state.missionPerms = action.payload.missionPerms;
    },
    setLaunchpadUser: (state, action: { payload: LaunchpadUser }) => {
      state.launchpadUser = action.payload;
    },
    setMissionPerms: (state, action: { payload: Permission }) => {
      state.missionPerms = action.payload;
    },
    obliterateState: (state) => {
      //eslint-disable-next-line
      state = Object.assign(state, initialState);
    },
  },
});

export const { setAppUser, setLaunchpadUser, setMissionPerms, obliterateState } = userSlice.actions;
