import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown } from "@fortawesome/free-solid-svg-icons";
import {
  FunctionComponent,
  Children,
  cloneElement,
  useState,
  createRef,
  useRef,
  useLayoutEffect,
  CSSProperties,
  ChangeEvent,
  ReactNode,
} from "react";

import styles from "./_global-elements.module.css";
import _ from "lodash";
import { TagsInput } from "react-tag-input-component";
import ContentEditable, { ContentEditableEvent } from "react-contenteditable";
import { longdateFromDateString } from "utils/formatting";
import { decodeEmoji } from "utils/formatting";

export const IconButton: FunctionComponent<{
  onClick: () => void;
  label?: string;
  toolTip?: string;
  icon: IconDefinition;
  style?: CSSProperties;
  labelStyle?: CSSProperties;
  size?: "xs" | "lg";
  enabled?: boolean;
}> = ({ onClick, label, toolTip, icon, style, labelStyle, size, enabled = true }) => {
  const enabledStyle = !enabled ? styles.iconButtonDisabled : "";
  return (
    <div
      className={`${styles.iconButton} ${enabledStyle} `}
      title={toolTip}
      onClick={onClick}
      style={style}
    >
      <FontAwesomeIcon icon={icon} size={size} />
      <div className={styles.iconButtonLabel} style={labelStyle}>
        {label}
      </div>
    </div>
  );
};

export const Dropdown: FunctionComponent<{
  children: any;
  selected: string;
  containerStyle?: CSSProperties;
  selectStyle?: CSSProperties;
  arrowStyle?: CSSProperties;
  onChange: (value: string) => void;
}> = ({ children, selected, containerStyle, selectStyle, arrowStyle, onChange }) => {
  return (
    <div className={styles.select} style={containerStyle}>
      <select
        value={selected}
        style={selectStyle}
        title="dropdown"
        onChange={(e) => onChange(e.target.value)}
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        {children}
      </select>
      <div className={styles.select_arrow} style={arrowStyle}>
        <FontAwesomeIcon icon={faChevronDown} size="xs" />
      </div>
    </div>
  );
};

