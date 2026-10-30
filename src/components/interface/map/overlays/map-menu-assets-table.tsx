import type { FunctionComponent, KeyboardEvent, MouseEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  faCaretDown,
  faCaretRight,
  faEdit,
  faEllipsisV,
  faEye,
  faEyeSlash,
  faFloppyDisk,
  faFolder,
  faFolderOpen,
  faPen,
  faTrashAlt,
  faBan,
} from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import styles from "./map-menu-assets.module.css";
import { EmojiRenderer } from "components/interface/emojis";
import { InLineEditInput } from "components/interface/form/globalFields";
import { validators } from "components/interface/form/formValidators";
import { deleteFolder } from "components/interface/folders";
import { useAppDispatch } from "utils/useAppDispatch";
import { deepEqual, refEqual, useAppSelector } from "utils/useAppSelector";
import { setSelectedAssetUuid } from "store/asset";
import { setHoverAssetUuid } from "store/hover";
import {
  getFolderInterface,
  setFolderInterfaceEditing,
  setFolderInterfaceNameValue,
} from "store/interface";
import {
  thunkRenameFolder,
  thunkToggleFolderOpen,
  thunkToggleFolderVisible,
} from "store/thunk/thunkFolder";
import {
  thunkDeleteAsset,
  thunkMoveAssetToFolder,
  thunkToggleAssetVisible,
} from "store/thunk/thunkAsset";
import {
  DEFAULT_ASSET_ICON,
  compareByName,
  getAssetFolderUuidByItem,
  getAssetPlacementPetSeconds,
} from "utils/assets";
import { formatCoordinateEntry, formatLatLng } from "utils/coordinateEntry";
import { formatUtcTime } from "./map-menu-assets-editor";
import { hhmmssFromSeconds } from "utils/formatting";

const ROOT_DROP_ID = "asset-root";
const COLUMN_COUNT = 9;

type Props = {
  assets: Asset[];
  folders: Folder[];
  canMutate: boolean;
  editingAssetUuid: string | null;
  coordinateContext: CoordinateEntryContext;
  onEdit: (assetUuid: string) => void;
};

