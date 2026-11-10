import type { FunctionComponent } from "react";
import { useEffect, useMemo } from "react";
import { faFolderPlus, faPlusCircle } from "@fortawesome/free-solid-svg-icons";

import assetsMenuStyles from "./map-menu-assets.module.css";
import { Button } from "components/interface/form/globalFields";
import { AssetEditor } from "./map-menu-assets-editor";
import { AssetTable } from "./map-menu-assets-table";
import { useResolvedMissionGrid } from "../hooks/useResolvedMissionGrid";
import { useAppDispatch } from "utils/useAppDispatch";
import { deepEqual, refEqual, useAppSelector } from "utils/useAppSelector";
import { useMissionDocSelector } from "utils/useDocSelector";
import { thunkCreateFolder } from "store/thunk/thunkFolder";
import { thunkEditAsset, thunkAddAsset, thunkCancelAssetEdit } from "store/thunk/thunkAsset";

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

// Content of the "Assets" tab in the floating Rex Menu widget on the map.
export const MapAssetsMenu: FunctionComponent = () => {
  const dispatch = useAppDispatch();
  const canEdit = useAppSelector((s) => !!s.user.missionPerms?.permissions.edit, refEqual);
  const inEdit = useAppSelector((s) => s.asset.inEdit, deepEqual);
  const assets = useMissionDocSelector((m) => Object.values(m.assets ?? {}), deepEqual) ?? [];
  const assetFolders =
    useMissionDocSelector(
      (m) => Object.values(m.folders ?? {}).filter((f) => f.type === "asset"),
      deepEqual
    ) ?? [];
  const coordinateContext = useCoordinateEntryContext();

  const editAsset = (assetUuid: string) => {
    if (inEdit?.uuid === assetUuid) return;
    dispatch(thunkEditAsset({ assetUuid }));
  };

  const editingAssetMissing =
    !!inEdit && !inEdit.isNew && !assets.some((asset) => asset.uuid === inEdit.uuid);
  useEffect(() => {
    if (editingAssetMissing) {
      dispatch(thunkCancelAssetEdit());
    }
  }, [dispatch, editingAssetMissing]);

  return (
    <div className={assetsMenuStyles.assetsMenu} data-testid="assets-map-menu">
      {canEdit && (
        <div className={assetsMenuStyles.toolbar}>
          <Button
            onClick={() => dispatch(thunkAddAsset())}
            icon={faPlusCircle}
            label="Asset"
            toolTip={inEdit?.isNew ? "Save or cancel the open asset first" : undefined}
            className={assetsMenuStyles.toolbarButton}
            enabled={canEdit && !inEdit?.isNew}
          />
          <Button
            onClick={() => dispatch(thunkCreateFolder({ type: "asset" }))}
            icon={faFolderPlus}
            label="Folder"
            className={assetsMenuStyles.toolbarButton}
            enabled={canEdit}
          />
        </div>
      )}
      {inEdit?.isNew && (
        <AssetEditor
          key={inEdit.uuid}
          inEdit={inEdit}
          canMutate={canEdit}
          coordinateContext={coordinateContext}
        />
      )}
      <div className={assetsMenuStyles.tableContainer}>
        <AssetTable
          assets={assets}
          folders={assetFolders}
          canEdit={canEdit}
          canMutate={canEdit}
          inEdit={inEdit && !inEdit.isNew ? inEdit : null}
          coordinateContext={coordinateContext}
          onEdit={editAsset}
        />
      </div>
    </div>
  );
};
