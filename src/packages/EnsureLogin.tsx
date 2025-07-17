import { FC, useEffect } from "react";
import { getCurrentUser } from "./getCurrentUser";
import { setupFetchFns } from "./fetchFns";
import { useAppDispatch } from "utils/useAppDispatch";
import { setLaunchpadUser } from "store/user";

export const EnsureLogin: FC<{ fqdn?: string }> = ({ fqdn = "" }) => {
  const dispatch = useAppDispatch();
  useEffect(() => {
    setupFetchFns();
    getCurrentUser().then((user) => {
      if (user instanceof Error) {
        console.error("Unable to get current user", user);
        return;
      }
      console.log(`Launchpad authorized with user: ${user.display_name || "unknown user"}`);
      dispatch(setLaunchpadUser(user));
    });
  }, [dispatch, fqdn]);

  // component has no display, just ensures login
  return null;
};
