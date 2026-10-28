// Reading an element the geometry guarantees is there. With noUncheckedIndexedAccess
// every index read may be undefined; when the algorithm has already bounded the
// index, a miss is a bug, so it fails loudly here instead of turning into NaN later.

/** The element at `index`, or a RangeError naming the index when there is none. */
export function at<T>(items: ArrayLike<T>, index: number): T {
  const item = items[index];
  if (item === undefined) {
    throw new RangeError(`route map: no element at index ${index} of ${items.length}`);
  }
  return item;
}
