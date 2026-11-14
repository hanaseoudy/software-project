import { isStayFullyAvailable } from './stay-availability';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const range = (a: string, b: string) => ({ startDate: d(a), endDate: d(b) });

describe('isStayFullyAvailable', () => {
  it('is true when one range covers every night', () => {
    expect(
      isStayFullyAvailable(d('2027-03-10'), d('2027-03-13'), [
        range('2027-03-01', '2027-03-31'),
      ]),
    ).toBe(true);
  });

  it('is true when the last available night is the night before checkout', () => {
    expect(
      isStayFullyAvailable(d('2027-03-10'), d('2027-03-13'), [
        range('2027-03-10', '2027-03-12'),
      ]),
    ).toBe(true);
  });

  it('is false when the last night is not covered', () => {
    expect(
      isStayFullyAvailable(d('2027-03-10'), d('2027-03-13'), [
        range('2027-03-10', '2027-03-11'),
      ]),
    ).toBe(false);
  });

  it('is false when the first night is not covered', () => {
    expect(
      isStayFullyAvailable(d('2027-03-10'), d('2027-03-13'), [
        range('2027-03-11', '2027-03-31'),
      ]),
    ).toBe(false);
  });

  it('is false when there is a gap in the middle', () => {
    expect(
      isStayFullyAvailable(d('2027-03-10'), d('2027-03-15'), [
        range('2027-03-10', '2027-03-11'),
        range('2027-03-13', '2027-03-20'),
      ]),
    ).toBe(false);
  });

  it('joins adjacent and overlapping ranges, in any order', () => {
    expect(
      isStayFullyAvailable(d('2027-03-10'), d('2027-03-16'), [
        range('2027-03-13', '2027-03-20'),
        range('2027-03-10', '2027-03-12'),
        range('2027-03-11', '2027-03-14'),
      ]),
    ).toBe(true);
  });

  it('is false with no ranges or an invalid stay', () => {
    expect(isStayFullyAvailable(d('2027-03-10'), d('2027-03-12'), [])).toBe(
      false,
    );
    expect(
      isStayFullyAvailable(d('2027-03-12'), d('2027-03-10'), [
        range('2027-03-01', '2027-03-31'),
      ]),
    ).toBe(false);
  });
});
