import {
  buildRoomStatusPeriods,
  RoomDayStatus,
  StatusInterval,
} from './room-status';

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
const interval = (
  status: RoomDayStatus,
  from: string,
  to: string,
  reference?: string,
  reservationStatus?: string,
): StatusInterval => ({
  status,
  from: day(from),
  to: day(to),
  ...(reference === undefined ? {} : { reference, reservationStatus }),
});
const build = (from: string, to: string, intervals: StatusInterval[]) =>
  buildRoomStatusPeriods(day(from), day(to), intervals);

const { AVAILABLE, BOOKED, BLOCKED } = RoomDayStatus;

describe('buildRoomStatusPeriods', () => {
  it('returns nothing when no range, block or reservation covers the days', () => {
    expect(build('2026-12-01', '2026-12-31', [])).toEqual([]);
  });

  it('returns one Available period for a bookable range inside the days', () => {
    expect(
      build('2026-12-01', '2026-12-31', [
        interval(AVAILABLE, '2026-12-05', '2026-12-20'),
      ]),
    ).toEqual([
      { status: AVAILABLE, startDate: '2026-12-05', endDate: '2026-12-20' },
    ]);
  });

  it('cuts a range to the chosen days (both days included)', () => {
    expect(
      build('2026-12-10', '2026-12-12', [
        interval(AVAILABLE, '2026-12-01', '2026-12-31'),
      ]),
    ).toEqual([
      { status: AVAILABLE, startDate: '2026-12-10', endDate: '2026-12-12' },
    ]);
  });

  it('works for a single day', () => {
    expect(
      build('2026-12-10', '2026-12-10', [
        interval(AVAILABLE, '2026-12-01', '2026-12-31'),
      ]),
    ).toEqual([
      { status: AVAILABLE, startDate: '2026-12-10', endDate: '2026-12-10' },
    ]);
  });

  it('shows a reservation with its reference and status inside a bookable range', () => {
    expect(
      build('2026-12-01', '2026-12-31', [
        interval(AVAILABLE, '2026-12-01', '2026-12-31'),
        interval(BOOKED, '2026-12-10', '2026-12-13', 'HB-1', 'CONFIRMED'),
      ]),
    ).toEqual([
      { status: AVAILABLE, startDate: '2026-12-01', endDate: '2026-12-09' },
      {
        status: BOOKED,
        startDate: '2026-12-10',
        endDate: '2026-12-13',
        reservationReference: 'HB-1',
        reservationStatus: 'CONFIRMED',
      },
      { status: AVAILABLE, startDate: '2026-12-14', endDate: '2026-12-31' },
    ]);
  });

  it('shows a block inside a bookable range', () => {
    expect(
      build('2026-12-01', '2026-12-31', [
        interval(AVAILABLE, '2026-12-01', '2026-12-31'),
        interval(BLOCKED, '2026-12-15', '2026-12-16'),
      ]),
    ).toEqual([
      { status: AVAILABLE, startDate: '2026-12-01', endDate: '2026-12-14' },
      { status: BLOCKED, startDate: '2026-12-15', endDate: '2026-12-16' },
      { status: AVAILABLE, startDate: '2026-12-17', endDate: '2026-12-31' },
    ]);
  });

  it('shows a Booked day above a block on the same day', () => {
    expect(
      build('2026-12-10', '2026-12-14', [
        interval(BLOCKED, '2026-12-10', '2026-12-14'),
        interval(BOOKED, '2026-12-12', '2026-12-12', 'HB-1', 'CONFIRMED'),
      ]),
    ).toEqual([
      { status: BLOCKED, startDate: '2026-12-10', endDate: '2026-12-11' },
      {
        status: BOOKED,
        startDate: '2026-12-12',
        endDate: '2026-12-12',
        reservationReference: 'HB-1',
        reservationStatus: 'CONFIRMED',
      },
      { status: BLOCKED, startDate: '2026-12-13', endDate: '2026-12-14' },
    ]);
  });

  it('joins bookable ranges that touch and overlap into one period', () => {
    expect(
      build('2026-12-01', '2026-12-31', [
        interval(AVAILABLE, '2026-12-01', '2026-12-10'),
        interval(AVAILABLE, '2026-12-11', '2026-12-15'),
        interval(AVAILABLE, '2026-12-14', '2026-12-20'),
      ]),
    ).toEqual([
      { status: AVAILABLE, startDate: '2026-12-01', endDate: '2026-12-20' },
    ]);
  });

  it('leaves a gap between two ranges without a period', () => {
    expect(
      build('2026-12-01', '2026-12-31', [
        interval(AVAILABLE, '2026-12-01', '2026-12-10'),
        interval(AVAILABLE, '2026-12-20', '2026-12-31'),
      ]),
    ).toEqual([
      { status: AVAILABLE, startDate: '2026-12-01', endDate: '2026-12-10' },
      { status: AVAILABLE, startDate: '2026-12-20', endDate: '2026-12-31' },
    ]);
  });

  it('keeps two back-to-back reservations apart (different references)', () => {
    expect(
      build('2026-12-10', '2026-12-15', [
        interval(BOOKED, '2026-12-10', '2026-12-12', 'HB-1', 'CONFIRMED'),
        interval(BOOKED, '2026-12-13', '2026-12-15', 'HB-2', 'CONFIRMED'),
      ]),
    ).toEqual([
      {
        status: BOOKED,
        startDate: '2026-12-10',
        endDate: '2026-12-12',
        reservationReference: 'HB-1',
        reservationStatus: 'CONFIRMED',
      },
      {
        status: BOOKED,
        startDate: '2026-12-13',
        endDate: '2026-12-15',
        reservationReference: 'HB-2',
        reservationStatus: 'CONFIRMED',
      },
    ]);
  });

  it('cuts a reservation that starts before the chosen days', () => {
    expect(
      build('2026-12-12', '2026-12-20', [
        interval(BOOKED, '2026-12-10', '2026-12-13', 'HB-1', 'CONFIRMED'),
      ]),
    ).toEqual([
      {
        status: BOOKED,
        startDate: '2026-12-12',
        endDate: '2026-12-13',
        reservationReference: 'HB-1',
        reservationStatus: 'CONFIRMED',
      },
    ]);
  });

  it('ignores an interval that is completely outside the chosen days', () => {
    expect(
      build('2026-12-10', '2026-12-12', [
        interval(AVAILABLE, '2026-11-01', '2026-12-09'),
        interval(BLOCKED, '2026-12-13', '2026-12-31'),
      ]),
    ).toEqual([]);
  });

  it('does not change the intervals it is given', () => {
    const intervals = [interval(AVAILABLE, '2026-12-01', '2026-12-31')];
    build('2026-12-10', '2026-12-12', intervals);
    expect(intervals[0].from).toEqual(day('2026-12-01'));
    expect(intervals[0].to).toEqual(day('2026-12-31'));
  });
});
