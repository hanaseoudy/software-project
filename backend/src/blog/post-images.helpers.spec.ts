import { attachImagesFilter, toPostResponse } from './post-images.helpers';

// BLG-10: unit tests for the post image helpers
describe('post image helpers (BLG-10)', () => {
  describe('attachImagesFilter', () => {
    it('only matches my post when there is room for the new images', () => {
      expect(attachImagesFilter('p1', 'u1', 5, 2)).toEqual({
        _id: 'p1',
        author: 'u1',
        'images.3': { $exists: false },
      });
    });

    it('requires an empty post when uploading the maximum at once', () => {
      expect(attachImagesFilter('p1', 'u1', 5, 5)).toHaveProperty(['images.0'], { $exists: false });
    });
  });

  describe('toPostResponse', () => {
    const date = new Date('2026-11-10T00:00:00Z');

    it('returns the image ids and urls', () => {
      const res = toPostResponse({
        _id: 'p1',
        title: 'Luxor',
        content: 'Body',
        status: 'published',
        tags: ['egypt'],
        images: [{ _id: 'i1', url: '/api/uploads/post/a.jpg' }],
        author: 'u1',
        likesCount: 2,
        commentsCount: 1,
        createdAt: date,
        updatedAt: date,
      });
      expect(res).toEqual({
        id: 'p1',
        title: 'Luxor',
        content: 'Body',
        status: 'published',
        tags: ['egypt'],
        images: [{ id: 'i1', url: '/api/uploads/post/a.jpg' }],
        author: 'u1',
        likesCount: 2,
        commentsCount: 1,
        createdAt: date,
        updatedAt: date,
      });
    });

    it('defaults missing arrays and counters', () => {
      const res = toPostResponse({ _id: 'p1', title: 't', content: 'c', status: 'draft', author: 'u1' });
      expect(res).toMatchObject({ tags: [], images: [], likesCount: 0, commentsCount: 0 });
    });
  });
});
