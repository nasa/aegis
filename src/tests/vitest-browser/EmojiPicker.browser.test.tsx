import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode } from "react";
import { EmojiPicker } from "components/interface/emojis";
import { createReactHarness, type ReactHarness } from "./map/helpers/reactBrowserHarness";

let harness: ReactHarness;
beforeEach(() => {
  harness = createReactHarness();
});
afterEach(() => harness.unmount());

async function pickerButton(selector: string) {
  await expect
    .poll(() =>
      harness.container.querySelector("em-emoji-picker")?.shadowRoot?.querySelector(selector)
    )
    .toBeTruthy();
  return harness.container
    .querySelector("em-emoji-picker")
    .shadowRoot.querySelector<HTMLButtonElement>(selector);
}

describe("Emoji picker React integration", () => {
  it("selects Unicode and custom station emojis with the latest callback", async () => {
    const first = vi.fn();
    const next = vi.fn();
    harness.render(<EmojiPicker onEmojiSelect={first} />);
    (await pickerButton('button[aria-label="😀"]')).click();
    expect(first).toHaveBeenCalledWith(
      expect.objectContaining({ unified: "1f600" }),
      expect.anything()
    );

    harness.render(<EmojiPicker onEmojiSelect={next} />);
    (await pickerButton('button[aria-label="Artemis"]')).click();
    (await pickerButton('[data-id="artemis"] button[aria-posinset]')).click();
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ id: "station" }),
      expect.anything()
    );
    expect(first).toHaveBeenCalledTimes(1);
    expect(harness.container.querySelectorAll("em-emoji-picker")).toHaveLength(1);
  });

  it("survives StrictMode effect replay and removes the picker when closed", async () => {
    const onSelect = vi.fn();
    harness.render(
      <StrictMode>
        <EmojiPicker onEmojiSelect={onSelect} />
      </StrictMode>
    );
    (await pickerButton('button[aria-label="😀"]')).click();
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(harness.container.querySelectorAll("em-emoji-picker")).toHaveLength(1);
    const previous = harness.container.querySelector("em-emoji-picker");
    harness.render(null);
    expect(previous.isConnected).toBe(false);
    harness.render(
      <StrictMode>
        <EmojiPicker onEmojiSelect={onSelect} />
      </StrictMode>
    );
    (await pickerButton('button[aria-label="😀"]')).click();
    expect(onSelect).toHaveBeenCalledTimes(2);
    expect(harness.container.querySelectorAll("em-emoji-picker")).toHaveLength(1);
  });
});
