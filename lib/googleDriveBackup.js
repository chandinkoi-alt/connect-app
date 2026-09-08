// サービスアカウントを使い、バックアップデータをGoogle Driveへ直接アップロードする。
// Claude等の外部スケジューラは「アップロードを実行させる」トリガーを叩くだけで、
// 実データ（数百KB〜のJSON）はサーバー内で完結して転送されるため、外部の
// コンテキストサイズやファイル読み込み上限に影響されない。
const { google } = require('googleapis');
const { Readable } = require('stream');
const { buildBackupPayload, backupFilename } = require('./backupData');

function getDriveClient() {
  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!keyJson) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY が設定されていません。');
  const credentials = JSON.parse(keyJson);
  const auth = new google.auth.GoogleAuth({
    credentials,
    // drive.file スコープ：このアプリ（サービスアカウント）が自分で作成したファイルのみ
    // 操作できる、最小権限のスコープ。ユーザーの他のDriveファイルにはアクセスできない。
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  });
  return google.drive({ version: 'v3', auth });
}

async function uploadBackupToDrive() {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!folderId) throw new Error('GOOGLE_DRIVE_FOLDER_ID が設定されていません。');

  const payload = await buildBackupPayload();
  const drive = getDriveClient();
  const fileName = backupFilename();

  const res = await drive.files.create({
    requestBody: { name: fileName, parents: [folderId] },
    media: { mimeType: 'application/json', body: Readable.from(JSON.stringify(payload, null, 2)) },
    fields: 'id, name, webViewLink',
  });
  return res.data;
}

module.exports = { uploadBackupToDrive };
