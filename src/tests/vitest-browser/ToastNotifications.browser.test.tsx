import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { page } from "vitest/browser";
import { ToastContainer } from "react-toastify";
import { displayToast } from "components/toastNotifications";
import { createReactHarness, type ReactHarness } from "./map/helpers/reactBrowserHarness";

let harness: ReactHarness;

beforeEach(() => {
  vi.clearAllMocks();
  harness = createReactHarness();
});

afterEach(() => {
  harness.unmount();
  vi.restoreAllMocks();
});

describe("displayToast", () => {
  it("renders alert toast with only OK button and resolves true when clicked", async () => {
    harness.render(<ToastContainer />);
    const onOk = vi.fn();

    const promise = displayToast({
      title: "Alert Title",
      message: "This is an alert message.",
      toastType: "alert",
      onOk,
    });

    await expect.element(page.getByText("Alert Title")).toBeInTheDocument();
    await expect.element(page.getByText("This is an alert message.")).toBeInTheDocument();
    await expect.element(page.getByRole("button", { name: "OK" })).toBeInTheDocument();
    await expect.element(page.getByRole("button", { name: "Cancel" })).not.toBeInTheDocument();

    await page.getByRole("button", { name: "OK" }).click();

    const result = await promise;
    expect(result).toBe(true);
    expect(onOk).toHaveBeenCalledTimes(1);
  });

  it("renders confirm toast with OK and Cancel buttons and resolves false when Cancel is clicked", async () => {
    harness.render(<ToastContainer />);
    const onCancel = vi.fn();

    const promise = displayToast({
      title: "Confirm Action",
      message: "Are you sure you want to proceed?",
      toastType: "confirm",
      onCancel,
    });

    await expect.element(page.getByText("Confirm Action")).toBeInTheDocument();
    await expect.element(page.getByText("Are you sure you want to proceed?")).toBeInTheDocument();
    await expect.element(page.getByRole("button", { name: "OK" })).toBeInTheDocument();
    await expect.element(page.getByRole("button", { name: "Cancel" })).toBeInTheDocument();

    await page.getByRole("button", { name: "Cancel" }).click();

    const result = await promise;
    expect(result).toBe(false);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("defaults to alert mode when toastType is omitted", async () => {
    harness.render(<ToastContainer />);

    const promise = displayToast({
      message: "Default alert message",
    });

    await expect.element(page.getByText("Default alert message")).toBeInTheDocument();
    await expect.element(page.getByRole("button", { name: "OK" })).toBeInTheDocument();
    await expect.element(page.getByRole("button", { name: "Cancel" })).not.toBeInTheDocument();

    await page.getByRole("button", { name: "OK" }).click();
    const result = await promise;
    expect(result).toBe(true);
  });
});
