# michi — 進捗を、ひとつの場所に。

仕事の案件・タスク・予定・工数・週次報告・メモをまとめる、日本語の進捗共有ダッシュボードです。オーナーが編集し、メールで招待された人が閲覧します。閲覧者に GitHub や ChatGPT のアカウントは必要ありません。

- アプリ: https://osakana812.github.io/michi-dashboard/
- 作例とデザインの比較: https://osakana812.github.io/michi-dashboard/references.html
- 技術・権限設計: [docs/design.md](docs/design.md)
- 初期設定・運用: [docs/setup.md](docs/setup.md)

## 使える画面

概要には、今週の報告、プロジェクトの進捗、次に取り組むタスク、工数のグラフ、更新履歴を配置しています。プロジェクト、タスクのボード、今後の予定、工数の記録、進捗レポート、メモの各画面から詳細を管理できます。

工数は CSV、報告は Markdown、ワークスペース全体は JSON で書き出せます。ログイン前のサンプルはブラウザー内だけで試せます。サンプルの変更は保存されません。実ワークスペースは空の状態から作成でき、サンプルの取り込みは任意です。

## 構成

| 役割 | 技術 |
| --- | --- |
| 画面 | React / TypeScript / Vite / Lucide |
| ソース管理・自動公開 | GitHub / GitHub Actions / GitHub Pages |
| 保存 | Supabase Postgres |
| ログイン | Supabase Auth のメールリンク |
| 閲覧者の招待 | Supabase Edge Function |
| 更新通知 | Supabase Realtime Postgres Changes |

GitHub Pages は画面の配信を担当します。実際の案件やメモをリポジトリに保存することはありません。Supabase 側でログインと権限を確認してから実データを返します。画面のコードとサンプルデータは公開されています。

保存後は Realtime で閲覧中の画面へ変更を通知します。再接続、画面への復帰、30 秒ごとの再照会でも状態を確認します。同時に別の画面で編集した場合は、リビジョンの照合により上書きを拒否します。

## ローカルで動かす

Node.js 24 を推奨します。

```sh
npm ci
cp .env.example .env.local
npm run dev
```

接続して使う場合は `.env.local` に Supabase URL と **publishable key** を設定します。未設定でもサンプル画面を利用できます。`service_role` や secret key は画面、GitHub の公開ファイル、`VITE_` 変数に入れないでください。

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
VITE_BASE_PATH=/
```

```sh
npm run check
npm test
npm run build
```

テストでは PGlite の実際の Postgres 権限と SQL を使い、オーナー限定の初期作成、未招待者の拒否、閲覧者の書き込み拒否、編集の競合、データ検証、閲覧権限の解除を確認します。メールの到着やブラウザー間の実通信は、これらの自動テストとは別に実環境で確認する必要があります。

## 公開と招待の準備

GitHub の Repository Variables に `VITE_SUPABASE_URL` と `VITE_SUPABASE_PUBLISHABLE_KEY` を登録し、Pages の Source を **GitHub Actions** に設定します。`main` への更新でチェックとビルドを実行し、成功した成果物を公開します。

Supabase には SQL マイグレーションと `invite-viewer` 関数を配置します。Auth の URL、オーナーのメールアドレス、招待制の設定、メール送信設定も必要です。具体的な手順は [セットアップガイド](docs/setup.md) にまとめています。

**外部の閲覧者へのメール送信には custom SMTP が必要です。** Supabase 標準の送信機能は、組織のチームメンバー宛てに限定され、送信回数にも制限があります。閲覧者を Supabase の組織メンバーに追加して回避しないでください。アプリの閲覧者は、アプリ内の「共有」から招待します。[Supabase の公式説明](https://supabase.com/docs/guides/auth/auth-smtp)

## 運用上の範囲

一人のオーナーと複数の閲覧者向けです。招待した閲覧者はメモを含むワークスペース全体を閲覧できます。案件別の閲覧制限、共同編集、添付ファイル、請求・原価管理、GitHub Issues との同期は含みません。

データは一つの JSON 文書として保存します。小規模な個人・チームの進捗共有を想定し、文書容量と件数には上限を設けています。人数や記録が増える場合は、案件・タスクを個別テーブルへ移す設計に拡張できます。
