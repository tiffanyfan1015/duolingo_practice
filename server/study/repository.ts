import type { D1Database } from "@cloudflare/workers-types";
import type { StudyCells, StudySnapshot } from "../../shared/study.ts";
export const STUDY_SCHEMA = [
  "CREATE TABLE IF NOT EXISTS user_study_state (user_id TEXT PRIMARY KEY, revision INTEGER NOT NULL, token TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS user_study_chunks (user_id TEXT NOT NULL, part INTEGER NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(user_id,part))",
];
export function studyRepository(db: D1Database,userId: string) {
  return {
    init:()=>db.batch(STUDY_SCHEMA.map(sql=>db.prepare(sql))),
    async read(known=-1): Promise<StudySnapshot> {
      if (known>=0) {
        const row=await db.prepare("SELECT revision FROM user_study_state WHERE user_id=?").bind(userId).first<{revision: number}>();
        if ((row?.revision || 0)===known) return {revision:known,unchanged:true};
      }
      // One statement gives a consistent revision and all chunks, even during a write.
      const {results}=await db.prepare("SELECT s.revision,c.part,c.payload FROM user_study_state s LEFT JOIN user_study_chunks c ON c.user_id=s.user_id WHERE s.user_id=? ORDER BY c.part").bind(userId).all<{revision: number; part: number | null; payload: string | null}>();
      return {revision:results[0]?.revision || 0,cells:Object.assign({},...results.filter(r=>r.payload).map(r=>JSON.parse(r.payload!)))};
    },
    async write(revision: number,cells: StudyCells) {
      const token=crypto.randomUUID(), chunks=[];
      let chunk: StudyCells={},size=0;
      for (const [key,value] of Object.entries(cells)) {
        const item=JSON.stringify({[key]:value});
        if (size+item.length>200000 && size) {chunks.push(JSON.stringify(chunk));chunk={};size=0;}
        chunk[key]=value;size+=item.length;
      }
      if (size) chunks.push(JSON.stringify(chunk));
      // Every mutation is guarded by a fresh commit token inside the same atomic batch.
      const result=await db.batch([
        db.prepare("INSERT OR IGNORE INTO user_study_state(user_id,revision,token) VALUES(?,0,'')").bind(userId),
        db.prepare("UPDATE user_study_state SET revision=revision+1,token=? WHERE user_id=? AND revision=?").bind(token,userId,revision),
        db.prepare("DELETE FROM user_study_chunks WHERE user_id=? AND EXISTS(SELECT 1 FROM user_study_state WHERE user_id=? AND token=?)").bind(userId,userId,token),
        ...chunks.map((payload,part)=>db.prepare("INSERT INTO user_study_chunks(user_id,part,payload) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM user_study_state WHERE user_id=? AND token=?)").bind(userId,part,payload,userId,token)),
      ]);
      return result[1].meta.changes===1;
    },
  };
}
