type PermissionRole = "admin" | "user" | "guest";

interface AEGISUser {
  id: number;
  username: string;
  password?: string;
  email: string;
  permission: PermissionRole;
  token?: string;
  createdAt?: string;
  updatedAt?: string;
}

type AEGISUser_db_type = Omit<AEGISUser, "token" | "createdAt" | "updatedAt"> & {
  createdAt?: Date;
  updatedAt?: Date;
};
