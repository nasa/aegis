export class Doc_Listing_db implements DocListing_db_type {
  missionId: number;

  automergeUrl: string;

  version!: number; //used for optimistic locking
}
