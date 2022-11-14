type PermissionRole = "admin" | "user" | "guest";

interface AEGISUser {
  id: number;
  username: string;
  password?: string;
  email: string;
  permission: PermissionRole;
  token?: string;
}
