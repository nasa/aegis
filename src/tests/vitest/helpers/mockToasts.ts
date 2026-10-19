import type { Id } from "react-toastify";
import { toast } from "react-toastify";
import type { MockInstance } from "vitest";
import * as toastNotifications from "components/toastNotifications";

type ToastMethod = "success" | "info" | "warn" | "error" | "promise" | "update";

export type ToastSpies = Record<
  ToastMethod | "custom",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  MockInstance<(...args: any[]) => any>
>;

export const setupToastSpies = (): ToastSpies => {
  const custom = vi.spyOn(toastNotifications, "displayToast").mockImplementation((): Id => {
    return "";
  });
  const success = vi.spyOn(toast, "success").mockImplementation((): Id => {
    return "";
  });
  const info = vi.spyOn(toast, "info").mockImplementation((): Id => {
    return "";
  });
  const warn = vi.spyOn(toast, "warn").mockImplementation((): Id => {
    return "";
  });
  const error = vi.spyOn(toast, "error").mockImplementation((): Id => {
    return "";
  });
  const update = vi.spyOn(toast, "update").mockImplementation((): void => {
    return;
  });
  const promise = vi.spyOn(toast, "promise").mockImplementation(async (): Promise<void> => {
    return;
  });

  return { custom, success, info, warn, error, promise, update };
};

export const resetToastSpies = (spies: ToastSpies): void => {
  const spyList = Object.values(spies) as ToastSpies[keyof ToastSpies][];
  for (const spy of spyList) {
    spy.mockRestore();
  }
};
