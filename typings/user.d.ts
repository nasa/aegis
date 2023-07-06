interface User {
  adminPermission: boolean | undefined;
  permissionList?: Permission[];
  id: number;
  username: string;
  password?: string;
  email: string;
  token?: string;
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
