import { groupConsecutiveDays } from './city-groups';

describe('ITN-09 consecutive-city grouping', () => {
  it.each([
    { cities: ['CAI', 'CAI', 'GIZ', 'GIZ', 'CAI', 'CAI'], expected: [2, 2, 2] },
    { cities: ['CAI', 'GIZ', 'CAI', 'GIZ'], expected: [1, 1, 1, 1] },
    { cities: ['CAI', 'CAI', 'CAI'], expected: [3] },
    { cities: ['CAI'], expected: [1] },
    { cities: [], expected: [] },
  ])('groups adjacent days in $cities', ({ cities, expected }) => {
    const days = cities.map((cityId, index) => ({ id: `day-${index + 1}`, dayNumber: index + 1, cityId }));
    const groups = groupConsecutiveDays(days);
    expect(groups.map(group => group.days.length)).toEqual(expected);
    expect(groups.flatMap(group => group.days)).toEqual(days);
    for (const group of groups) expect(group.days.every(day => day.cityId === group.cityId)).toBe(true);
    for (let i = 1; i < groups.length; i++) expect(groups[i].cityId).not.toBe(groups[i - 1].cityId);
  });
  it('preserves IDs, records, input order and frozen inputs', () => {
    const days = Object.freeze([
      Object.freeze({ id: 'last-inserted', dayNumber: 1, cityId: 'CAI', notes: 'keep' }),
      Object.freeze({ id: 'first-inserted', dayNumber: 2, cityId: 'CAI', notes: 'also keep' }),
    ]);
    const groups = groupConsecutiveDays(days);
    expect(groups[0].days).toEqual(days);
    expect(groups[0].days[0]).toBe(days[0]);
    expect(groups[0].days).not.toBe(days);
  });
  it('recalculates boundaries from a changed persisted order', () => {
    const days = ['CAI', 'GIZ', 'CAI'].map((cityId, index) => ({ id: String(index), cityId }));
    expect(groupConsecutiveDays(days).map(group => group.days.length)).toEqual([1, 1, 1]);
    expect(groupConsecutiveDays([days[0], days[2], days[1]]).map(group => group.days.map(day => day.id))).toEqual([['0', '2'], ['1']]);
  });
});
