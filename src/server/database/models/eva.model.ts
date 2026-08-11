export class Eva_db implements Eva_db_type {
  uuid!: string;

  refUuid: string;

  missionId!: number;

  name!: string;

  status!: StationStatus;

  sequence!: EvaSequenceItem[];

  description!: string;

  duration!: number;

  traverseRate!: number;

  egressDuration: number;

  ingressDuration: number;

  egressLocationUuid!: string;

  ingressLocationUuid!: string;

  traverseColor: string;

  ownerId: number;

  datetime: string;

  showEditWarning: boolean;

  editWarningMsg: string;

  createdAt!: Date;

  updatedAt!: Date;

  version!: number; //used for optimistic locking
}
