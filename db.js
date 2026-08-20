import { DatabaseSync } from 'node:sqlite';
import postgres from 'postgres';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PG_URL = process.env.DATABASE_URL;

let sqlite = null;
let sql = null;
if (PG_URL) {
  sql = postgres(PG_URL, {
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
    transform: { undefined: null }
  });
} else {
  sqlite = new DatabaseSync(path.join(__dirname, 'data.db'));
}

function convert(q) {
  let i = 0;
  return q.replace(/\?/g, () => `$${++i}`);
}

export const db = {
  async exec(statements) {
    if (sql) {
      for (const s of statements) await sql.unsafe(s);
    } else {
      sqlite.exec(statements.join(';\n'));
    }
  },
  prepare(q) {
    return {
      async get(...params) {
        if (sql) {
          const rows = await sql.unsafe(convert(q), params);
          return rows[0] ?? null;
        }
        return sqlite.prepare(q).get(...params) ?? null;
      },
      async all(...params) {
        if (sql) return sql.unsafe(convert(q), params);
        return sqlite.prepare(q).all(...params);
      },
      async run(...params) {
        if (sql) {
          await sql.unsafe(convert(q), params);
          return { changes: 1 };
        }
        return sqlite.prepare(q).run(...params);
      }
    };
  }
};