import type { D1Database } from "@cloudflare/workers-types";
import type { Account } from "../types.ts";
import { COURSE_SCHEMA } from "../courses/repository.ts";
export const ACCOUNT_SCHEMA = [
  COURSE_SCHEMA,
  "CREATE TABLE IF NOT EXISTS app_users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, salt TEXT NOT NULL, password_hash TEXT NOT NULL, duolingo_id TEXT, credential TEXT, connection_id TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS app_sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires INTEGER NOT NULL)",
  "CREATE INDEX IF NOT EXISTS app_sessions_expiry ON app_sessions(expires)",
  "CREATE TABLE IF NOT EXISTS auth_attempts (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL)",
];
export function accountRepository(db: D1Database) {
  return {
    init: () => db.batch(ACCOUNT_SCHEMA.map((s) => db.prepare(s))),
    byName: (name: string) => db.prepare("SELECT * FROM app_users WHERE username=?").bind(name).first<Account>(),
    async register(user: Account) {
      return db.prepare("INSERT OR IGNORE INTO app_users(id,username,salt,password_hash,connection_id) VALUES(?,?,?,?,?)").bind(user.id, user.username, user.salt, user.password_hash, user.connection_id).run();
    },
    async session(hash: string, now: number) {
      return db.prepare("SELECT u.* FROM app_users u JOIN app_sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires>?").bind(hash, now).first<Account>();
    },
    async addSession(hash: string, id: string, expires: number) {
      await db.batch([
        db.prepare("DELETE FROM app_sessions WHERE expires<=?").bind(Date.now()),
        db.prepare("INSERT INTO app_sessions(token_hash,user_id,expires) VALUES(?,?,?)").bind(hash,id,expires),
      ]);
    },
    deleteSession: (hash: string) => db.prepare("DELETE FROM app_sessions WHERE token_hash=?").bind(hash).run(),
    async throttle(key: string, maximum: number, now = Date.now()) {
      await db.prepare("DELETE FROM auth_attempts WHERE expires<=?").bind(now).run();
      const row = await db.prepare("INSERT INTO auth_attempts(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count").bind(key, now + 15 * 60 * 1000).first<{count: number}>();
      return row!.count <= maximum;
    },
    connect: (user: Account, duoId: string, encrypted: string) => db.prepare("UPDATE app_users SET duolingo_id=?,credential=? WHERE id=? AND connection_id=? AND (duolingo_id IS NULL OR duolingo_id=?)").bind(duoId, encrypted, user.id, user.connection_id, duoId).run(),
    disconnect: (user: Account, generation: string) => db.prepare("UPDATE app_users SET credential=NULL,connection_id=? WHERE id=? AND connection_id=?").bind(generation, user.id, user.connection_id).run(),
  };
}
