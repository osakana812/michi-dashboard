# セットアップと日々の使い方

## GitHub Pages

1. Settings → Secrets and variables → Actions → Variables に `VITE_SUPABASE_URL` と `VITE_SUPABASE_PUBLISHABLE_KEY` を登録します。publishable key はブラウザー向けの公開キーです。secret / service_role key を登録しないでください。
2. Settings → Pages の Source を **GitHub Actions** にします。
3. `main` へプッシュします。`Deploy dashboard` が検証・ビルド・公開を行います。失敗したビルドは公開されません。
4. deploy ジョブに表示された URL を開きます。ベースパスは configure-pages の出力から設定します。

Variables が未設定の場合は、接続していないアプリを誤って公開しないようジョブを失敗させます。プルリクエストでは公開を行わず、チェックとビルドだけ実行します。

## Supabase

1. 新しいプロジェクトで `supabase/migrations/202610160001_workspace.sql` を適用します。
2. 管理者の SQL Editor からオーナーのメールアドレスを登録します。メールアドレスを公開リポジトリへ書かないでください。

```sql
insert into public.app_settings (id, owner_email)
values (true, lower('YOUR_OWNER_EMAIL'))
on conflict (id) do nothing;
```

3. `invite-viewer` をデプロイします。`verify_jwt` は false ですが、関数内で `auth.getUser` とオーナー確認を必ず行います。
4. 公開先が変わる場合は、関数の `APP_URL` を実際の URL に設定します。デフォルトはこのリポジトリの Pages URL です。
5. Authentication → URL Configuration の Site URL と Redirect URLs に公開 URL（末尾 `/` を含む）を設定します。ローカルでメールログインを試す場合だけ `http://127.0.0.1:5173/` も追加します。
6. Authentication → Sign In / Providers の **Allow new users to sign up** をオフにします。Email provider は有効のまま、招待によるアカウント作成だけを利用します。
7. メール送信設定を行い、Authentication → Users → Invite user からオーナーを初回招待します。

## メール送信

[Supabase 標準 SMTP](https://supabase.com/docs/guides/auth/auth-smtp) は組織のチームメンバー宛てだけ送信でき、送信回数にも制限があります。外部の閲覧者を招待して使うには custom SMTP が必要です。アプリの閲覧者を Supabase 組織のメンバーに追加して回避しないでください。

メールサービスで送信元のメールアドレスまたはドメインを認証し、Authentication → Emails → SMTP Settings に送信元、ホスト、ポート、ユーザー名、SMTP 用資格情報を設定します。資格情報はサービスの画面へ直接入力し、チャットや公開ファイルへ貼らないでください。有料プランや独自ドメインを使う場合は契約前に料金を確認します。

SMTP が未設定でもサンプルを試せますが、外部宛ての招待メールの動作は完了していません。メール送信に失敗した場合は、アプリにその旨を表示します。権限の登録後に送信だけ失敗した場合は、送信設定を直して同じアドレスを再招待できます。

## 最初の利用

1. オーナー宛ての招待メールを開き、公開 URL に戻ります。
2. 「自分のワークスペースを作成」から名前を登録します。通常は空で始めます。サンプルの取り込みは任意です。
3. 最初のプロジェクトを追加し、タスクと予定工数を登録します。
4. 日々の工数を記録し、週末に成果・課題・次の行動を進捗レポートにまとめます。
5. 「共有」から閲覧者をメールで招待します。閲覧者はリンクから入り、ワークスペース全体を閲覧できます。パスワードや GitHub・ChatGPT アカウントは不要です。

## 実環境での確認

- オーナーが実ワークスペースを作成・更新できる。
- 閲覧者が招待メールでログインでき、編集・招待操作を利用できない。
- オーナーの保存内容が、別の閲覧画面に反映される。
- 未招待者・未ログインの API アクセスで実データを取得できない。
- 権限を外した後、閲覧画面の実データが再照会で消える。

## バックアップと変更

「データを書き出す」で JSON を保存できます。書き出した JSON・CSV・Markdown は実データを含むため、公開リポジトリに追加しないでください。このバージョンには JSON の再取り込み画面はありません。復元は管理者が内容を検証してから行います。

日々の入力はブラウザーで行います。画面や機能を改修する場合だけソースコードを変更し、GitHub にコミットします。通常のデプロイでは保存済みデータは変わりません。DB の仕様変更には別途マイグレーションを用意します。
