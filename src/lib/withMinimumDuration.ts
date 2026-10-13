/**
 * Resolves with `promise`'s value, but never sooner than `minimumMs`.
 * Keeps a loading state on screen long enough to read, instead of flashing when the
 * response is fast; slow responses are not delayed any further.
 */
export async function withMinimumDuration<T>(promise: Promise<T>, minimumMs: number): Promise<T> {
  const [value] = await Promise.all([
    promise,
    new Promise<void>((resolve) => setTimeout(resolve, minimumMs)),
  ]);
  return value;
}
