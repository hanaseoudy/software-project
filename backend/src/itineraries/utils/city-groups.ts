export interface ConsecutiveCityGroup<T> {
  cityId: string;
  days: T[];
}

// Input must already be validated and sorted by dayNumber. Group membership
// depends on adjacency, not on insertion order or a city-wide grouping key.
export function groupConsecutiveDays<T extends { cityId: string }>(
  days: readonly T[],
): ConsecutiveCityGroup<T>[] {
  const groups: ConsecutiveCityGroup<T>[] = [];
  for (const day of days) {
    const previous = groups[groups.length - 1];
    if (previous?.cityId === day.cityId) previous.days.push(day);
    else groups.push({ cityId: day.cityId, days: [day] });
  }
  return groups;
}
