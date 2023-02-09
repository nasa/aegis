interface Eva {
  uuid: string;
  ownerId: number;
  missionId: number;

  name: string;
  status: EVAStatus;
  sequence: EvaSequenceItem[];
  description: string;

  createdAt?: string;
  updatedAt?: string;
}

type Eva_db_type = Omit<Eva, "ownerId" | "missionId" | "createdAt" | "updatedAt"> & {
  owner: User;
  mission: Mission_db_type;
  createdAt?: Date;
  updatedAt?: Date;
};

type EVAStatus = "Archived" | "Candidate" | "In Review" | "Approved";

interface Traverse {
  uuid: string;
  missionId: number;

  name: string;
  location: AEGISPoint[];
  duration: number;
  description: string;

  createdAt?: string;
  updatedAt?: string;
}

type Traverse_db_type = Omit<Traverse, "missionId" | "createdAt" | "updatedAt"> & {
  mission: Mission_db_type;
  createdAt?: Date;
  updatedAt?: Date;
};

interface EvaSequenceItem {
  type: "station" | "traverse";
  uuid: string;
}
