import {
  buildExcerpt,
  buildSearchPipeline,
  escapeRegex,
  NO_RESULTS_MESSAGE,
  PostSearchRow,
  SEARCH_PAGE_SIZE,
  toSearchPage,
} from './post-search.helpers';

// BLG-09: unit tests for the post search logic
describe('post search helpers (BLG-09)', () => {
  const options = { q: 'luxor', page: 1, publishedStatus: 'published', usersCollection: 'users' };
  const stage = (pipeline: Record<string, any>[], key: string, nth = 0) =>
    pipeline.filter((s) => key in s)[nth][key];

  describe('escapeRegex', () => {
    it('escapes regex special characters so they match literally', () => {
      expect(escapeRegex('c++ (rome).*?')).toBe('c\\+\\+ \\(rome\\)\\.\\*\\?');
      expect(new RegExp(escapeRegex('a.b')).test('axb')).toBe(false);
    });
  });

  describe('buildExcerpt', () => {
    it('returns short content unchanged', () => {
      expect(buildExcerpt('Short post')).toBe('Short post');
    });

    it('cuts long content at a word boundary and adds "..."', () => {
      // 'word ' x29 = 145 chars, so "wordiest" (145-152) crosses the 150 limit
      const content = `${'word '.repeat(29)}wordiest tail that is cut`;
      const excerpt = buildExcerpt(content);
      expect(excerpt.endsWith('...')).toBe(true);
      expect(excerpt.length).toBeLessThanOrEqual(153);
      expect(excerpt).toBe(`${'word '.repeat(29).trimEnd()}...`); // the split word is dropped
    });

    it('keeps a word that ends exactly at the limit', () => {
      const content = `${'a'.repeat(150)} rest`;
      expect(buildExcerpt(content)).toBe(`${'a'.repeat(150)}...`);
    });

    it('collapses whitespace and handles missing content', () => {
      expect(buildExcerpt('  line one\n\nline   two ')).toBe('line one line two');
      expect(buildExcerpt(undefined as unknown as string)).toBe('');
    });
  });

  describe('buildSearchPipeline', () => {
    it('only searches published, visible posts first', () => {
      const pipeline = buildSearchPipeline(options);
      expect(pipeline[0]).toEqual({ $match: { status: 'published', isHidden: false } });
    });

    it('joins the users collection only for first and last name', () => {
      const lookup = stage(buildSearchPipeline(options), '$lookup');
      expect(lookup).toMatchObject({ from: 'users', localField: 'author', foreignField: '_id' });
      expect(lookup.pipeline).toEqual([{ $project: { _id: 1, firstName: 1, lastName: 1 } }]);
    });

    it('matches title, tags and author first, last or full name case-insensitively', () => {
      const match = stage(buildSearchPipeline({ ...options, q: '  Maya Haitham ' }), '$match', 1);
      const keyword = { $regex: 'Maya Haitham', $options: 'i' };
      expect(match.$or).toEqual([
        { title: keyword },
        { tags: keyword },
        { 'authorDoc.firstName': keyword },
        { 'authorDoc.lastName': keyword },
        { authorName: keyword },
      ]);
    });

    it('escapes the keyword', () => {
      const match = stage(buildSearchPipeline({ ...options, q: 'a.b*' }), '$match', 1);
      expect(match.$or[0].title.$regex).toBe('a\\.b\\*');
    });

    it('ranks by interaction score desc, then newest first', () => {
      const pipeline = buildSearchPipeline(options);
      expect(stage(pipeline, '$set', 2)).toEqual({
        interactionScore: {
          $add: [{ $ifNull: ['$likesCount', 0] }, { $ifNull: ['$commentsCount', 0] }],
        },
      });
      expect(Object.entries(stage(pipeline, '$sort'))).toEqual([
        ['interactionScore', -1],
        ['createdAt', -1],
        ['_id', -1],
      ]);
    });

    it('paginates 10 per page', () => {
      const facet = stage(buildSearchPipeline({ ...options, page: 3 }), '$facet');
      expect(facet.items[0]).toEqual({ $skip: 2 * SEARCH_PAGE_SIZE });
      expect(facet.items[1]).toEqual({ $limit: 10 });
      expect(facet.total).toEqual([{ $count: 'n' }]);
    });

    it('returns only the result fields', () => {
      const project = stage(buildSearchPipeline(options), '$facet').items[2].$project;
      expect(Object.keys(project).sort()).toEqual(
        ['_id', 'author', 'commentsCount', 'content', 'createdAt', 'id', 'interactionScore', 'likesCount', 'tags', 'title'].sort(),
      );
      expect(project._id).toBe(0);
    });
  });

  describe('toSearchPage', () => {
    const row = (n: number): PostSearchRow => ({
      id: String(n),
      title: `Post ${n}`,
      author: { id: 'u1', name: 'Maya Haitham' },
      createdAt: new Date('2026-11-10T00:00:00Z'),
      content: 'Body',
      likesCount: 2,
      commentsCount: 1,
      interactionScore: 3,
      tags: ['egypt'],
    });

    it('maps rows to items with an excerpt instead of the full content', () => {
      const page = toSearchPage({ items: [row(1)], total: [{ n: 21 }] }, 2);
      expect(page).toEqual({
        items: [{ ...(({ content: _content, ...rest }) => rest)(row(1)), excerpt: 'Body' }],
        total: 21,
        page: 2,
        pageSize: 10,
        totalPages: 3,
      });
      expect(page.items[0]).not.toHaveProperty('content');
      expect(page).not.toHaveProperty('message');
    });

    it('returns an empty page with "No results" when nothing matches', () => {
      expect(toSearchPage({ items: [], total: [] }, 1)).toEqual({
        items: [],
        total: 0,
        page: 1,
        pageSize: 10,
        totalPages: 0,
        message: NO_RESULTS_MESSAGE,
      });
      expect(toSearchPage(undefined, 1).message).toBe('No results');
    });

    it('does not say "No results" for an out-of-range page when posts matched', () => {
      const page = toSearchPage({ items: [], total: [{ n: 5 }] }, 4);
      expect(page.items).toEqual([]);
      expect(page.message).toBeUndefined();
    });
  });
});
