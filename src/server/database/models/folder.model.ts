export class Folder_db implements Folder_db_type {
  uuid!: string;

  missionId!: number;

  name!: string;

  type!: FolderType;

  items!: string[]; // uuids of items in this folder

  createdAt!: Date;

  updatedAt!: Date;

  version!: number; //used for optimistic locking
}
