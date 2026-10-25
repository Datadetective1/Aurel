/**
 * A Supabase client for tests that holds rows in memory and applies the
 * eq / neq / in / is filters a query asks for, on top-level columns the rows
 * carry (others, and embedded paths like "people.archived_at", are ignored).
 * So a query that still asks for a row it should not gets it back here too.
 * `asked(table, column)` lists every value a query passed to `.in(column, …)`.
 */
export type Row = Record<string, unknown>
type Op = [string, unknown[]]

export function fakeClient(tables: Record<string, Row[]>) {
  const calls: { table: string; ops: Op[] }[] = []
  const client = {
    from(table: string) {
      const ops: Op[] = []
      calls.push({ table, ops })
      const rows = () => {
        let out = tables[table] ?? []
        for (const [op, [column, value]] of ops) {
          if (typeof column !== 'string' || column.includes('.')) continue
          const has = (r: Row) => column in r
          if (op === 'eq' || op === 'is') out = out.filter((r) => !has(r) || r[column] === value)
          if (op === 'neq') out = out.filter((r) => !has(r) || r[column] !== value)
          if (op === 'in') {
            out = out.filter((r) => !has(r) || (value as unknown[]).includes(r[column]))
          }
        }
        return out
      }
      const chain: object = new Proxy(
        {},
        {
          get(_target, prop) {
            if (prop === 'then') {
              return (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
                Promise.resolve({ data: rows(), error: null }).then(resolve, reject)
            }
            if (prop === 'maybeSingle' || prop === 'single') {
              return () => Promise.resolve({ data: rows()[0] ?? null, error: null })
            }
            return (...args: unknown[]) => {
              ops.push([String(prop), args])
              return chain
            }
          },
        },
      )
      return chain
    },
  }
  const asked = (table: string, column: string) =>
    calls
      .filter((c) => c.table === table)
      .flatMap((c) => c.ops.filter(([op, [col]]) => op === 'in' && col === column))
      .flatMap(([, [, values]]) => values as string[])
  return { client: client as never, calls, asked }
}
