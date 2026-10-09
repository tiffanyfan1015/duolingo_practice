import { DatabaseSync } from "node:sqlite";
export function testDatabase() {
  const sql = new DatabaseSync(":memory:");
  return {
    prepare(query) {
      let args = [];
      return {
        bind(...values) { args = values; return this; },
        first: async () => sql.prepare(query).get(...args) || null,
        all: async () => ({ results: sql.prepare(query).all(...args) }),
        run: async () => ({ meta: { changes: Number(sql.prepare(query).run(...args).changes) } }),
      };
    },
    async batch(statements) {
      sql.exec("BEGIN");
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sql.exec("COMMIT");
        return results;
      } catch (error) { sql.exec("ROLLBACK"); throw error; }
    },
    close: () => sql.close(),
  };
}
