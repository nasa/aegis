export class Grid_db {
  uuid!: string;

  missionId: number;

  numRows!: number;

  numCols!: number;

  spacing!: number;

  name!: string;

  fileName!: string;

  isActiveGrid!: boolean;

  version!: number; //used for optimistic locking
}
