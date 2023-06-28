import { Editable, RenderElementProps, RenderLeafProps, Slate, withReact } from "slate-react";
import { createEditor, Descendant, Text, Editor } from "slate";
import { CustomEditor } from "typings/wysiwyg";
import { FunctionComponent, useCallback, useEffect, useState } from "react";
import styles from "./wysiwyg.module.css";
import _ from "lodash";
import isHotkey from "is-hotkey";

const HOTKEYS = {
  "mod+b": "bold",
  "mod+i": "italic",
  "mod+u": "underline",
};

const Element = ({ attributes, children, element }: RenderElementProps) => {
  switch (element.type) {
    case "bulleted-list":
      return <ul {...attributes}>{children}</ul>;
    case "list-item":
      return <li {...attributes}>{children}</li>;
    case "numbered-list":
      return <ol {...attributes}>{children}</ol>;
    case "paragraph":
      const style = { textAlign: element.align };
      return (
        <p style={style} {...attributes} className={styles.wysiwygParagraph}>
          {children}
        </p>
      );
    default:
      return (
        <p {...attributes} className={styles.wysiwygParagraph}>
          {children}
        </p>
      );
  }
};

//The lowest leaf nodes in the hierarcy.
const Leaf = ({ attributes, children, leaf }: RenderLeafProps) => {
  if (leaf.bold) {
    children = <strong>{children}</strong>;
  }
  if (leaf.italic) {
    children = <em>{children}</em>;
  }
  if (leaf.underline) {
    children = <u>{children}</u>;
  }

  return <span {...attributes}>{children}</span>;
};

/**
 * Recursively convert slate JSON node into an HTML string for display
 * @param node
 * @returns HTML string
 */
function convertNodeToHTML(node: Descendant): string {
  if (Text.isText(node)) {
    let string = _.escape(node.text);
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
function convertStringToNodes(stringValue: string, defaultValue: string = ""): Descendant[] {
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

//used for toggling hot keys
const toggleMark = (editor: CustomEditor, format: string) => {
  const isActive = isMarkActive(editor, format);

  if (isActive) {
    Editor.removeMark(editor, format);
  } else {
    Editor.addMark(editor, format, true);
  }
};

//used for toggling hot keys
const isMarkActive = (editor: CustomEditor, format: string) => {
  const marks = Editor.marks(editor);
  return marks ? marks[format] === true : false;
};

export const WysiwygTextArea: FunctionComponent<{
  value: string;
  editing: boolean;
  onChange: (value: string) => void;
  defaultValue?: string;
}> = ({ value, editing, onChange, defaultValue }) => {
  const [editor] = useState(() => withReact(createEditor()));

  const renderElement = useCallback((props) => <Element {...props} />, []);
  const renderLeaf = useCallback((props) => <Leaf {...props} />, []);

  //reset the selector to prevent a bug where a previous edited field had more new lines
  //  than the new current field being edited. The selector will try to find the old location
  useEffect(() => {
    editor.selection = {
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [0, 0], offset: 0 },
    };
  }, [editing, editor]);

  return (
    <>
      {editing ? (
        <Slate
          editor={editor}
          value={convertStringToNodes(value, defaultValue)}
          onChange={(nodes: Descendant[]) => {
            const isAstChange = editor.operations.some((op) => "set_selection" !== op.type);
            if (isAstChange) {
              onChange(JSON.stringify(nodes));
            }
          }}
        >
          <Editable
            renderElement={renderElement}
            renderLeaf={renderLeaf}
            spellCheck
            className={styles.wysiwyg}
            onKeyDown={(event) => {
              for (const hotkey in HOTKEYS) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                if (isHotkey(hotkey, event as any)) {
                  event.preventDefault();
                  const mark = HOTKEYS[hotkey];
                  toggleMark(editor, mark);
                }
              }
            }}
          />
        </Slate>
      ) : (
        <div
          className={styles.notesText}
          dangerouslySetInnerHTML={{
            __html: _.reduce(
              convertStringToNodes(value),
              (htmlString, decendant) => htmlString + convertNodeToHTML(decendant),
              ""
            ),
          }}
        />
      )}
    </>
  );
};
