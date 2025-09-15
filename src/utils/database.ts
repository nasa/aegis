import { OptimisticLockError } from "@mikro-orm/postgresql";
import random from "lodash/random";

/**
 * Retries a database upsert operation in case of an OptimisticLockError.
 * @param upsertFunction A function that performs a database upsert operation.
 * @returns
 */

export const upsertDatabaseRetry = async <T>(
  upsertFunction: () => Promise<T>
): Promise<T | undefined> => {
  let results: T;
  for (let tries = 0; tries < 7; tries++) {
    try {
      results = await upsertFunction();
      break; // If successful, exit the retry loop
    } catch (e) {
      if (e instanceof OptimisticLockError) {
        // Lock error. wait anywhere from 100-200ms before retrying
        await new Promise((resolve) => setTimeout(resolve, random(100, 200)));
      } else {
        // Some other kind of error happened
        // Re-throw it so the outer try/catch can grab it and exit the for loop
        throw e;
      }
    }
  }
  return results;
};
