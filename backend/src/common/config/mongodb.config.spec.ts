import { warnIfDatabaseMissing } from './mongodb.config';

describe('MongoDB database warning', () => {
  it.each([
    'mongodb://localhost:27017',
    'mongodb://localhost:27017/?authSource=admin',
    'mongodb://user:secret@host1:27017,host2:27017/?replicaSet=test',
    'mongodb+srv://user:secret@example.invalid/?retryWrites=true',
  ])('warns for an omitted database without disclosing the URI: %s', (uri) => {
    const warn = jest.fn();
    warnIfDatabaseMissing(uri, warn);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).not.toContain(uri);
    expect(warn.mock.calls[0][0]).not.toContain('secret');
  });
  it.each([
    'mongodb://localhost:27017/travel_booking',
    'mongodb://host1:27017,host2:27017/travel_booking?authSource=admin',
    'mongodb+srv://user:encoded%2Fpassword@example.invalid/travel_booking?retryWrites=true',
  ])('preserves explicit database selection: %s', (uri) => {
    const warn = jest.fn();
    warnIfDatabaseMissing(uri, warn);
    expect(warn).not.toHaveBeenCalled();
  });
});
