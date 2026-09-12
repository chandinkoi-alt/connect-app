# Connect（コネクト協同組合）業務管理アプリ

技能実習生・特定技能外国人の受入監理団体向け業務管理システム。受入企業・送出機関・対象者（実習生／特定技能）の管理、認定申請書類・請求書のPDF出力、名簿Excelの取り込み/出力、ダッシュボードでの期限アラートなどをまとめて扱う。

## 技術構成

- **サーバー**: Node.js + Express（`server.js`）
- **DB**: Turso（libSQL）。`TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` 未設定時はローカルファイル `data.sqlite3` にフォールバック（開発用。Render等の再起動で消える）
- **フロントエンド**: 素のHTML/CSS/JS（ビルドツール無し）。`public/` 配下を Express の静的ファイルとして配信
- **PDF生成**: `pdfkit`（請求書）、および LibreOffice headless + `python-docx`（認定申請書：実物Word様式に直接書き込んでPDF変換。Docker環境が必要）
- **Excel入出力**: `exceljs`
- **認証**: `express-session`（セッションはDBの`sessions`テーブルに永続化。詳細は `lib/sessionStore.js`）+ `bcryptjs`

## ディレクトリ構成

```
server.js               エントリーポイント。ミドルウェア・ルーティングの登録
db.js                    DBスキーマ定義・マイグレーション・各テーブルのリポジトリ（CRUD）
routes/                  APIルート（1機能=1ファイル、/api/<name> にマウント）
  auth.js                  ログイン・初回セットアップ・スタッフアカウント追加
  sendingOrgs.js            送出機関
  hostCompanies.js          受入企業（登録・許認可・役員情報を含む）
  candidates.js              候補者（採用活動）
  workers.js                対象者（実習生・特定技能）、名簿Excel入出力
  applicationCases.js        認定申請案件、PDF出力
  visits.js                  監査・面談スケジュール
  dashboard.js                ダッシュボード集計・期限アラートタスク
  invoices.js                 請求書
  billing.js                  請求単価設定
  adminImport.js               Excel一括取込・バックアップ
lib/                     ルートから使う共通ロジック
  excelImport.js / excelBackfill.js / importWorkerEntry.js / xlsxPhoneticFix.js
                            既存の「監理外国人名簿」Excelを取り込むワーカースレッド処理
  invoicePdf.js              請求書PDF生成（pdfkit）
  nintei-form/                認定申請書（実物様式）PDF生成
    generatePdf.js             Node側：python-docxスクリプトの呼び出し・LibreOffice変換
    fill_form.py                Python側：Word様式への実データ書き込み
  dates.js                   期限計算・緊急度判定の共通ロジック
  sessionStore.js             ログインセッションをDBに永続化するカスタムStore
  backupData.js / googleDriveBackup.js
                            全データのバックアップ生成・Google Driveへの自動アップロード
  checklists.js / healthChecks.js / visitScheduler.js / companyRegistrationExpiry.js
  certificationSettings.js / invoiceSettings.js
                            各種マスタデータ・定数
public/                  フロントエンド（静的配信）
  index.html                メイン画面（タブ切り替え式）
  login.html                 ログイン画面
  admin-import.html           Excel一括取込・バックアップ用の管理画面
  invoice-print.html          請求書印刷プレビュー
  js/
    main.js / api.js / modal.js / confirm.js   共通処理
    tabs/                     画面のタブごとのロジック（1タブ=1ファイル）
assets/forms/            認定申請書の実物Word様式テンプレート
fonts/                   請求書PDFで使う日本語フォント（IPAフォント）
scripts/importExcel.js   ローカル/一回限りのテスト用CLI（本番では未使用）
render.yaml              Renderへのデプロイ設定（Docker、必要な環境変数の一覧）
Dockerfile               本番デプロイ用（LibreOffice + Python同梱）
```

## ローカルでの起動

```bash
npm install
node server.js            # http://localhost:3000
```

`TURSO_DATABASE_URL` を設定しない場合、リポジトリ直下に `data.sqlite3` が自動生成される（開発用）。初回アクセス時にセットアップ画面が出るので、管理者アカウントを作成する。

## 環境変数

`render.yaml` にも一覧・説明あり。本番（Render）では全てRenderダッシュボードの Environment タブで手動設定する（`sync: false` のものは平文でリポジトリに置かない）。

| 変数名 | 必須 | 説明 |
|---|---|---|
| `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` | 本番は必須 | 永続DB（Turso）への接続情報。未設定だとローカルファイルDBになり、再起動でデータが消える |
| `SESSION_SECRET` | 推奨 | ログインCookieの署名鍵。未設定でも動くが、再デプロイのたびに全員ログアウトされる |
| `BACKUP_TOKEN` | 自動バックアップを使うなら必須 | `/api/admin/import/backup-auto` 等の認証用トークン |
| `GOOGLE_SERVICE_ACCOUNT_KEY` / `GOOGLE_DRIVE_FOLDER_ID` | Google Drive自動バックアップを使うなら必須 | サービスアカウントJSON鍵と保存先フォルダID |
| `NODE_ENV` | 本番は `production` | Cookieの `secure` 属性等の切り替えに使用 |
| `MAINTENANCE_MODE` | 任意 | `true` にすると、`/health` 以外の全アクセスに「メンテナンス中」ページを表示（ログイン中の人も含めて全員）。詳細は下記「メンテナンスモード」参照 |
| `MAINTENANCE_BYPASS_TOKEN` | メンテナンスモードを使うなら推奨 | メンテナンス中でも管理者だけがアクセスできるようにする秘密トークン |

## メンテナンスモード（一時的にアプリを閉じる）

トラブル対応・大きなデータ入替などで一時的に全員のアクセスを止めたい時に使う。

1. Renderの Environment で `MAINTENANCE_MODE` を `true` に設定（`MAINTENANCE_BYPASS_TOKEN` も未設定なら適当なランダム文字列を設定）→ 自動的に再デプロイされ、以後は誰がアクセスしても「メンテナンス中」ページが表示される（ログイン中の人も含む）
2. 自分だけは使い続けたい場合、`https://<アプリのURL>/?bypass=<MAINTENANCE_BYPASS_TOKENの値>` に一度アクセスする → ブラウザにCookieが保存され、以後は通常通り使える
3. 元に戻すには `MAINTENANCE_MODE` を `false` に変更（または変数自体を削除）

## デプロイ

Render（Docker環境）を想定。`render.yaml` を参照。LibreOffice + Pythonが必要な認定申請書PDF機能があるため、通常のNode buildpackではなく `Dockerfile` でビルドする。

## 主な業務フロー

- **対象者の名簿管理**: `人材一覧` タブで登録・編集。既存の「監理外国人名簿」Excelを丸ごと取り込む場合は `admin-import.html`（管理画面）からアップロード。出力時は同じ列構成のExcelとしてダウンロード可能（`GET /api/workers/export/roster`）。
- **認定申請書類**: `認定申請` タブでデータ入力し、実物のWord様式に基づいたPDFを出力（第1〜7面）。
- **ダッシュボード**: 在留期限・許認可期限・監査予定などを自動集計し、期限が近い/切れている項目を一覧表示。
- **請求書**: `請求書` タブで作成し、PDFで出力・印刷プレビュー可能。
- **バックアップ**: 管理画面から手動ダウンロード、または `BACKUP_TOKEN` を使った自動バックアップ（週次スケジューラ等から叩く想定）で全データをJSON/Google Driveに退避。
