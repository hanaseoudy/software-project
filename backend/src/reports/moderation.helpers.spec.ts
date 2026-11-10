import {
  buildPreview,
  isModeratable,
  itemKey,
  moderationUnavailableMessage,
  previewFor,
  REPORT_ALREADY_RESOLVED_MESSAGE,
  statusForAction,
} from './moderation.helpers';

// GEN-10: unit tests for the moderation helpers
describe('moderation helpers (GEN-10)', () => {
  it('only posts and comments can be moderated for now', () => {
    expect(isModeratable('post')).toBe(true);
    expect(isModeratable('comment')).toBe(true);
    expect(isModeratable('review')).toBe(false);
    expect(isModeratable('itinerary')).toBe(false);
    expect(moderationUnavailableMessage('review')).toBe('Moderation for review is not available yet');
  });

  it('maps an action to the report status', () => {
    expect(statusForAction('dismiss')).toBe('dismissed');
    expect(statusForAction('hide')).toBe('resolved');
    expect(statusForAction('delete')).toBe('resolved');
  });

  it('uses the required 409 message', () => {
    expect(REPORT_ALREADY_RESOLVED_MESSAGE).toBe('Report already resolved');
  });

  describe('buildPreview', () => {
    it('keeps short text and collapses whitespace', () => {
      expect(buildPreview('  Nice\n\n post ')).toBe('Nice post');
    });

    it('cuts long text at 100 characters with "..."', () => {
      const preview = buildPreview('x'.repeat(150));
      expect(preview).toBe(`${'x'.repeat(100)}...`);
    });

    it('returns null for missing content', () => {
      expect(buildPreview(undefined)).toBeNull();
      expect(buildPreview(null)).toBeNull();
    });
  });

  describe('previewFor', () => {
    it('builds a preview per content type', () => {
      expect(previewFor('post', { title: 'Luxor', content: 'Karnak at dawn' })).toBe('Luxor: Karnak at dawn');
      expect(previewFor('comment', { text: 'Rude comment' })).toBe('Rude comment');
      expect(previewFor('review', { rating: 1, comment: 'Dirty room' })).toBe('1/5: Dirty room');
      expect(previewFor('review', { rating: 4 })).toBe('4/5');
    });

    it('returns null when the content is gone or not previewable', () => {
      expect(previewFor('post', undefined)).toBeNull();
      expect(previewFor('itinerary', { title: 'Trip' })).toBeNull();
    });
  });

  it('groups reports by type and id', () => {
    expect(itemKey('post', { toString: () => 'abc' })).toBe('post:abc');
    expect(itemKey('comment', 'abc')).not.toBe(itemKey('post', 'abc'));
  });
});
