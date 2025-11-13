import { Descendant, Text } from "slate";
import styles from "./wysiwyg.module.css";

import escape from "lodash/escape";

/**
 * Recursively convert slate JSON node into an HTML string for display
 * @param node
 * @returns HTML string
 */
export function convertNodeToHTML(node: Descendant): string {
  if (Text.isText(node)) {
    let string = escape(node.text);
    if (node.bold) {
      string = `<strong>${string}</strong>`;
    }
    if (node.italic) {
      string = `<i>${string}</i>`;
    }
    if (node.underline) {
      string = `<u>${string}</u>`;
    }
    return string;
  }

  const children = node.children.map((n) => convertNodeToHTML(n)).join("");

  switch (node.type) {
    case "paragraph":
      return `<p class="${styles.wysiwygParagraph}">${children}</p>`;
    case "bulleted-list":
      return `<ul>${children}</ul>`;
    case "list-item":
      return `<li>${children}</li>`;
    case "numbered-list":
      return `<ol>${children}</ol>`;
    default:
      return children;
  }
}

/**
 * Convert a string to a slate JSON object.
 * If string is not in slate's data model JSON then it puts the content in an basic paragraph node
 * @param stringValue
 * @param defaultValue
 * @returns
 */
export function convertStringToNodes(stringValue: string, defaultValue: string = ""): Descendant[] {
  //if no description then use default value
  if (!stringValue) {
    return [
      {
        type: "paragraph",
        children: [{ text: defaultValue }],
      },
    ];
  } else {
    try {
      //Parse the text if it's in JSON
      const json = JSON.parse(stringValue);
      return json;
    } catch (e) {
      //If it's not in JSON form then it must be an old old pre-wysiwyg string
      if (e instanceof SyntaxError) {
        return [
          {
            type: "paragraph",
            children: [{ text: stringValue }],
          },
        ];
      }
    }
  }
}
