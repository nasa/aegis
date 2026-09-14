import type { Id } from "react-toastify";
import { toast } from "react-toastify";
import type { MockInstance } from "vitest";

type ToastMethod = "success" | "info" | "warn" | "error" | "promise" | "update";

export type ToastSpies = Record<
  ToastMethod,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  MockInstance<(...args: any[]) => any>
>;

export const setupToastSpies = (): ToastSpies => {
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

  return { success, info, warn, error, promise, update };
};

export const resetToastSpies = (spies: ToastSpies): void => {
  for (const spy of Object.values(spies)) {
    spy.mockRestore();
  }
};
