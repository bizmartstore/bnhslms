/**
 * Reject if a promise does not settle within `ms`.
 *
 * Supabase requests can stay pending indefinitely on flaky mobile connections
 * or when the database is blocked, which leaves submit buttons stuck on
 * "Saving..." forever. Wrapping the call turns that into an actionable error.
 */
export function withTimeout<T>(
  promise: PromiseLike<T>,
  ms: number,
  message = "The request took too long. Please check your connection and try again.",
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
