// Response shapes shared by many endpoints.

/** GEN-05: every paginated list (fixed page size 10, `?page=`). */
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
