type FolderType = "poi" | "station" | "eva" | "preset" | "rex" | "layer";

interface Folder {
  uuid: string;
  missionId: number;
  name: string;
  type: FolderType;
  items: string[]; // uuids of items in this folder
  createdAt: string;
  updatedAt: string;
}

type Folder_db_type = Omit<Folder, "missionId" | "createdAt" | "updatedAt"> & {
  mission: Mission_db_type;
  createdAt?: Date;
  updatedAt?: Date;
};

// Stored only in interface store
interface FolderInterface {
  uuid: string;
  isOpen: boolean;
  visible: boolean;
  editing: boolean;
  editingNameValue: string | null;
}

interface FoldersInterfaceCookie {
  [folderUuid: string]: FolderInterface;
}

interface FolderItemProps<T> {
  item: T;
  isDragging?: boolean;
  first?: boolean;
}
