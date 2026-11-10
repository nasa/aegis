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
