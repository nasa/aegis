import type { Id } from "react-toastify";
import { toast } from "react-toastify";
import { vi, type MockInstance } from "vitest";
import * as toastNotifications from "components/toastNotifications";

export type ToastSpies = {
  custom: MockInstance<(options: toastNotifications.DisplayToastOptions) => Promise<boolean>>;
  success: MockInstance<typeof toast.success>;
  info: MockInstance<typeof toast.info>;
  warn: MockInstance<typeof toast.warn>;
  error: MockInstance<typeof toast.error>;
  update: MockInstance<typeof toast.update>;
  promise: MockInstance<typeof toast.promise>;
};

export const setupToastSpies = (): ToastSpies => {
  const custom = vi
    .spyOn(toastNotifications, "displayToast")
    .mockImplementation(async (): Promise<boolean> => {
      return true;
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
  const spyList = Object.values(spies) as MockInstance[];
  for (const spy of spyList) {
    spy.mockRestore();
  }
};
