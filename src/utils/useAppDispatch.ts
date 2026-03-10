// eslint-disable-next-line no-restricted-imports
import { useDispatch } from "react-redux";
import store from "store";

export type AppDispatch = typeof store.dispatch;

// Export a hook that can be reused to resolve types
// ref: https://redux-toolkit.js.org/usage/usage-with-typescript
export const useAppDispatch: () => AppDispatch = useDispatch;
