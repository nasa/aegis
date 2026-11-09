import type { FunctionComponent } from "react";
import { useEffect, useRef } from "react";
import { Picker } from "emoji-mart";
import emojiPickerData from "@emoji-mart/data";
import { getCustomEmoji } from "utils/emojis";

/**
 * Component to render both standard Unicode emojis and custom emoji images
 *
 * Image-backed icons are sized by `customSizeEm` unless `imageClassName` is
 * supplied, in which case the class takes over all sizing/spacing.
 */
export const EmojiRenderer: FunctionComponent<{
  iconValue: string;
  customSizeEm?: number;
  /** Class applied to image-backed icons; replaces the inline em sizing. */
  imageClassName?: string;
  /** Optional wrapper class for Unicode emoji text. */
  textClassName?: string;
}> = ({ iconValue, customSizeEm = 1.1, imageClassName, textClassName }) => {
  if (!iconValue) return null;

  const imageStyle = imageClassName
    ? undefined
    : { width: `${customSizeEm}em`, height: `${customSizeEm}em` };

  const customEmoji = getCustomEmoji(iconValue);
  if (customEmoji) {
    return (
      <img
        src={customEmoji.src}
        alt={customEmoji.alt}
        className={imageClassName}
        style={imageStyle}
      />
    );
  }
  if (iconValue === "astronaut") {
    return (
      <img
        src="/images/astronaut_outline.svg"
        alt="Astronaut"
        className={imageClassName}
        style={imageStyle}
      />
    );
  }

  // Handle standard Unicode emojis
  let emoji;
  try {
    emoji = iconValue
      .split("-")
      .map((codePoint) => String.fromCodePoint(parseInt(codePoint, 16)))
      .join("");
  } catch (e) {
    return null;
  }

  return textClassName ? <span className={textClassName}>{emoji}</span> : <>{emoji}</>;
};

/**
 * Custom emoji picker component with configurable custom emojis
 */
export const EmojiPicker: FunctionComponent<{
  onEmojiSelect: (emoji: EmojiSelectEvent) => void;
  emojiButtonSize?: number;
  emojiSize?: number;
  perLine?: number;
  darkMode?: boolean;
  customEmojis?: CustomEmojiCategory[];
}> = ({
  onEmojiSelect,
  emojiButtonSize = 30,
  emojiSize = 20,
  perLine = 10,
  darkMode = true,
  customEmojis,
}) => {
  // Default custom emoji configuration for station icon
  const defaultCustomEmojis: CustomEmojiCategory[] = [
    {
      id: "artemis",
      name: "Artemis",
      emojis: [
        {
          id: "station",
          name: "Station",
          keywords: ["station", "location", "marker", "artemis"],
          skins: [{ src: "/images/station.svg" }],
        },
        {
          id: "astronaut",
          name: "Astronaut",
          keywords: ["astro", "astronaut"],
          skins: [{ src: "/images/astronaut_outline.svg" }],
        },
      ],
    },
    // Add more custom emoji categories here as needed
  ];

  const emojiCategories = customEmojis || defaultCustomEmojis;

  const options = {
    data: emojiPickerData,
    custom: emojiCategories,
    emojiButtonSize,
    emojiSize,
    perLine,
    darkMode,
    onEmojiSelect,
  };
  const containerRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<Picker | null>(null);
  const initialOptions = useRef(options);

  useEffect(() => {
    const picker = new Picker(initialOptions.current);
    pickerRef.current = picker;
    containerRef.current?.appendChild(picker);
    return () => {
      picker.remove();
      pickerRef.current = null;
    };
  }, []);

  useEffect(() => {
    pickerRef.current?.update(options);
  });

  return <div ref={containerRef} />;
};