// One table and one header for folder and root rows. Folders are full-width header rows over
// their own tbody (the drop target); child rows use the same cells and widths as root rows.
export const AssetTable: FunctionComponent<Props> = ({
  assets,
  folders,
  canMutate,
  editingAssetUuid,
  coordinateContext,
  onEdit,
}) => {
  const dispatch = useAppDispatch();
  const foldersInterface = useAppSelector((state) => state.interface.foldersInterface, deepEqual);
  const [activeDragUuid, setActiveDragUuid] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const sortedFolders = [...folders].sort(compareByName);
  const folderUuidByItem = getAssetFolderUuidByItem(folders);
  const sortedAssets = [...assets].sort(compareByName);
  const rootAssets = sortedAssets.filter((asset) => !folderUuidByItem[asset.uuid]);
  const activeAsset = activeDragUuid ? assets.find((a) => a.uuid === activeDragUuid) : null;

  const handleDragStart = (event: DragStartEvent) => setActiveDragUuid(event.active.id as string);
  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragUuid(null);
    const assetUuid = event.active.id as string;
    const overId = event.over?.id as string | undefined;
    if (!overId) return;
    const target = overId === ROOT_DROP_ID ? null : overId;
    if ((folderUuidByItem[assetUuid] ?? null) === target) return;
    dispatch(thunkMoveAssetToFolder({ assetUuid, folderUuid: target }));
    if (target && !getFolderInterface(foldersInterface, target).isOpen) {
      dispatch(thunkToggleFolderOpen({ folderUuid: target }));
    }
  };

  // Row numbers are display only: folder contents in folder order, then root assets.
  const rowNumbers = new Map(
    [
      ...sortedFolders.flatMap((folder) =>
        sortedAssets.filter((asset) => folderUuidByItem[asset.uuid] === folder.uuid)
      ),
      ...rootAssets,
    ].map((asset, index) => [asset.uuid, index + 1])
  );
  const renderAssetRow = (asset: Asset, folder: Folder | null) => (
    <AssetRow
      key={asset.uuid}
      asset={asset}
      folder={folder}
      number={rowNumbers.get(asset.uuid)}
      canMutate={canMutate}
      isEditing={editingAssetUuid === asset.uuid}
      coordinateContext={coordinateContext}
      onEdit={onEdit}
    />
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveDragUuid(null)}
    >
      <table className={styles.assetTable} data-testid="asset-table">
        <colgroup>
          <col className={styles.colNumber} />
          <col className={styles.colPet} />
          <col className={styles.colEmoji} />
          <col className={styles.colName} />
          <col className={styles.colCoords} />
          <col className={styles.colUncertainty} />
          <col className={styles.colNotes} />
          <col className={styles.colVisible} />
          <col className={styles.colActions} />
        </colgroup>
        <thead>
          <tr className={styles.headerRow}>
            <th>#</th>
            <th>PET</th>
            <th aria-label="Emoji" />
            <th>Name</th>
            <th>Coords</th>
            <th title="Radius (m)">±m</th>
            <th>Notes</th>
            <th aria-label="Visibility">
              <FontAwesomeIcon icon={faEye} size="xs" />
            </th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        {sortedFolders.map((folder) => {
          const isOpen = getFolderInterface(foldersInterface, folder.uuid).isOpen;
          const children = sortedAssets.filter((a) => folderUuidByItem[a.uuid] === folder.uuid);
          return (
            <FolderGroup
              key={folder.uuid}
              folder={folder}
              folders={sortedFolders}
              itemCount={children.length}
              isOpen={isOpen}
              canMutate={canMutate}
              dragActive={!!activeDragUuid}
            >
              {isOpen && children.map((asset) => renderAssetRow(asset, folder))}
            </FolderGroup>
          );
        })}
        <RootGroup dragActive={!!activeDragUuid} canMutate={canMutate}>
          {rootAssets.map((asset) => renderAssetRow(asset, null))}
        </RootGroup>
      </table>
      {assets.length === 0 && (
        <div className={styles.emptyState} data-testid="asset-table-empty">
          {canMutate ? "No assets added yet. Click Add Asset to add one." : "No assets added yet."}
        </div>
      )}
      <DragOverlay dropAnimation={null}>
        {activeAsset ? (
          <div className={styles.dragOverlay}>
            <EmojiRenderer iconValue={activeAsset.icon || DEFAULT_ASSET_ICON} />
            <span>{activeAsset.name}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};

const RootGroup: FunctionComponent<{
  dragActive: boolean;
  canMutate: boolean;
  children: ReactNode;
}> = ({ dragActive, canMutate, children }) => {
  const { isOver, setNodeRef } = useDroppable({ id: ROOT_DROP_ID, disabled: !canMutate });
  return (
    <tbody ref={setNodeRef} className={isOver ? styles.dropTarget : ""}>
      {children}
      {dragActive && (
        <tr className={styles.dropHintRow}>
          <td colSpan={COLUMN_COUNT}>Drop here to move to the root</td>
        </tr>
      )}
    </tbody>
  );
};

const FolderGroup: FunctionComponent<{
  folder: Folder;
  folders: Folder[];
  itemCount: number;
  isOpen: boolean;
  canMutate: boolean;
  dragActive: boolean;
  children: ReactNode;
}> = ({ folder, folders, itemCount, isOpen, canMutate, dragActive, children }) => {
  const dispatch = useAppDispatch();
  const folderInterface = useAppSelector(
    (state) => getFolderInterface(state.interface.foldersInterface, folder.uuid),
    deepEqual
  );
  const { isOver, setNodeRef } = useDroppable({ id: folder.uuid, disabled: !canMutate });

  const saveName = (e: KeyboardEvent | MouseEvent) => {
    e.stopPropagation();
    dispatch(
      thunkRenameFolder({
        folderUuid: folder.uuid,
        name: folderInterface.editingNameValue ?? folder.name,
      })
    );
  };
  const cancelRename = () => {
    dispatch(setFolderInterfaceNameValue({ folderUuid: folder.uuid, editingNameValue: null }));
    dispatch(setFolderInterfaceEditing({ folderUuid: folder.uuid, editing: false }));
  };

  return (
    <tbody
      ref={setNodeRef}
      className={`${isOver ? styles.dropTarget : ""} ${folder.visible ? "" : styles.folderHidden}`}
      data-testid={`asset-folder-${folder.uuid}`}
    >
      <tr className={styles.folderRow}>
        <td colSpan={COLUMN_COUNT}>
          <div className={styles.folderCell}>
            <button
              type="button"
              className={styles.folderToggle}
              onClick={() => dispatch(thunkToggleFolderOpen({ folderUuid: folder.uuid }))}
              aria-label={isOpen ? "Collapse folder" : "Expand folder"}
              aria-expanded={isOpen}
            >
              <FontAwesomeIcon icon={isOpen ? faCaretDown : faCaretRight} size="sm" />
              <FontAwesomeIcon icon={isOpen ? faFolderOpen : faFolder} />
            </button>
            <div
              className={styles.folderName}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveName(e);
                if (e.key === "Escape") cancelRename();
              }}
            >
              <InLineEditInput
                value={folderInterface.editingNameValue ?? folder.name}
                editing={folderInterface.editing && canMutate}
                toFocus={folderInterface.editing}
                styleContainer={{ width: "100%" }}
                fieldProps={{
                  name: "folderName",
                  ariaLabel: "Folder name",
                  validators: [
                    validators.required,
                    validators.maxLength(24),
                    validators.mustBeUnique(
                      folders.filter((f) => f.uuid !== folder.uuid).map((f) => f.name)
                    ),
                  ],
                }}
                onSubmit={(name) =>
                  dispatch(
                    setFolderInterfaceNameValue({ folderUuid: folder.uuid, editingNameValue: name })
                  )
                }
              />
            </div>
            <span className={styles.folderCount}>{itemCount}</span>
            {folderInterface.editing && canMutate && (
              <button
                type="button"
                className={styles.iconButton}
                onClick={saveName}
                aria-label="Save folder name"
              >
                <FontAwesomeIcon icon={faFloppyDisk} size="sm" />
              </button>
            )}
            <button
              type="button"
              className={styles.iconButton}
              onClick={() => dispatch(thunkToggleFolderVisible({ folderUuid: folder.uuid }))}
              disabled={!canMutate}
              aria-label={folder.visible ? "Hide folder on map" : "Show folder on map"}
              data-tooltip-id="aegis-tooltip"
              data-tooltip-content={
                folder.visible
                  ? "Hide folder contents on every map"
                  : "Show folder contents on every map"
              }
              data-testid={`asset-folder-visibility-${folder.uuid}`}
            >
              <FontAwesomeIcon icon={folder.visible ? faEye : faEyeSlash} size="sm" />
            </button>
            {canMutate && (
              <RowMenu
                label="Folder actions"
                items={[
                  folderInterface.editing
                    ? { icon: faBan, label: "Cancel Rename", onClick: cancelRename }
                    : {
                        icon: faEdit,
                        label: "Rename Folder",
                        onClick: () =>
                          dispatch(
                            setFolderInterfaceEditing({
                              folderUuid: folder.uuid,
                              editing: true,
                              folderName: folder.name,
                            })
                          ),
                      },
                  {
                    icon: folder.visible ? faEyeSlash : faEye,
                    label: folder.visible ? "Hide Folder on Map" : "Show Folder on Map",
                    onClick: () => dispatch(thunkToggleFolderVisible({ folderUuid: folder.uuid })),
                  },
                  {
                    icon: faTrashAlt,
                    label: "Delete Folder",
                    onClick: () => deleteFolder(folder.uuid),
                  },
                ]}
              />
            )}
          </div>
        </td>
      </tr>
      {children}
      {isOpen && itemCount === 0 && (
        <tr className={styles.emptyFolderRow}>
          <td colSpan={COLUMN_COUNT}>{dragActive ? "Drop here" : "Empty folder"}</td>
        </tr>
      )}
    </tbody>
  );
};

