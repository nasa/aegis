export class STM_Rule_db implements STMRule_db_type {
  uuid!: string;

  missionId!: number;

  stmUuid!: string;

  count: number;

  verbUuids: string[];

  nounUuids: string[];

  adjectiveUuids: string[];

  verbAny: boolean;

  nounAny: boolean;

  adjectiveAny: boolean;

  createdAt!: Date;

  updatedAt!: Date;

  version!: number; //used for optimistic locking
}
