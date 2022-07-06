import { createSlice } from "@reduxjs/toolkit";
import { IronSessionData } from "iron-session";

export const initialState: UserState = {
  isLoggedIn: false,
  ironSessionData: null,
};

export const userSlice = createSlice({
  name: "user",
  initialState,
  reducers: {
    setIsLoggedIn: (state, action: { payload: boolean }) => {
      state.isLoggedIn = action.payload;
    },
    setIronSessionData: (state, action: { payload: IronSessionData }) => {
      state.ironSessionData = action.payload;
    },
    clearIronSessionData: (state) => {
      state.ironSessionData = null;
    },
  },
});

export const { setIsLoggedIn, setIronSessionData, clearIronSessionData } = userSlice.actions;
