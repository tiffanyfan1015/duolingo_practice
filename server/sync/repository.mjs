import { SyncError } from "./duolingo.mjs";
export const SCHEMA = [
  "CREATE TABLE IF NOT EXISTS catalogs (language TEXT PRIMARY KEY, payload TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS sync_jobs (language TEXT PRIMARY KEY, id TEXT NOT NULL, revision INTEGER NOT NULL, updated INTEGER NOT NULL, payload TEXT NOT NULL)",
];
export function repository(db) {
  if (!db) throw new SyncError("尚未綁定雲端 D1 資料庫 DB。", 503);
  const get = async (language) => {
    const row = await db
      .prepare("SELECT * FROM sync_jobs WHERE language = ?")
      .bind(language)
      .first();
    return row ? { ...JSON.parse(row.payload), revision: row.revision } : null;
  };
  return {
    init: () => db.batch(SCHEMA.map((sql) => db.prepare(sql))),
    get,
    async courses() {
      return (
        await db.prepare("SELECT payload FROM catalogs").all()
      ).results.map((row) => JSON.parse(row.payload));
    },
    async start(job, previous) {
      const payload = JSON.stringify(job);
      const result = previous
        ? await db
            .prepare(
              "UPDATE sync_jobs SET id=?, revision=revision+1, updated=?, payload=? WHERE language=? AND revision=?",
            )
            .bind(job.id, Date.now(), payload, job.language, previous.revision)
            .run()
        : await db
            .prepare(
              "INSERT OR IGNORE INTO sync_jobs(language,id,revision,updated,payload) VALUES(?,?,0,?,?)",
            )
            .bind(job.language, job.id, Date.now(), payload)
            .run();
      if (!result.meta.changes)
        throw new SyncError("另一個視窗正在同步，請稍後繼續。", 409);
      return get(job.language);
    },
    async save(job, course = null) {
      const payload = JSON.stringify(job);
      if (payload.length > 1500000)
        throw new SyncError("字庫超出此版同步容量，原資料未變更。");
      const statements = [];
      if (course)
        statements.push(
          db
            .prepare(
              "INSERT INTO catalogs(language,payload) SELECT ?,? WHERE EXISTS(SELECT 1 FROM sync_jobs WHERE language=? AND id=? AND revision=?) ON CONFLICT(language) DO UPDATE SET payload=excluded.payload",
            )
            .bind(
              job.language,
              JSON.stringify(course),
              job.language,
              job.id,
              job.revision,
            ),
        );
      statements.push(
        db
          .prepare(
            "UPDATE sync_jobs SET revision=revision+1, updated=?, payload=? WHERE language=? AND id=? AND revision=?",
          )
          .bind(Date.now(), payload, job.language, job.id, job.revision),
      );
      const results = await db.batch(statements);
      if (!results.at(-1).meta.changes)
        throw new SyncError("同步狀態已由另一個視窗更新，請繼續同步。", 409);
      return get(job.language);
    },
  };
}
