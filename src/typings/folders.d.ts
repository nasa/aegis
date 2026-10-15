type FolderType = "poi" | "station" | "eva" | "preset" | "layer";

interface Folder {
  uuid: string;
  missionId: number;
  name: string;
  type: FolderType;
  items: string[]; // uuids of items in this folder
  createdAt: number;
  updatedAt: number;
}

// Stored only in interface store
interface FolderInterface {
  uuid: string;
  isOpen: boolean;
  visible: boolean;
  editing: boolean;
  editingNameValue: string | null;
}

// Also the format stored in the cookie AEGIS_Folders_Interface
interface FoldersInterfaceState {
  [folderUuid: string]: FolderInterface;
}

interface FolderItemProps {
  itemUuid: string;
  isDragging?: boolean;
  first?: boolean;
}
