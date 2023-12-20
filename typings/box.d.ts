type BoxOrderItem = {
  by: string;
  direction: "ASC" | "DESC";
};

type BoxItemEntry = {
  type: "file" | "folder";
  id: string;
  sequence_id: string;
  etag: string;
  name: string;
  size?: number;
};

type BoxItemsResponse = {
  total_count: number;
  entries: BoxItemEntry[];
  limit: number;
  offset: number;
};
