const { Store } = require('express-session');
const { client } = require('../db');

const DAY_MS = 24 * 60 * 60 * 1000;

// express-sessionのデフォルトMemoryStoreはプロセス再起動で全ログインが
// 消えてしまう（Renderは再デプロイ・スリープ復帰のたびに再起動するため、
// 実運用では頻繁にログアウトされてしまう）。既存のTurso/libSQL接続に
// そのままセッションも保存することで、再起動してもログイン状態を保つ。
class LibsqlSessionStore extends Store {
  get(sid, cb) {
    client
      .execute({ sql: 'SELECT sess, expiresAt FROM sessions WHERE sid = ?', args: [sid] })
      .then((rs) => {
        if (!rs.rows.length) return cb(null, null);
        const row = rs.rows[0];
        if (Number(row.expiresAt) < Date.now()) {
          return this.destroy(sid, () => cb(null, null));
        }
        cb(null, JSON.parse(row.sess));
      })
      .catch((err) => cb(err));
  }

  set(sid, session, cb) {
    const maxAge = session.cookie && typeof session.cookie.maxAge === 'number' ? session.cookie.maxAge : DAY_MS;
    const expiresAt = Date.now() + maxAge;
    client
      .execute({
        sql: `INSERT INTO sessions (sid, sess, expiresAt) VALUES (?, ?, ?)
              ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expiresAt = excluded.expiresAt`,
        args: [sid, JSON.stringify(session), expiresAt],
      })
      .then(() => cb && cb(null))
      .catch((err) => cb && cb(err));
  }

  destroy(sid, cb) {
    client
      .execute({ sql: 'DELETE FROM sessions WHERE sid = ?', args: [sid] })
      .then(() => cb && cb(null))
      .catch((err) => cb && cb(err));
  }

  touch(sid, session, cb) {
    this.set(sid, session, cb);
  }
}

async function pruneExpiredSessions() {
  await client.execute({ sql: 'DELETE FROM sessions WHERE expiresAt < ?', args: [Date.now()] });
}

module.exports = { LibsqlSessionStore, pruneExpiredSessions };
