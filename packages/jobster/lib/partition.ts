export function partition<T>(array: T[], predicate: (elem: T) => boolean): [T[], T[]] {
  const first: T[] = [];
  const second: T[] = [];

  array.forEach((elem) => (predicate(elem) ? first.push(elem) : second.push(elem)));

  return [first, second];
}
