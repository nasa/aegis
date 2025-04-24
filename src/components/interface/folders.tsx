import { FunctionComponent, useState, ReactNode, useRef, Children } from "react";
import styles from "./folders.module.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faFolder,
  faFolderOpen,
  faEllipsisV,
  faEdit,
  faTrashAlt,
  faFloppyDisk,
  faEye,
  faEyeSlash,
  faBan,
} from "@fortawesome/free-solid-svg-icons";
import {
  DndContext,
  DragEndEvent,
  useSensors,
  useSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  DragOverlay,
  DragStartEvent,
} from "@dnd-kit/core";
import {
  thunkDeleteFolder,
  thunkSaveFolder,
  thunkToggleFolderOpen,
  thunkToggleFolderVisible,
} from "store/thunk/thunkFolder";
import { useAppDispatch } from "utils/useAppDispatch";
import { refEqual, useAppSelector } from "utils/useAppSelector";
import { InLineEditInput } from "components/interface/form/globalFields";
import { validators } from "./form/formValidators";
import { setFolderInterfaceEditing, setFolderInterfaceNameValue } from "store/interface";

// Generic draggable item component
const DraggableItem = <T,>({
  item,
  getItemId,
  children,
  editPerms = false,
}: {
  item: T;
  getItemId: (item: T) => string;
  children: ReactNode;
  editPerms?: boolean;
}) => {
  const itemId = getItemId(item);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: itemId,
    disabled: !editPerms,
  });

  return (
    <div
      ref={setNodeRef}
      {...(editPerms ? listeners : {})}
      {...(editPerms ? attributes : {})}
      className={`${styles.draggableItem} ${isDragging ? styles.isDragging : ""}`}
    >
      {children}
    </div>
  );
};

// Add FolderMenu component before FolderComponent
const FolderMenu: FunctionComponent<{
  folderUuid: string;
  folderInterface: FolderInterface;
  handleCancel: (e: React.MouseEvent) => void;
  editPerms: boolean;
}> = ({ folderUuid, folderInterface, handleCancel, editPerms }) => {
  const dispatch = useAppDispatch();
  const dialogRef = useRef(null);
  const menuRef = useRef(null);
  const folder = useAppSelector(
    (state) => state.interface.folders.find((f) => f.uuid === folderUuid),
    refEqual
  );

  const handleMenuOpen = (e: React.MouseEvent) => {
    const x = e.clientX + 5;
    menuRef.current.style.left = `${x}px`;
    menuRef.current.style.top = `${e.clientY}px`;
  };

  return (
    <>
      <dialog
        ref={dialogRef}
        className={styles.menuContainer}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          dialogRef.current?.close();
        }}
      >
        <div ref={menuRef} className={styles.menu}>
          {(folder.type === "poi" || folder.type === "station") && (
            <div
              className={styles.menuItem}
              onClick={(e) => {
                e.stopPropagation();
                dispatch(setFolderInterfaceEditing({ folderUuid, editing: false }));
                dispatch(thunkToggleFolderVisible({ folderUuid }));
                dialogRef.current?.close();
              }}
            >
              <div className={styles.menuItemIcon}>
                <FontAwesomeIcon icon={folderInterface.visible ? faEyeSlash : faEye} size="sm" />
              </div>
              <div className={styles.menuItemText}>
                {folderInterface.visible ? "Hide" : "Show"} Folder Contents on Map
              </div>
            </div>
          )}
          {editPerms && (
            <>
              {!folderInterface.editing ? (
                <div
                  className={styles.menuItem}
                  onClick={(e) => {
                    e.stopPropagation();
                    dispatch(setFolderInterfaceEditing({ folderUuid, editing: true }));
                    dialogRef.current?.close();
                  }}
                >
                  <div className={styles.menuItemIcon}>
                    <FontAwesomeIcon icon={faEdit} size="sm" />
                  </div>
                  <div className={styles.menuItemText}>Rename Folder</div>
                </div>
              ) : (
                <div
                  className={styles.menuItem}
                  onClick={(e) => {
                    e.stopPropagation();
                    dialogRef.current?.close();
                    handleCancel(e);
                  }}
                >
                  <div className={styles.menuItemIcon}>
                    <FontAwesomeIcon icon={faBan} size="sm" />
                  </div>
                  <div className={styles.menuItemText}>Cancel</div>
                </div>
              )}
              <div
                className={styles.menuItem}
                onClick={(e) => {
                  e.stopPropagation();
                  dispatch(thunkDeleteFolder({ folderUuid }));
                  dialogRef.current?.close();
                }}
              >
                <div className={styles.menuItemIcon}>
                  <FontAwesomeIcon icon={faTrashAlt} size="sm" />
                </div>
                <div className={styles.menuItemText}>Delete Folder</div>
              </div>
            </>
          )}
        </div>
      </dialog>

      <FontAwesomeIcon
        icon={faEllipsisV}
        size="sm"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleMenuOpen(e);
          dialogRef.current?.showModal();
        }}
        style={{ width: "15px", color: "var(--grey5)", outline: "none" }}
        tabIndex={0}
      />
    </>
  );
};

