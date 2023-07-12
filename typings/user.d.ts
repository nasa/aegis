interface User {
  id: number;
  username: string;
  password?: string;
  isSuperAdmin?: boolean;
  isAdmin?: boolean;
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

type User_db_type = Omit<User, "createdAt" | "updatedAt"> & {
  createdAt?: Date;
  updatedAt?: Date;
};
