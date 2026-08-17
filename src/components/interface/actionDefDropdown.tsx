import { faCaretDown } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { FunctionComponent } from "react";
import { useRef } from "react";
import styles from "./actionDefDropdown.module.css";
import { useMissionDocSelector } from "utils/useDocSelector";
import { refEqual } from "utils/useAppSelector";
import { getActionDefinitionLabel } from "store/selectors";

export const sortActionDefinitionItems = (items: ActionDefinitionItems) =>
  Object.entries(items).sort(([, a], [, b]) => a.name.localeCompare(b.name));

export const ActionDefDropdown: FunctionComponent<{
  actionDefinitionItems: ActionDefinitionItems;
  type: ActionDefinitionType;
  selectedUuid: string;
  onSelect: (uuid: string) => void;
}> = ({ actionDefinitionItems, type, selectedUuid, onSelect }) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selectedItemRef = useRef<HTMLDivElement>(null);
  const emptyLabel = useMissionDocSelector(
    (mission) => getActionDefinitionLabel(mission, type),
    refEqual
  );
  const selectedName = selectedUuid ? actionDefinitionItems[selectedUuid]?.name : emptyLabel;
  const typeColor = `var(--${type.slice(0, -1)})`;

  const handleOpen = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const menuHeight = 300;
    const menuWidth = 200;
    const padding = 8;

    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    let top = rect.bottom + padding;
    let left = rect.left;

    if (spaceBelow < menuHeight && spaceAbove > spaceBelow) {
      top = rect.top - menuHeight - padding;
    }

    if (left + menuWidth > window.innerWidth) {
      left = Math.max(padding, window.innerWidth - menuWidth - padding);
    }

    if (menuRef.current) {
      menuRef.current.style.left = `${left}px`;
      menuRef.current.style.top = `${top}px`;
    }

    dialogRef.current?.showModal();

    setTimeout(() => {
      selectedItemRef.current?.scrollIntoView({
        block: "nearest",
        behavior: "auto",
      });
    }, 0);
  };

  const handleSelect = (uuid: string) => {
    onSelect(uuid);
    dialogRef.current?.close();
  };

  return (
    <div className={styles.container}>
      <div className={styles.selected} onClick={handleOpen} style={{ color: typeColor }}>
        <span>{selectedName}</span>
        <FontAwesomeIcon icon={faCaretDown} size="sm" className={styles.caret} />
      </div>
      <dialog ref={dialogRef} className={styles.dialog} onClick={() => dialogRef.current?.close()}>
        <div ref={menuRef} className={styles.menu}>
          <div
            ref={!selectedUuid ? selectedItemRef : null}
            className={`${styles.menuItem} ${!selectedUuid ? styles.menuItemSelected : ""}`}
            onClick={() => handleSelect("")}
          >
            {emptyLabel}
          </div>
          {sortActionDefinitionItems(actionDefinitionItems).map(([uuid, actionDef]) => (
            <div
              key={uuid}
              ref={selectedUuid === uuid ? selectedItemRef : null}
              className={`${styles.menuItem} ${selectedUuid === uuid ? styles.menuItemSelected : ""}`}
              onClick={() => handleSelect(uuid)}
            >
              {actionDef.name}
            </div>
          ))}
        </div>
      </dialog>
    </div>
  );
};