const AssetRow: FunctionComponent<{
  asset: Asset;
  folder: Folder | null;
  number: number;
  canMutate: boolean;
  isEditing: boolean;
  coordinateContext: CoordinateEntryContext;
  onEdit: (assetUuid: string) => void;
}> = ({ asset, folder, number, canMutate, isEditing, coordinateContext, onEdit }) => {
  const dispatch = useAppDispatch();
  const isSelected = useAppSelector((s) => s.asset.selectedAssetUuid === asset.uuid, refEqual);
  const isHovered = useAppSelector(
    (s) => s.hover.mapItemType === "asset" && s.hover.mapItemUuid === asset.uuid,
    refEqual
  );
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: asset.uuid,
    disabled: !canMutate,
  });
  const rowRef = useRef<HTMLTableRowElement | null>(null);

  useEffect(() => {
    if (isSelected) rowRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [isSelected]);

  const placed = !!asset.location;
  const petSeconds = getAssetPlacementPetSeconds(asset.placement);
  const inheritedHidden = asset.visible && folder && !folder.visible;
  const locationDetails = placed
    ? [
        formatCoordinateEntry(asset.location, coordinateContext),
        formatLatLng(asset.location),
        `Elevation ${asset.elevation === null ? "unavailable" : `${asset.elevation.toFixed(1)} m`}`,
        asset.placement ? `Placed ${formatUtcTime(asset.placement.locationSetAt)}` : null,
      ]
        .filter(Boolean)
        .join("\n")
    : null;

  const rowClass = [
    styles.assetRow,
    isSelected ? styles.assetRowSelected : isHovered ? styles.assetRowHover : "",
    isEditing ? styles.assetRowEditing : "",
    isDragging ? styles.assetRowDragging : "",
    !asset.visible || inheritedHidden ? styles.assetRowHidden : "",
  ].join(" ");

  return (
    <tr
      ref={(node) => {
        rowRef.current = node;
        setNodeRef(node);
      }}
      {...(canMutate ? listeners : {})}
      {...(canMutate ? attributes : {})}
      className={rowClass}
      data-testid={`asset-row-${asset.uuid}`}
      aria-selected={isSelected}
      onPointerDownCapture={(e) => {
        // Buttons and menus inside the row must not start a drag.
        if ((e.target as HTMLElement).closest("button, dialog, input")) e.stopPropagation();
      }}
      onMouseEnter={() => dispatch(setHoverAssetUuid(asset.uuid))}
      onMouseLeave={() => dispatch(setHoverAssetUuid(null))}
      onClick={() => dispatch(setSelectedAssetUuid(isSelected ? null : asset.uuid))}
    >
      <td className={styles.numberCell}>{number}</td>
      <td>
        {!placed ? (
          "Not placed"
        ) : petSeconds === null ? (
          <span title="No PET was recorded when this asset was placed">—</span>
        ) : (
          hhmmssFromSeconds(petSeconds)
        )}
      </td>
      <td className={styles.emojiCell}>
        <EmojiRenderer iconValue={asset.icon || DEFAULT_ASSET_ICON} />
      </td>
      <td className={styles.nameCell} title={asset.name}>
        <span className={folder ? styles.indented : ""}>
          {isEditing && <FontAwesomeIcon icon={faPen} size="xs" className={styles.editingIcon} />}
          {asset.name}
        </span>
      </td>
      <td title={locationDetails ?? undefined}>
        {placed ? formatCoordinateEntry(asset.location, coordinateContext) : "Not placed"}
      </td>
      <td>{asset.uncertaintyMeters}</td>
      <td title={asset.notes ?? undefined}>{asset.notes}</td>
      <td>
        <button
          type="button"
          className={`${styles.iconButton} ${inheritedHidden ? styles.inheritedHidden : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            dispatch(thunkToggleAssetVisible({ assetUuid: asset.uuid }));
          }}
          disabled={!canMutate}
          aria-label={asset.visible ? "Hide asset on map" : "Show asset on map"}
          data-tooltip-id="aegis-tooltip"
          data-tooltip-content={
            !asset.visible
              ? "Hidden on every map. Click to show."
              : inheritedHidden
                ? `Hidden with folder "${folder.name}"`
                : "Shown on every map. Click to hide."
          }
          data-testid={`asset-visibility-${asset.uuid}`}
        >
          <FontAwesomeIcon icon={asset.visible ? faEye : faEyeSlash} size="xs" />
        </button>
      </td>
      <td onClick={(e) => e.stopPropagation()}>
        {canMutate && (
          <RowMenu
            label="Asset actions"
            items={[
              ...(isEditing
                ? []
                : [{ icon: faEdit, label: "Edit", onClick: () => onEdit(asset.uuid) }]),
              {
                icon: faTrashAlt,
                label: "Delete",
                onClick: () => {
                  if (
                    window.confirm(`Are you sure you want to delete the asset "${asset.name}"?`)
                  ) {
                    dispatch(thunkDeleteAsset({ assetUuid: asset.uuid }));
                  }
                },
              },
            ]}
          />
        )}
      </td>
    </tr>
  );
};

// Kebab menu opened with a normal click; it never relies on right-click or a native menu.
const RowMenu: FunctionComponent<{
  label: string;
  items: { icon: IconDefinition; label: string; onClick: () => void }[];
}> = ({ label, items }) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  return (
    <>
      <button
        type="button"
        className={styles.iconButton}
        aria-label={label}
        onClick={(e) => {
          e.stopPropagation();
          const menu = menuRef.current;
          if (menu) {
            const x = e.clientX + 5;
            menu.style.left = `${x}px`;
            menu.style.top = `${e.clientY}px`;
            menu.style.transform = x + 160 > window.innerWidth ? "translateX(-100%)" : "none";
          }
          dialogRef.current?.showModal();
        }}
      >
        <FontAwesomeIcon icon={faEllipsisV} size="sm" />
      </button>
      <dialog
        ref={dialogRef}
        className={styles.menuDialog}
        onClick={(e) => {
          e.stopPropagation();
          dialogRef.current?.close();
        }}
      >
        <div ref={menuRef} className={styles.menu} role="menu">
          {items.map((item) => (
            <div
              key={item.label}
              role="menuitem"
              tabIndex={0}
              className={styles.menuItem}
              onClick={(e) => {
                e.stopPropagation();
                dialogRef.current?.close();
                item.onClick();
              }}
              onKeyDown={(e) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault();
                dialogRef.current?.close();
                item.onClick();
              }}
            >
              <FontAwesomeIcon icon={item.icon} size="sm" />
              {item.label}
            </div>
          ))}
        </div>
      </dialog>
    </>
  );
};
