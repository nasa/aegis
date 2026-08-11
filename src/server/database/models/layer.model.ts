export class Layer_db implements Layer_db_type {
  uuid: string;

  missionId!: number;

  name!: string;

  createdAt!: Date;

  updatedAt!: Date;

  version!: number; //used for optimistic locking
}
