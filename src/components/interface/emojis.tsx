import { FunctionComponent } from "react";
import Picker from "@emoji-mart/react";
import emojiPickerData from "@emoji-mart/data";

/**
 * Component to render both standard Unicode emojis and custom emoji images
 */
export const EmojiRenderer: FunctionComponent<{
  iconValue: string;
  customSizeEm?: number;
}> = ({ iconValue, customSizeEm = 1.1 }) => {
  if (!iconValue) return null;

  // Handle custom emojis by ID
  if (iconValue === "station") {
    return (
      <img
        src="/images/station.svg"
        alt="Station"
        style={{ width: `${customSizeEm}em`, height: `${customSizeEm}em` }}
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

  return <>{emoji}</>;
};

interface EmojiSelectEvent {
  unified?: string;
  id?: string;
  [key: string]: unknown;
}

interface CustomEmoji {
  id: string;
  name: string;
  keywords: string[];
  skins: { src: string }[];
}

interface CustomEmojiCategory {
  id: string;
  name: string;
  emojis: CustomEmoji[];
}

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
      ],
    },
    // Add more custom emoji categories here as needed
  ];

  const emojiCategories = customEmojis || defaultCustomEmojis;

  return (
    <Picker
      data={emojiPickerData}
      custom={emojiCategories}
      emojiButtonSize={emojiButtonSize}
      emojiSize={emojiSize}
      perLine={perLine}
      darkMode={darkMode}
      onEmojiSelect={onEmojiSelect}
    />
  );
};
