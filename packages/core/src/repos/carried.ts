/** A repository only some Workers carry (Repos.tutor, Repos.images): its absence is a wiring bug. */
export function carried<T>(repository: T | undefined): T {
  if (repository === undefined) {
    throw new Error("this action runs only on the Worker that carries its repository");
  }
  return repository;
}
