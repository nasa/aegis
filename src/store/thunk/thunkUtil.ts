import type { AppDispatch, RootState } from "store";
import { createAsyncThunk } from "@reduxjs/toolkit";
import type { AsyncThunk, BaseThunkAPI } from "@reduxjs/toolkit/dist/createAsyncThunk";

type ThunkFunc<InputArg, ReturnType = void, RejectValue = unknown> = (
  input: InputArg,
  thunkApi: BaseThunkAPI<RootState, void, AppDispatch, RejectValue>
) => Promise<ReturnType>;

/**
 * This function is just a wrapper on createAsyncThunk that sets up the types for our app
 *
 * @param actionType should be the name of your thunk. So if your thunk function is called
 *                   `asyncDoSomething` then the actionType should be `asyncDoSomething`
 * @param thunkFunc the function that will be called when the thunk is dispatched
 * @returns
 */
const appCreateAsyncThunk = <ArgType, ReturnType = void, RejectValue = unknown>(
  actionType: string,
  thunkFunc: ThunkFunc<ArgType, ReturnType, RejectValue>
): AsyncThunk<
  ReturnType,
  ArgType,
  {
    state: RootState;
    dispatch: AppDispatch;
    rejectValue: RejectValue;
    // These are all things we could add to the type, but they're not needed anywhere at present
    // extra?: unknown;
    // serializedErrorType?: unknown;
    // pendingMeta?: unknown;
    // fulfilledMeta?: unknown;
    // rejectedMeta?: unknown;
  }
> => {
  return createAsyncThunk<ReturnType, ArgType, { rejectValue: RejectValue }>(
    "thunk/" + actionType,
    thunkFunc
  );
};

export default appCreateAsyncThunk;
