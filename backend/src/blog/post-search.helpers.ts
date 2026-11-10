// BLG-09: pure helpers for the post search (no Nest imports, so they can be unit tested directly).

// Same page size and response shape as the other paginated lists (GEN-05).
export const SEARCH_PAGE_SIZE = 10;
export const EXCERPT_LENGTH = 150;
export const NO_RESULTS_MESSAGE = 'No results';

export interface PostSearchItem {
  id: string;
  title: string;
  author: { id: string; name: string };
  createdAt: Date;
  excerpt: string;
  likesCount: number;
  commentsCount: number;
  interactionScore: number;
  tags: string[];
}

export interface PostSearchPage {
  items: PostSearchItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  message?: string;
}

// Raw document shape returned by the aggregation's items facet.
export interface PostSearchRow extends Omit<PostSearchItem, 'excerpt'> {
  content: string;
}

export interface PostSearchFacet {
  items: PostSearchRow[];
  total: { n: number }[];
}

// Escape regex special characters so the keyword is matched literally.
export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// First 150 characters of the content, cut at a word boundary, with "..." if it was longer.
export function buildExcerpt(content: string, maxLength = EXCERPT_LENGTH): string {
  const text = (content ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;

  let cut = text.slice(0, maxLength);
  // Only step back to a space if the cut landed inside a word.
  if (text[maxLength] !== ' ') {
    const lastSpace = cut.lastIndexOf(' ');
    if (lastSpace > 0) cut = cut.slice(0, lastSpace);
  }
  return `${cut.trimEnd()}...`;
}

export interface SearchPipelineOptions {
  q: string;
  page: number;
  publishedStatus: string;
  usersCollection: string;
}

// Aggregation: published + visible posts, matched case-insensitively on title, tags or
// author first/last/full name (users collection is only read), ranked by
// likesCount + commentsCount desc, then newest first, 10 per page.
export function buildSearchPipeline({
  q,
  page,
  publishedStatus,
  usersCollection,
}: SearchPipelineOptions): Record<string, unknown>[] {
  const keyword = { $regex: escapeRegex(q.trim()), $options: 'i' };

  return [
    { $match: { status: publishedStatus, isHidden: false } },
    {
      $lookup: {
        from: usersCollection,
        localField: 'author',
        foreignField: '_id',
        pipeline: [{ $project: { _id: 1, firstName: 1, lastName: 1 } }],
        as: 'authorDoc',
      },
    },
    { $set: { authorDoc: { $first: '$authorDoc' } } },
    {
      $set: {
        authorName: {
          $trim: {
            input: {
              $concat: [
                { $ifNull: ['$authorDoc.firstName', ''] },
                ' ',
                { $ifNull: ['$authorDoc.lastName', ''] },
              ],
            },
          },
        },
      },
    },
    {
      $match: {
        $or: [
          { title: keyword },
          { tags: keyword },
          { 'authorDoc.firstName': keyword },
          { 'authorDoc.lastName': keyword },
          { authorName: keyword },
        ],
      },
    },
    {
      $set: {
        interactionScore: {
          $add: [{ $ifNull: ['$likesCount', 0] }, { $ifNull: ['$commentsCount', 0] }],
        },
      },
    },
    // _id is a final tie-breaker so pages are stable when two posts share a timestamp
    { $sort: { interactionScore: -1, createdAt: -1, _id: -1 } },
    {
      $facet: {
        items: [
          { $skip: (page - 1) * SEARCH_PAGE_SIZE },
          { $limit: SEARCH_PAGE_SIZE },
          {
            $project: {
              _id: 0,
              id: { $toString: '$_id' },
              title: 1,
              author: { id: { $toString: '$author' }, name: '$authorName' },
              createdAt: 1,
              content: 1,
              likesCount: { $ifNull: ['$likesCount', 0] },
              commentsCount: { $ifNull: ['$commentsCount', 0] },
              interactionScore: 1,
              tags: { $ifNull: ['$tags', []] },
            },
          },
        ],
        total: [{ $count: 'n' }],
      },
    },
  ];
}

// Turn the facet result into the paginated response; adds "No results" when nothing matched.
export function toSearchPage(facet: PostSearchFacet | undefined, page: number): PostSearchPage {
  const total = facet?.total?.[0]?.n ?? 0;
  const items = (facet?.items ?? []).map(({ content, ...rest }) => ({
    ...rest,
    excerpt: buildExcerpt(content),
  }));

  const result: PostSearchPage = {
    items,
    total,
    page,
    pageSize: SEARCH_PAGE_SIZE,
    totalPages: Math.ceil(total / SEARCH_PAGE_SIZE),
  };
  if (total === 0) result.message = NO_RESULTS_MESSAGE;
  return result;
}
