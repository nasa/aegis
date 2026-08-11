import * as bcrypt from "bcryptjs";

export class App_User_db implements AppUser_db_type {
  id!: number;

  username!: string;

  password!: string;

  isSuperAdmin: boolean;

  isAdmin: boolean;

  permissionList?: Permission[];

  createdAt!: Date;

  updatedAt!: Date;

  version!: number; //used for optimistic locking

  async beforeCreate(): Promise<void> {
    const salt = await bcrypt.genSalt();
    this.password = bcrypt.hashSync(this.password, salt);
  }
}
