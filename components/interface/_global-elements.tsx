import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown } from "@fortawesome/free-solid-svg-icons";
import { FunctionComponent, Children, cloneElement, useState } from "react";
import styles from "./_global-elements.module.css";
import _ from "lodash";

export const IconButton: FunctionComponent<{
  onClick: () => void;
  label: string;
  icon: IconDefinition;
  disabled?: boolean;
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
  onChange: (value: string) => void;
}> = ({ children, selected, onChange }) => {
  return (
    <div className={styles.select}>
      <select value={selected} onChange={(e) => onChange(e.target.value)}>
        {Children.map(children, (child) =>
          cloneElement(child as any, {
            selected: child.props.value === selected,
          })
        )}
      </select>
      <div className={styles.select_arrow}>
        <FontAwesomeIcon icon={faChevronDown} size="xs" />
      </div>
    </div>
  );
};

export const ColorDropdown: FunctionComponent<{
  items: any[];

  selected: { value: string; label: string };
  setSelected: Function;
}> = ({ items, selected, setSelected }) => {
  const [expanded, setExpanded] = useState(false);

  let selectedItem;
  if (selected) {
    selectedItem = (
      <div className={styles.colorDropdownModalItem}>
        <div className={styles.itemColor}>
          <div className={styles.itemDot} style={{ backgroundColor: selected.value }} />
        </div>
        <div className={styles.colorDropdownModalItemLabel}>{selected.label}</div>
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
    <div className={styles.colorDropdownContainer} onClick={() => setExpanded(!expanded)}>
      {selectedItem}
      <span className={styles.select_arrow}>
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
                <div className={styles.itemDot} style={{ backgroundColor: item.value }} />
              </div>
              <div className={styles.colorDropdownModalItemLabel}>{item.label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const MultiButton: FunctionComponent<{
  children: React.ReactNode;
  selected: string;
  handleChange: Function;
}> = ({ children, selected, handleChange }) => {
  return (
    <div className={styles.multiButtonGroup}>
      {/* Loop through the children and add the multibutton styling to each child depending on its position in the list */}
      {Children.map(children, (child: any, idx) => {
        const selectedStyle = child.props.children === selected ? styles.multiButtonSelected : "";
        let style;
        if (idx === 0) style = `${styles.multiButton} ${selectedStyle} ${styles.multiButtonStart}`;
        else if (idx === Children.count(children) - 1)
          style = `${styles.multiButton} ${selectedStyle} ${styles.multiButtonEnd}`;
        else style = `${styles.multiButton} ${selectedStyle} ${styles.multiButtonMiddle}`;

        return cloneElement(child as any, {
          className: style,
          onClick: () => {
            handleChange(child.props.children);
          },
        });
      })}
    </div>
  );
};

export const ModifiedIndicator: FunctionComponent<{
  obj1: Object;
  obj2: Object;
  style: { width: string; height: string; cx: string; cy: string; r: string; fill: string };
}> = ({ obj1, obj2, style }) => {
  if (_.isEqual(obj1, obj2)) {
    return <></>;
  } else {
    return (
      <span title="unsaved changes" style={{ margin: "auto" }}>
        <svg height={style.height} width={style.width}>
          <circle cx={style.cx} cy={style.cy} r={style.r} fill={style.fill} />
        </svg>
      </span>
    );
  }
};