// Generic folder component
const FolderComponent = <T,>({
  folder,
  folderInterface,
  items,
  itemsToFolders,
  getItemId,
  renderItem,
  hideMenu,
}: {
  folder: Folder;
  folderInterface: FolderInterface;
  items: T[];
  itemsToFolders: Record<string, string>;
  getItemId: (item: T) => string;
  renderItem: (props: FolderItemProps<T>) => ReactNode;
  hideMenu: boolean;
}): JSX.Element => {
  const dispatch = useAppDispatch();
  const editPerms = useAppSelector((state) => state.user.missionPerms.permissions.edit, refEqual);
  const { isOver, setNodeRef } = useDroppable({
    id: folder.uuid,
  });

  const folderContents = items.filter((item) => itemsToFolders[getItemId(item)] === folder.uuid);

  const handleFolderClick = (e: React.MouseEvent) => {
    // Only toggle if clicking the folder area, not the menu or input
    if (
      !(e.target as HTMLElement).closest(".folderMenu") &&
      !(e.target as HTMLElement).closest(".folderNameInput")
    ) {
      dispatch(thunkToggleFolderOpen({ folderUuid: folder.uuid }));
    }
  };

  const handleKeystroke = (newName: string) => {
    if (newName !== folderInterface.editingNameValue) {
      dispatch(setFolderInterfaceNameValue({ folderUuid: folder.uuid, editingNameValue: newName }));
    }
  };

  const handleCancelEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    dispatch(setFolderInterfaceNameValue({ folderUuid: folder.uuid, editingNameValue: null }));
    dispatch(setFolderInterfaceEditing({ folderUuid: folder.uuid, editing: false }));
  };

  const handleSaveEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newFolder = { ...folder, name: folderInterface.editingNameValue };
    dispatch(thunkSaveFolder({ folder: newFolder }));
    dispatch(setFolderInterfaceEditing({ folderUuid: folder.uuid, editing: false }));
    dispatch(setFolderInterfaceNameValue({ folderUuid: folder.uuid, editingNameValue: null }));
  };

  return (
    <div
      ref={setNodeRef}
      className={`${styles.folderContainer} ${isOver ? styles.droppable : ""} ${
        !folderInterface.visible ? styles.folderHidden : ""
      }`}
    >
      <div className={styles.folder} onClick={handleFolderClick}>
        <div className={styles.folderLeft}>
          <FontAwesomeIcon
            icon={folderInterface.isOpen ? faFolderOpen : faFolder}
            className={styles.folderIcon}
          />
          <div className={styles.folderName}>
            <InLineEditInput
              value={folderInterface.editingNameValue || folder.name}
              editing={folderInterface.editing}
              styleContainer={{ width: "100%" }}
              fieldProps={{
                name: "folderName",
                ariaLabel: "Folder name",
                className: styles.folderNameInput,
                validators: [validators.required, validators.maxLength(24)],
              }}
              onSubmit={handleKeystroke}
            />
          </div>
        </div>
        <div className={styles.folderMenu}>
          {editPerms && folderInterface.editing && (
            <button
              onClick={(e) => {
                handleSaveEdit(e);
              }}
              className={styles.saveButton}
            >
              <FontAwesomeIcon icon={faFloppyDisk} size="lg" />
            </button>
          )}
          {!hideMenu && (
            <FolderMenu
              folderUuid={folder.uuid}
              folderInterface={folderInterface}
              handleCancel={handleCancelEdit}
              editPerms={editPerms}
            />
          )}
        </div>
      </div>

      {folderInterface.isOpen && folderContents.length > 0 && (
        <div className={styles.folderContents}>
          {folderContents.map((item) => (
            <DraggableItem
              key={getItemId(item)}
              item={item}
              getItemId={getItemId}
              editPerms={editPerms}
            >
              {renderItem({ item, isDragging: false, first: false })}
            </DraggableItem>
          ))}
        </div>
      )}
    </div>
  );
};

