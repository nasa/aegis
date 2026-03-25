import { asError } from "@emss/utils";
// import { fetchJsonWithAuth } from "@emss/oauth2-proxy-frontend";
import { fetchJsonWithAuth } from "./fetchFns";

let currentUser: undefined | LaunchpadUser;

export const getCurrentUser = async (): Promise<LaunchpadUser | Error> => {
  if (currentUser) {
    return currentUser;
  }

  try {
    const json = await fetchJsonWithAuth<{ user: LaunchpadUser }>("/api/v1/user/current");
    if (json instanceof Error) {
      console.error("Unable to get current user", json);
      return json;
    }
    if (!json.user) {
      return new Error("No user found in /api/v1/user/current response");
    }
    currentUser = json.user;

    return currentUser;
  } catch (err) {
    return asError(err);
  }
};

export const clearCurrentUser = (): void => {
  currentUser = undefined;
};
