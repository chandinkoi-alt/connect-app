const { client } = require('../db');

// 全テーブルをバックアップ用にダンプする。テーブル一覧はハードコードせず
// sqlite_masterから動的に取得する（新しいテーブルが増えても追随できるように
// するため）。usersのpasswordHashだけは、バックアップファイルが外部に漏れた
// 場合の被害を最小化するため含めない（復元時は各自パスワード再設定が必要）。
async function buildBackupPayload() {
  const tablesRs = await client.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
  );
  const tables = {};
  for (const { name } of tablesRs.rows) {
    const rs = await client.execute(`SELECT * FROM ${name}`);
    tables[name] = rs.rows.map((row) => {
      const plain = { ...row };
      if (name === 'users') delete plain.passwordHash;
      return plain;
    });
  }
  return { exportedAt: new Date().toISOString(), tables };
}

function backupFilename() {
  return `connect-backup-${new Date().toISOString().slice(0, 10)}.json`;
}

module.exports = { buildBackupPayload, backupFilename };
