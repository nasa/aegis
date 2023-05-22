// TypeScript implmentation based on Slate documentation
// https://docs.slatejs.org/concepts/12-typescript
import { BaseEditor } from "slate";
import { ReactEditor } from "slate-react";

export type CustomText = { text: string; bold?: boolean; italic?: boolean; underline?: boolean };

export type ParagraphElement = {
  type: "paragraph";
  children: CustomText[];
  align?: Property.TextAlign;
};

export type BulletedListElement = {
  type: "bulleted-list";
  children: CustomText[];
};

export type ListItemElement = {
  type: "list-item";
  children: CustomText[];
};

export type NumberedListElement = {
  type: "numbered-list";
  children: CustomText[];
};

export type CustomElement =
  | ParagraphElement
  | BulletedListElement
  | ListItemElement
  | NumberedListElement;
export type CustomEditor = BaseEditor & ReactEditor;

declare module "slate" {
  interface CustomTypes {
    Editor: CustomEditor;
    Element: CustomElement;
    Text: CustomText;
  }
}
