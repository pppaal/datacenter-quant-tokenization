/**
 * Shared, network/DB-free Prisma fakes for service DB-wrapper unit tests.
 *
 * Service read/write wrappers (e.g. `listDeals`, `getFundById`,
 * `upsertTokenizedAsset`) accept an injected `db: PrismaClient = prisma`
 * argument. These helpers build a *minimal* stand-in for one Prisma model
 * delegate that:
 *
 *   1. captures the exact args the wrapper passed (so a test can assert the
 *      stitched `where` / `include` / `orderBy` / `take` projection — the
 *      load-bearing contract of these wrappers), and
 *   2. returns a caller-supplied canned row/array (so the wrapper's own
 *      mapping/projection can be asserted on the way out).
 *
 * Nothing here touches the network, the filesystem, or a real database; the
 * fakes are plain in-memory objects cast to `never` at the call site.
 */

/** Records the args a single delegate method was invoked with. */
export type CallCapture = {
  /** The args object the wrapper passed to the delegate method, or undefined if never called. */
  args: unknown;
  /** How many times the method was invoked. */
  count: number;
};

/**
 * Build a fake for a single Prisma model delegate (e.g. `db.fund`,
 * `db.deal`, `db.tokenizedAsset`). Each method in `methods` is wrapped so the
 * latest call's args land in the returned `<method>` capture, and the canned
 * return value is handed back to the wrapper under test.
 *
 * Example:
 *   const { db, calls } = makeModelFake('fund', {
 *     findMany: () => [{ id: 'f1' }]
 *   });
 *   await listFunds(db);
 *   assert.deepEqual(calls.findMany.args, { include: fundInclude, orderBy: {...} });
 */
export function makeModelFake(
  model: string,
  methods: Record<string, (args: unknown) => unknown>
): {
  db: never;
  calls: Record<string, CallCapture>;
} {
  const calls: Record<string, CallCapture> = {};
  const delegate: Record<string, (args: unknown) => unknown> = {};

  for (const [name, impl] of Object.entries(methods)) {
    calls[name] = { args: undefined, count: 0 };
    delegate[name] = async (args: unknown) => {
      calls[name].args = args;
      calls[name].count += 1;
      return impl(args);
    };
  }

  return {
    db: { [model]: delegate } as never,
    calls
  };
}

/**
 * Convenience for the most common shape: a single read method on a single
 * model returning a canned value, with the call captured. Returns the capture
 * directly so a test reads as `const { db, call } = makeReadFake(...)`.
 */
export function makeReadFake(
  model: string,
  method: string,
  returns: unknown
): { db: never; call: CallCapture } {
  const { db, calls } = makeModelFake(model, { [method]: () => returns });
  return { db, call: calls[method] };
}
