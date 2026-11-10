import { Icon } from "ol/style";
import { getCustomEmoji } from "utils/emojis";
import { renderEmojiToCanvas } from "./emojiRenderer";

/** Custom emoji load as images; Unicode emoji use a HiDPI canvas. */
export function createEmojiIcon(emoji: string, size: number): Icon {
  const customEmoji = getCustomEmoji(emoji);
  return new Icon({
    ...(customEmoji ? { src: customEmoji.src } : { img: renderEmojiToCanvas(emoji, size) }),
    width: size,
    height: size,
    anchor: [0.5, 0.5],
    anchorXUnits: "fraction",
    anchorYUnits: "fraction",
  });
}
