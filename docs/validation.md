# 初版の確認記録

確認日: 2026年10月16日（日本時間）

## 完了した項目

- GitHub `osakana812/michi-dashboard` にソースを保存。
- GitHub Pages の Source を GitHub Actions に設定。
- Supabase 接続先 URL とブラウザー向け publishable key を Repository Variables に登録。
- GitHub Actions で型チェック、9件のテスト、本番ビルド、Pages へのデプロイが成功。
- 公開 URL と作例ページをブラウザーで確認。公式掲載の4点の画像が読み込まれることを確認。
- サンプルでタスクの追加と検索、メールログインの入力画面、390px 幅の表示とメニュー移動を確認。
- Supabase にマイグレーションを適用し、オーナーを設定、招待関数をデプロイ。
- Auth の Site URL と Redirect URLs を設定。自己登録と匿名ログインを無効、メール確認を有効に設定。
- 実 Supabase に対し、匿名での workspaces / app_settings / read_workspace / invite-viewer がすべて401となることを確認。
- オーナーの初回招待が Auth に登録され、メール確認待ちになることを確認。
- 利用者から初回ログイン完了の連絡を受け、Auth のメール確認済み・サインイン済み状態を確認。
- 確認済みオーナーに対して、空の「マイワークスペース」を管理者設定で初期作成（revision 1、案件・タスクともに0件）。

[初回の公開ワークフロー](https://github.com/osakana812/michi-dashboard/actions/runs/38904695333)

## 継続して確認する項目

ログイン済みブラウザーからの実データの保存、Brevo Free の登録・送信者確認・SMTP 接続、外部閲覧者の招待と閲覧、ブラウザー二台での Realtime 更新は実環境での確認が必要です。これらを完了するまでは、実際の外部招待・保存・更新配信の全経路を確認したとは扱いません。

自動テストは隔離した PGlite の Postgres に対する権限・競合・入力検証です。本番データベースに検証用の案件や閲覧者を追加していません。現在の実環境の利用状況は設定画面とアプリで確認してください。
