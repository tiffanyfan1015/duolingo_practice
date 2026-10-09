import { SyncError } from "./duolingo.mjs";
export const USER_SYNC_SCHEMA = [
  "CREATE TABLE IF NOT EXISTS user_catalogs (user_id TEXT NOT NULL, connection_id TEXT NOT NULL, language TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(user_id,connection_id,language))",
  "CREATE TABLE IF NOT EXISTS user_sync_jobs (user_id TEXT NOT NULL, connection_id TEXT NOT NULL, language TEXT NOT NULL, id TEXT NOT NULL, revision INTEGER NOT NULL, updated INTEGER NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(user_id,connection_id,language))",
];
export function userRepository(db, user) {
  if (!user?.id || !user.connection_id) throw new SyncError("缺少使用者身分。", 401);
  const scope = [user.id, user.connection_id];
  const get = async (language) => {
    const row = await db.prepare("SELECT * FROM user_sync_jobs WHERE user_id=? AND connection_id=? AND language=?").bind(...scope, language).first();
    return row ? { ...JSON.parse(row.payload), revision: row.revision } : null;
  };
  return {
    init: () => db.batch(USER_SYNC_SCHEMA.map((sql) => db.prepare(sql))),
    get,
    async courses() {
      return (await db.prepare("SELECT payload FROM user_catalogs WHERE user_id=? AND connection_id=?").bind(...scope).all()).results.map((row) => JSON.parse(row.payload));
    },
    async start(job, previous) {
      const result = previous
        ? await db.prepare("UPDATE user_sync_jobs SET id=?,revision=revision+1,updated=?,payload=? WHERE user_id=? AND connection_id=? AND language=? AND revision=?").bind(job.id, Date.now(), JSON.stringify(job), ...scope, job.language, previous.revision).run()
        : await db.prepare("INSERT OR IGNORE INTO user_sync_jobs(user_id,connection_id,language,id,revision,updated,payload) VALUES(?,?,?,?,0,?,?)").bind(...scope, job.language, job.id, Date.now(), JSON.stringify(job)).run();
      if (!result.meta.changes) throw new SyncError("另一個視窗正在同步，請稍後繼續。", 409);
      return get(job.language);
    },
    async save(job, course = null) {
      const payload = JSON.stringify(job);
      if (payload.length > 1500000) throw new SyncError("字庫超出此版同步容量，原資料未變更。");
      const statements = [];
      if (course) statements.push(db.prepare("INSERT INTO user_catalogs(user_id,connection_id,language,payload) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM user_sync_jobs WHERE user_id=? AND connection_id=? AND language=? AND id=? AND revision=?) ON CONFLICT(user_id,connection_id,language) DO UPDATE SET payload=excluded.payload").bind(...scope, job.language, JSON.stringify(course), ...scope, job.language, job.id, job.revision));
      statements.push(db.prepare("UPDATE user_sync_jobs SET revision=revision+1,updated=?,payload=? WHERE user_id=? AND connection_id=? AND language=? AND id=? AND revision=?").bind(Date.now(), payload, ...scope, job.language, job.id, job.revision));
      const results = await db.batch(statements);
      if (!results.at(-1).meta.changes) throw new SyncError("同步狀態已由另一個視窗更新，請繼續同步。", 409);
      return get(job.language);
    },
  };
}
