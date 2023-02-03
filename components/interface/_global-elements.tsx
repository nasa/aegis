import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown } from "@fortawesome/free-solid-svg-icons";
import { FunctionComponent, Children, cloneElement, useState, createRef } from "react";
import styles from "./_global-elements.module.css";
import _ from "lodash";
import { TagsInput } from "react-tag-input-component";
import ContentEditable, { ContentEditableEvent } from "react-contenteditable";

export const IconButton: FunctionComponent<{
  onClick: () => void;
  label: string;
  icon: IconDefinition;
  style?: React.CSSProperties;
  size?: "xs" | "lg";
  enabled?: boolean;
}> = ({ onClick, label, icon, style, size, enabled = true }) => {
  const enabledStyle = !enabled ? styles.iconButtonDisabled : "";
  return (
    <div className={`${styles.iconButton} ${enabledStyle}`} onClick={onClick} style={style}>
      <FontAwesomeIcon icon={icon} size={size} />
      <div className={styles.iconButtonLabel}>{label}</div>
    </div>
  );
};

export const Dropdown: FunctionComponent<{
  children: any;
  selected: string;
  containerStyle?: React.CSSProperties;
  selectStyle?: React.CSSProperties;
  arrowStyle?: React.CSSProperties;
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

export const ColorDropdown: FunctionComponent<{
  items: any[];
  editing: boolean;
  selected: { value: string; label: string };
  setSelected: Function;
}> = ({ items, editing, selected, setSelected }) => {
  const [expanded, setExpanded] = useState(false);

  const colorCharAsInt = parseInt(selected?.value, 16);
  const unicodeColorEmoji = colorCharAsInt ? String.fromCodePoint(colorCharAsInt) : "";

  if (!editing) {
    return (
      <div className={styles.colorDropdownContainer}>
        <div className={styles.colorDropdownModalItemNotEditing}>
          <div className={styles.itemColor}>{unicodeColorEmoji}</div>
          <div className={styles.colorDropdownModalItemLabel}>{selected?.label}</div>
        </div>
      </div>
    );
  } else {
    let selectedItem;
    if (selected) {
      selectedItem = (
        <div className={styles.colorDropdownModalItem}>
          <div className={styles.itemColor}>{unicodeColorEmoji}</div>
          <div className={styles.colorDropdownModalItemLabel}>{selected?.label}</div>
        </div>
      );
    } else {
      selectedItem = (
        <div className={styles.colorDropdownModalItem}>
          <div className={styles.colorDropdownModalItemLabel}>Select Color...</div>
        </div>
      );
    }

    return (
      <div
        tabIndex={0}
        className={styles.colorDropdownContainer}
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
          <div className={styles.colorDropdownModalList}>
            {items.map((item) => (
              <div
                className={styles.colorDropdownModalItem}
                key={item.value}
                onClick={() => setSelected(item)}
              >
                <div className={styles.itemColor}>
                  {String.fromCodePoint(parseInt(item.value, 16))}
                </div>
                <div className={styles.colorDropdownModalItemLabel}>{item.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }
};

export const MultiButton: FunctionComponent<{
  children: React.ReactNode;
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
  if (_.isEqual(_.sortBy(obj1, ["uuid"]), _.sortBy(obj2, ["uuid"]))) {
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
  styleInput: React.CSSProperties;
  styleValue?: React.CSSProperties;
  containerStyle?: React.CSSProperties;
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
  return (
    <div style={containerStyle}>
      {editing && (
        <input
          className={styles.inLineEditInput}
          maxLength={maxLength}
          style={styleInput}
          aria-label={fieldName}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={(event) => {
            if (onBlur) onBlur(event);
          }}
          onClick={(e) => {
            e.stopPropagation();
          }}
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
}> = ({ html, editing, onChange }) => {
  const contentEditable = createRef<HTMLElement>();

  return (
    <>
      {editing && (
        <ContentEditable
          className={styles.notesTextArea}
          innerRef={contentEditable}
          html={html} // innerHTML of the editable div
          disabled={!editing} // use true to disable editing
          onChange={onChange}
          tagName="div" // Use a custom HTML tag (uses a div by default)
        />
      )}
      {!editing && <div className={styles.notesText}>{html}</div>}
    </>
  );
};

export const Checkbox: FunctionComponent<{
  checked: boolean;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
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
