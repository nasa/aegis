export class EnvironmentConfig_db {
  id!: number;

  key: string;

  value: string | null = null;

  description: string | null = null;

  createdAt!: Date;

  updatedAt!: Date;

  version!: number;
}
