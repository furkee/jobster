export function partition<T>(array: T[], predicate: (elem: T) => boolean): [T[], T[]] {
  const first: T[] = [];
  const second: T[] = [];

  array.forEach((elem) => (predicate(elem) ? first.push(elem) : second.push(elem)));

  return [first, second];
}

export function times<T>(length: number, callback: (index: number) => T): T[] {
  return new Array(length).fill(null).map((_, i) => callback(i));
}