// Root droppable area component
const RootDroppableArea: FunctionComponent<{ children: ReactNode; editPerms: boolean }> = ({
  children,
  editPerms,
}) => {
  const { isOver, setNodeRef } = useDroppable({
    id: "root-area",
    disabled: !editPerms,
  });

  // Check if children have been passed in, ignoring empty JSX elements and stuff
  const hasRealChildren = Children.toArray(children).some((child) => {
    return Boolean(child) && child !== "";
  });

  // Don't render if no edit permissions and no real children
  if (!editPerms && !hasRealChildren) {
    return null;
  }

  return (
    <div
      ref={setNodeRef}
      className={`${styles.rootDroppableArea} ${isOver && editPerms ? styles.droppable : ""}`}
    >
      {children}
    </div>
  );
};

// Main Folders component
export const FolderOrganizer = <T extends POI | Station | Eva | Rex | Preset>({
  items,
  getItemId,
  renderItem,
  folders,
  foldersInterface,
  itemsToFolders,
  setItemFolder,
  hideMenu = false,
}: {
  items: T[];
  getItemId: (item: T) => string;
  renderItem: (props: FolderItemProps<T>) => ReactNode;
  folders?: Folder[];
  foldersInterface?: FolderInterface[];
  itemsToFolders: Record<string, string>;
  setItemFolder: (params: { uuid: string; folderUuid: string | null }) => void;
  hideMenu?: boolean;
}): JSX.Element => {
  const dispatch = useAppDispatch();
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const editPerms = useAppSelector((state) => state.user.missionPerms.permissions.edit, refEqual);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5, // 5px movement activation threshold
      },
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over) {
      const activeId = active.id as string;
      const overId = over.id as string;

      // Check if being dropped in root area
      if (overId === "root-area") {
        // Set the poi's folder to null
        setItemFolder({ uuid: activeId, folderUuid: null });
      } else if (activeId !== overId) {
        // Associate item with folder
        setItemFolder({ uuid: activeId, folderUuid: overId });
        const overFolder = foldersInterface.find((folder) => folder.uuid === overId);
        if (overFolder && !overFolder.isOpen) {
          dispatch(thunkToggleFolderOpen({ folderUuid: overId }));
        }
      }
    }

    setActiveDragId(null);
  };

  // Get unassociated items
  const unassociatedItems = items.filter((item) => !itemsToFolders[getItemId(item)]);

  // Find the active item for the drag overlay
  const activeItem = activeDragId ? items.find((item) => getItemId(item) === activeDragId) : null;

  // Sort folders alphabetically by name
  const sortedFolders = [...folders].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  );

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd} onDragStart={handleDragStart}>
      <div className={styles.rootArea}>
        {/* Render folders */}
        {sortedFolders.map((folder) => {
          const folderInterface = foldersInterface.find(
            (folderInterface) => folderInterface.uuid === folder.uuid
          );
          if (!folderInterface) return null;

          return (
            <FolderComponent
              key={folder.uuid}
              folder={folder}
              folderInterface={folderInterface}
              items={items}
              itemsToFolders={itemsToFolders}
              getItemId={getItemId}
              renderItem={renderItem}
              hideMenu={hideMenu}
            />
          );
        })}

        {/* Render unassociated items in root area */}
        <RootDroppableArea editPerms={editPerms}>
          {unassociatedItems.length === 0 &&
            editPerms &&
            Object.keys(itemsToFolders).length > 0 && (
              <div className={styles.dropHint}>Drag here to remove item from folder</div>
            )}
          {unassociatedItems.map((item, index) => (
            <DraggableItem
              key={getItemId(item)}
              item={item}
              getItemId={getItemId}
              editPerms={editPerms}
            >
              {renderItem({ item, isDragging: false, first: index === 0 })}
            </DraggableItem>
          ))}
        </RootDroppableArea>
      </div>

      {/* Drag Overlay */}
      <DragOverlay>
        {activeItem ? (
          <div className={styles.dragOverlay}>
            {renderItem({ item: activeItem, isDragging: true, first: true })}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};
