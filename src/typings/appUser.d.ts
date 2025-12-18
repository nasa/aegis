interface AppUser {
  id: number;
  username: string;
  password?: string;
  isSuperAdmin?: boolean;
  isAdmin?: boolean; //controls access to the backend only (does not control if they can edit once in there)
  permissionList?: Permission[];
  createdAt?: string;
  updatedAt?: string;
}

interface Permission {
  missionId: number;
  permissions: {
    view: boolean;
    edit: boolean;
  };
}

type AppUser_db_type = Omit<AppUser, "createdAt" | "updatedAt"> & {
  createdAt?: Date;
  updatedAt?: Date;
};
