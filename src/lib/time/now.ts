/**
 * Request-time clock for server components. Pages using it already read cookies, so they render
 * per request; centralising the read keeps components pure and makes the clock easy to stub.
 */
export function nowMs(): number {
  return Date.now();
}
