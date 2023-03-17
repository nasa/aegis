type PermissionRole = "admin" | "user" | "guest";

interface User {
  id: number;
  username: string;
  password?: string;
  email: string;
  permission: PermissionRole;
  token?: string;
  createdAt?: string;
  updatedAt?: string;
}

type User_db_type = Omit<User, "createdAt" | "updatedAt"> & {
  createdAt?: Date;
  updatedAt?: Date;
};
