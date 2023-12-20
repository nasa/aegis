import { Editable, RenderElementProps, RenderLeafProps, Slate, withReact } from "slate-react";
import { createEditor, Descendant, Text, Editor, Transforms, Element as SlateElement } from "slate";
import { BulletedListElement, CustomEditor, NumberedListElement, Marks } from "typings/wysiwyg";
import { FunctionComponent, useCallback, useRef, useState } from "react";
import {
  IconDefinition,
  faBold,
  faItalic,
  faListOl,
  faListUl,
  faUnderline,
} from "@fortawesome/free-solid-svg-icons";
import styles from "./wysiwyg.module.css";
import _ from "lodash";
import isHotkey from "is-hotkey";
import { TextboxButton } from "./globalFields";

const HOTKEYS = {
  "mod+b": "bold",
  "mod+i": "italic",
  "mod+u": "underline",
};

const LIST_TYPES = ["numbered-list", "bulleted-list"];

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
export function convertNodeToHTML(node: Descendant): string {
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

//used for toggling rich text
const toggleMark = (editor: CustomEditor, format: string) => {
  const isActive = isMarkActive(editor, format);

  if (isActive) {
    Editor.removeMark(editor, format);
  } else {
    Editor.addMark(editor, format, true);
  }
};

//used for toggling rich blocks
const toggleBlock = (editor: CustomEditor, format: "numbered-list" | "bulleted-list") => {
  const isActive = isBlockActive(editor, format);
  const isList = LIST_TYPES.includes(format);

  Transforms.unwrapNodes(editor, {
    match: (n) => !Editor.isEditor(n) && SlateElement.isElement(n) && LIST_TYPES.includes(n.type),
    split: true,
  });

  const newProperties: Partial<SlateElement> = {
    type: isActive
      ? "paragraph"
      : isList
        ? "list-item"
        : format === "numbered-list"
          ? "numbered-list"
          : format === "bulleted-list"
            ? "bulleted-list"
            : "paragraph",
  };
  Transforms.setNodes<SlateElement>(editor, newProperties);

  if (!isActive && isList) {
    const block: NumberedListElement | BulletedListElement = { type: format, children: [] };
    Transforms.wrapNodes(editor, block);
  }
};

//used for toggling hot keys
const isMarkActive = (editor: CustomEditor, format: string) => {
  const marks = Editor.marks(editor);
  return marks ? marks[format as keyof Marks] === true : false;
};

//used for toggling blocks
const isBlockActive = (editor: CustomEditor, format: string, blockType: string = "type") => {
  const { selection } = editor;
  if (!selection) return false;

  const [match] = Array.from(
    Editor.nodes(editor, {
      at: Editor.unhangRange(editor, selection),
      match: (n) =>
        !Editor.isEditor(n) &&
        SlateElement.isElement(n) &&
        n[blockType as keyof typeof n] === format,
    })
  );

  return !!match;
};

const MarkButton = ({
  editor,
  format,
  icon,
}: {
  editor: CustomEditor;
  format: string;
  icon: IconDefinition;
}) => {
  return (
    <div className={styles.wysiwygButton}>
      <TextboxButton
        active={isMarkActive(editor, format)}
        icon={icon}
        onMouseDown={(e) => {
          e.preventDefault();
          toggleMark(editor, format);
        }}
        whiteOnToggle={false}
      />
    </div>
  );
};

const BlockButton = ({
  editor,
  format,
  icon,
}: {
  editor: CustomEditor;
  format: "numbered-list" | "bulleted-list";
  icon: IconDefinition;
}) => {
  return (
    <div className={styles.wysiwygButton}>
      <TextboxButton
        active={isBlockActive(editor, format)}
        icon={icon}
        onMouseDown={(e) => {
          e.preventDefault();
          toggleBlock(editor, format);
        }}
        whiteOnToggle={true}
      />
    </div>
  );
};

export const WysiwygTextArea: FunctionComponent<{
  value: string;
  editing: boolean;
  onChange: (value: string) => void;
  defaultValue?: string; //string to show if value is empty
}> = ({ value, editing, onChange, defaultValue }) => {
  //start
  const [editor] = useState(() => withReact(createEditor()));
  const [editorChange, setEditorChange] = useState(false);

  const debouncedSubmitRef = useRef(
    _.debounce((value) => {
      if (onChange) onChange(value);
    }, 50)
  );

  const renderElement = useCallback((props: RenderElementProps) => <Element {...props} />, []);
  const renderLeaf = useCallback((props: RenderLeafProps) => <Leaf {...props} />, []);

  return (
    <>
      {editing ? (
        <Slate
          editor={editor}
          initialValue={convertStringToNodes(value, defaultValue)}
          onChange={(nodes: Descendant[]) => {
            const isAstChange = editor.operations.some((op) => "set_selection" !== op.type);
            if (isAstChange) {
              debouncedSubmitRef.current(JSON.stringify(nodes));
            }
            setEditorChange(!editorChange);
          }}
        >
          <div className={styles.wysiwygButtonContainer}>
            <div className={styles.wysiwygButtonSubcontainer}>
              <MarkButton editor={editor} format="bold" icon={faBold} />
              <MarkButton editor={editor} format="italic" icon={faItalic} />
              <MarkButton editor={editor} format="underline" icon={faUnderline} />
            </div>
            <div className={styles.wysiwygButtonSubcontainer}>
              <BlockButton editor={editor} format="bulleted-list" icon={faListUl} />
              <BlockButton editor={editor} format="numbered-list" icon={faListOl} />
            </div>
          </div>

          <Editable
            renderElement={renderElement}
            renderLeaf={renderLeaf}
            spellCheck
            className={styles.wysiwyg}
            onKeyDown={(event) => {
              for (const hotkey in HOTKEYS) {
                if (isHotkey(hotkey, event)) {
                  event.preventDefault();
                  const mark = HOTKEYS[hotkey as keyof typeof HOTKEYS];
                  toggleMark(editor, mark);
                }
              }
            }}
            onFocus={() => {
              Transforms.deselect(editor);
            }}
          />
        </Slate>
      ) : (
        value && (
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
        )
      )}
    </>
  );
};
