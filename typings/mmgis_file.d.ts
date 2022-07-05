interface File {
  id: number;
  file_owner: string;
  file_owner_group: string[];
  file_name: string;
  file_description: string;
  is_master: boolean;
  intent: string;
  public: string;
  hidden: string;
  created_on: Date;
  updated_on: Date;
}