export const IconDropdown: FunctionComponent<{
  items: any[];
  editing: boolean;
  selected: string;
  setSelected: Function;
}> = ({ items, editing, selected, setSelected }) => {
  const [expanded, setExpanded] = useState(false);

  if (!editing) {
    return (
      <div className={styles.iconDropdownContainer}>
        <div className={styles.iconDropdownModalItemNotEditing}>
          <div className={styles.itemIcon}>{decodeEmoji(selected)}</div>
        </div>
      </div>
    );
  } else {
    let selectedItem;
    if (selected) {
      selectedItem = (
        <div className={styles.iconDropdownModalItem}>
          <div className={styles.itemIcon}>{decodeEmoji(selected)}</div>
        </div>
      );
    } else {
      selectedItem = (
        <div className={styles.iconDropdownModalItem}>
          <div className={styles.iconDropdownModalItemLabel}>Select Icon...</div>
        </div>
      );
    }

    return (
      <div
        tabIndex={0}
        className={styles.iconDropdownContainer}
        onClick={() => setExpanded(!expanded)}
        onBlur={() => {
          setExpanded(false);
        }}
      >
        {selectedItem}
        <span className={styles.colorSelectArrow}>
          <FontAwesomeIcon icon={faChevronDown} size="xs" />
        </span>
        {expanded && (
          <div className={styles.iconDropdownModalList}>
            {items.map((item, index) => {
              return (
                <div
                  className={styles.iconDropdownModalItem}
                  key={`${item}_${index}`}
                  onClick={() => setSelected(item)}
                >
                  <div className={styles.itemIcon}>{decodeEmoji(item)}</div>
                  <div className={styles.iconDropdownModalItemLabel}>{item.label}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }
};

export const MultiButton: FunctionComponent<{
  children: ReactNode;
  editing: boolean;
  selected: string;
  handleChange: Function;
}> = ({ children, editing, selected, handleChange }) => {
  return (
    <div className={styles.multiButtonGroup}>
      {/* Loop through the children and add the multibutton styling to each child depending on its position in the list */}
      {Children.map(children, (child: any, idx) => {
        let buttonStyle = styles.multiButton;
        let selectedStyle = child.props.children === selected ? styles.multiButtonSelected : "";
        if (editing) {
          buttonStyle = styles.multiButtonEditing;
          selectedStyle =
            child.props.children === selected ? styles.multiButtonEditingSelected : "";
        }

        let style;
        if (idx === 0) style = `${buttonStyle} ${selectedStyle} ${styles.multiButtonStart}`;
        else if (idx === Children.count(children) - 1)
          style = ` ${buttonStyle} ${selectedStyle} ${styles.multiButtonEnd}`;
        else style = `${buttonStyle} ${selectedStyle} ${styles.multiButtonMiddle}`;

        return cloneElement(child as any, {
          className: style,
          onClick: () => {
            if (editing) handleChange(child.props.children);
          },
        });
      })}
    </div>
  );
};

export const ModifiedIndicator: FunctionComponent<{
  obj1: Object;
  obj2: Object;
  svgStyle: { width: string; height: string; cx: string; cy: string; r: string; fill: string };
}> = ({ obj1, obj2, svgStyle }) => {
  const diff = _.differenceWith(_.sortBy(obj2, ["uuid"]), _.sortBy(obj1, ["uuid"]), _.isEqual);

  if (diff && diff.length === 0) {
    return <></>;
  } else {
    return (
      <span title="Unsaved changes" className={styles.modifiedSpan}>
        <svg height={svgStyle.height} width={svgStyle.width}>
          <circle cx={svgStyle.cx} cy={svgStyle.cy} r={svgStyle.r} fill={svgStyle.fill} />
        </svg>
      </span>
    );
  }
};

export const InLineEditInput: FunctionComponent<{
  fieldName: string;
  editing: boolean;
  styleInput: CSSProperties;
  styleValue?: CSSProperties;
  containerStyle?: CSSProperties;
  maxLength: number;
  value: string;
  onChange: Function;
  onBlur?: Function;
}> = ({
  fieldName,
  editing,
  styleInput,
  styleValue,
  containerStyle,
  maxLength,
  value,
  onChange,
  onBlur,
}) => {
  const [cursor, setCursor] = useState(null);
  const ref = useRef(null);

  useLayoutEffect(() => {
    const input = ref.current;
    if (input) input.setSelectionRange(cursor, cursor);
  }, [ref, cursor, value]);

  const handleChange = (e) => {
    setCursor(e.target.selectionStart);
    onChange(e.target.value);
  };

  return (
    <div style={containerStyle}>
      {editing && (
        <input
          className={styles.inLineEditInput}
          maxLength={maxLength}
          style={styleInput}
          aria-label={fieldName}
          value={value}
          onChange={(event) => handleChange(event)}
          onBlur={(event) => {
            if (onBlur) onBlur(event);
          }}
          onClick={(e) => {
            e.stopPropagation();
          }}
          ref={ref}
        />
      )}
      {!editing && (
        <div className={styles.inLineEditValue} style={styleValue} title={fieldName}>
          {value}
        </div>
      )}
    </div>
  );
};

export const Tags: FunctionComponent<{
  value: string[];
  editing: boolean;
  onChange: (tags: string[]) => void;
  name: string;
  separators: string[];
  placeHolder: string;
  onExisting: (tag: string) => void;
}> = ({ value, editing, onChange, name, separators, placeHolder, onExisting }) => {
  return (
    <>
      {editing && (
        <div className={styles.tagsContainer}>
          <TagsInput
            value={value}
            onChange={onChange}
            name={name}
            separators={separators}
            placeHolder={placeHolder}
            onExisting={onExisting}
          />
        </div>
      )}
      {!editing && (
        <div className={styles.tagListContainer}>
          {value.map((tag) => (
            <div className={styles.tagListItem} key={tag}>
              {tag}
            </div>
          ))}
        </div>
      )}
    </>
  );
};

export const ContentEditableTextArea: FunctionComponent<{
  html: string;
  editing: boolean;
  onChange: (event: ContentEditableEvent) => void;
  defaultValue?: string;
}> = ({ html, editing, onChange, defaultValue }) => {
  const [focus, setFocus] = useState(false);

  const contentEditable = createRef<HTMLElement>();

  const showDefaultValue = defaultValue && !focus && (html === "" || html === "<br>");

  return (
    <>
      {editing && (
        <ContentEditable
          className={styles.notesTextArea}
          innerRef={contentEditable}
          html={showDefaultValue ? defaultValue : html} // innerHTML of the editable div
          disabled={!editing} // use true to disable editing
          onChange={onChange}
          tagName="div" // Use a custom HTML tag (uses a div by default)
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
        />
      )}
      {!editing && <div className={styles.notesText} dangerouslySetInnerHTML={{ __html: html }} />}
    </>
  );
};

export const Checkbox: FunctionComponent<{
  checked: boolean;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}> = ({ checked, onChange }) => {
  return (
    <div className={styles.checkboxContainer}>
      <input
        type="checkbox"
        title="checkbox"
        checked={checked}
        onChange={onChange}
        className={checked ? styles.checkboxChecked : ""}
      />
    </div>
  );
};

export const LastEdited: FunctionComponent<{
  updatedAt: string;
}> = ({ updatedAt }) => {
  const returnDivContent = (updatedAt) => {
    if (!updatedAt) return <>N/A</>;
    const date = new Date(updatedAt);
    // calculate the difference between now and the last update
    const diff = Math.floor((Date.now() - date.getTime()) / 1000);
    // less than 1 minute
    switch (true) {
      case diff < 60:
        return <>just now</>;
      case diff < 3600:
        const minutes = Math.floor(diff / 60);
        return (
          <>
            {minutes} minute{minutes === 1 ? "" : "s"} ago
          </>
        );
      case diff < 86400:
        const hours = Math.floor(diff / 3600);
        return (
          <>
            {hours} hour{hours === 1 ? "" : "s"} ago
          </>
        );
      case diff < 604800:
        const days = Math.floor(diff / 86400);
        return (
          <>
            {days} day{days === 1 ? "" : "s"} ago
          </>
        );
      case diff < 2592000:
        const weeks = Math.floor(diff / 604800);
        return (
          <>
            {weeks} week{weeks === 1 ? "" : "s"} ago
          </>
        );
      case diff < 31536000:
        const months = Math.floor(diff / 2592000);
        return (
          <>
            {months} month{months === 1 ? "" : "s"} ago
          </>
        );
      default:
        const years = Math.floor(diff / 31536000);
        return (
          <>
            {years} year{years === 1 ? "" : "s"} ago
          </>
        );
    }
  };

  if (!updatedAt) return <></>;
  return (
    <div className={styles.updatedAt} title={`${longdateFromDateString(updatedAt)} Z`}>
      {<>{returnDivContent(updatedAt)}</>}
    </div>
  );
};
