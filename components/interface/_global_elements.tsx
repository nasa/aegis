import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { FunctionComponent } from "react";
import styles from "./_global_elements.module.css";

const IconButton: FunctionComponent<{
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

export default IconButton;
