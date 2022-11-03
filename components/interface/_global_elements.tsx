import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown } from "@fortawesome/free-solid-svg-icons";
import { FunctionComponent } from "react";
import styles from "./_global_elements.module.css";

export const IconButton: FunctionComponent<{
  onClick: () => void;
  label: string;
  icon: IconDefinition;
  disabled?: boolean;
}> = ({ onClick, label, icon }) => {
  return (
    <div className={styles.iconButton} onClick={onClick}>
      <FontAwesomeIcon icon={icon} />
      <div className={styles.iconButtonLabel}>{label}</div>
    </div>
  );
};

export const Dropdown: FunctionComponent<{
  options: Option[];
  selected: string;
  onChange: (value: string) => void;
}> = ({ options, selected, onChange }) => {
  return (
    <div className={styles.select}>
      <select value={selected} onChange={(e) => onChange(e.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.name}
          </option>
        ))}
      </select>
      <div className={styles.select_arrow}>
        <FontAwesomeIcon icon={faChevronDown} size="xs" />
      </div>
    </div>
  );
};
