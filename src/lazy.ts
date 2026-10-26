// Code that loads on first use: a function from a module that is imported the first time it's called.

/** A stand-in for a module's function that loads the module the first time it's called. */
export function later<M, K extends keyof M>(load: () => Promise<M>, name: K): M[K] extends (...args: infer A) => infer R ? (...args: A) => Promise<Awaited<R>> : never {
  let got: Promise<M> | null = null;
  const call = async (...args: unknown[]) => {
    got ??= load().catch((err: unknown) => { got = null; throw err; });
    return ((await got)[name] as unknown as (...a: unknown[]) => unknown)(...args);
  };
  return call as never;
}

