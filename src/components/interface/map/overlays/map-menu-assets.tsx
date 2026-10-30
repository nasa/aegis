import type { FunctionComponent } from "react";
import { useMemo, useState } from "react";
import { faFolderPlus, faPlus } from "@fortawesome/free-solid-svg-icons";

import assetsMenuStyles from "./map-menu-assets.module.css";
import { Button } from "components/interface/form/globalFields";
import { AssetEditor } from "./map-menu-assets-editor";
import { AssetTable } from "./map-menu-assets-table";
import { useResolvedMissionGrid } from "../hooks/useResolvedMissionGrid";
import { useAppDispatch } from "utils/useAppDispatch";
import { deepEqual, refEqual, useAppSelector } from "utils/useAppSelector";
import { useMissionDocSelector } from "utils/useDocSelector";
import { isConnected } from "store/selectors";
import { thunkCreateFolder } from "store/thunk/thunkFolder";
import {
  thunkCancelAssetDraft,
  thunkOpenAssetDraftForEdit,
  thunkOpenNewAssetDraft,
  thunkSaveAssetDraft,
} from "store/thunk/thunkAsset";
import { getChangedAssetFields } from "utils/assets";

/** The mission's coordinate presentation for typed and displayed asset coordinates. */
function useCoordinateEntryContext(): CoordinateEntryContext {
  const resolvedGrid = useResolvedMissionGrid();
  const mission = useMissionDocSelector(
    (m) => ({
      usingLGRSCoordinates: m.usingLGRSCoordinates,
      planetRadius: m.planetRadius,
      landerLocation: m.landerLocation,
    }),
    deepEqual
  );
  return useMemo(
    () => ({
      usingLGRSCoordinates: !!mission?.usingLGRSCoordinates,
      dynamicLgrs: resolvedGrid.kind === "dynamic-lgrs",
      serverGrid: resolvedGrid.kind === "server-file" ? resolvedGrid.grid.coordinates : null,
      planetRadius: mission?.planetRadius ?? null,
      landerLocation: mission?.landerLocation ?? null,
    }),
    [mission, resolvedGrid]
  );
}

// Content of the "Assets" tab in the floating Rex Menu widget on the map. Mutations need
// mission edit permission only (not the global Edit toggle) and a live connection.
export const MapAssetsMenu: FunctionComponent = () => {
  const dispatch = useAppDispatch();
  const canEdit = useAppSelector((s) => !!s.user.missionPerms?.permissions.edit, refEqual);
  const connected = useAppSelector(isConnected, refEqual);
  const canMutate = canEdit && connected;
  const draft = useAppSelector((s) => s.asset.draft, deepEqual);
  const assets = useMissionDocSelector((m) => Object.values(m.assets ?? {}), deepEqual) ?? [];
  const assetFolders =
    useMissionDocSelector(
      (m) => Object.values(m.folders ?? {}).filter((f) => f.type === "asset"),
      deepEqual
    ) ?? [];
  const coordinateContext = useCoordinateEntryContext();

  // Another asset's Edit was chosen while the draft has unsaved changes.
  const [pendingEditUuid, setPendingEditUuid] = useState<string | null>(null);
  const draftDirty =
    !!draft &&
    (draft.isNew || Object.keys(getChangedAssetFields(draft.base, draft.values)).length > 0);

  const editAsset = (assetUuid: string) => {
    if (draft?.uuid === assetUuid) return;
    if (draft && draftDirty) {
      setPendingEditUuid(assetUuid);
      return;
    }
    dispatch(thunkOpenAssetDraftForEdit({ assetUuid }));
  };

  const pendingAssetName = assets.find((a) => a.uuid === pendingEditUuid)?.name;
  const switchPrompt =
    draft && pendingEditUuid ? (
      <div className={assetsMenuStyles.switchPrompt} data-testid="asset-switch-prompt">
        <span>
          Unsaved changes. Save them before editing &ldquo;{pendingAssetName ?? "another asset"}
          &rdquo;?
        </span>
        <div className={assetsMenuStyles.editorActions}>
          <Button
            label="Save"
            className={assetsMenuStyles.editorButton}
            enabled={canMutate}
            onClick={async () => {
              const target = pendingEditUuid;
              const saved = await dispatch(thunkSaveAssetDraft()).unwrap();
              setPendingEditUuid(null);
              if (saved) dispatch(thunkOpenAssetDraftForEdit({ assetUuid: target }));
            }}
          />
          <Button
            label="Discard"
            className={assetsMenuStyles.editorButton}
            onClick={async () => {
              const target = pendingEditUuid;
              setPendingEditUuid(null);
              await dispatch(thunkCancelAssetDraft());
              dispatch(thunkOpenAssetDraftForEdit({ assetUuid: target }));
            }}
          />
          <Button
            label="Keep Editing"
            className={assetsMenuStyles.editorButton}
            onClick={() => setPendingEditUuid(null)}
          />
        </div>
      </div>
    ) : null;

  return (
    <div className={assetsMenuStyles.assetsMenu} data-testid="assets-map-menu">
      {canEdit && (
        <div className={assetsMenuStyles.toolbar}>
          <Button
            onClick={() => dispatch(thunkOpenNewAssetDraft())}
            icon={faPlus}
            label="Add Asset"
            toolTip={draft ? "Save or cancel the open asset first" : undefined}
            className={assetsMenuStyles.toolbarButton}
            enabled={canMutate && !draft}
          />
          <Button
            onClick={() => dispatch(thunkCreateFolder({ type: "asset" }))}
            icon={faFolderPlus}
            label="Add Folder"
            className={assetsMenuStyles.toolbarButton}
            enabled={canMutate}
          />
          {!connected && <span className={assetsMenuStyles.offline}>Not connected</span>}
        </div>
      )}
      {draft && (
        <AssetEditor
          draft={draft}
          canMutate={canMutate}
          coordinateContext={coordinateContext}
          switchPrompt={switchPrompt}
        />
      )}
      <div className={assetsMenuStyles.tableContainer}>
        <AssetTable
          assets={assets}
          folders={assetFolders}
          canMutate={canMutate}
          editingAssetUuid={draft && !draft.isNew ? draft.uuid : null}
          coordinateContext={coordinateContext}
          onEdit={editAsset}
        />
      </div>
    </div>
  );
};
