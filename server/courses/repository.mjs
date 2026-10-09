import { SyncError } from "../sync/duolingo.mjs";
export const COURSE_SCHEMA = "CREATE TABLE IF NOT EXISTS user_course_settings (user_id TEXT NOT NULL, connection_id TEXT NOT NULL, revision INTEGER NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(user_id,connection_id))";
export function courseRepository(db, user) {
  return {
    async get() {
      const row = await db.prepare("SELECT revision,payload FROM user_course_settings WHERE user_id=? AND connection_id=?").bind(user.id,user.connection_id).first();
      return row ? { revision: row.revision, courses: JSON.parse(row.payload) } : null;
    },
    async save(courses, revision) {
      const result = revision === -1
        ? await db.prepare("INSERT OR IGNORE INTO user_course_settings(user_id,connection_id,revision,payload) SELECT ?,?,0,? WHERE EXISTS(SELECT 1 FROM app_users WHERE id=? AND connection_id=?)").bind(user.id,user.connection_id,JSON.stringify(courses),user.id,user.connection_id).run()
        : await db.prepare("UPDATE user_course_settings SET revision=revision+1,payload=? WHERE user_id=? AND connection_id=? AND revision=? AND EXISTS(SELECT 1 FROM app_users WHERE id=? AND connection_id=?)").bind(JSON.stringify(courses),user.id,user.connection_id,revision,user.id,user.connection_id).run();
      if (!result.meta.changes) throw new SyncError("課程設定已變更，請重新整理帳號頁。", 409);
      return { courses, revision: revision + 1 };
    },
  };
}
