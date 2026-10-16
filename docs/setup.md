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

### 無料で始める場合: Brevo

2026年10月16日時点では、Brevo Free にトランザクションメールと1日300通の無料枠があり、クレジットカードは不要です。[公式のプラン説明](https://help.brevo.com/hc/en-us/articles/208589409-About-Brevo-s-pricing-plans)

1. [Brevo の無料登録](https://onboarding.brevo.com/account/register)で、本人がアカウント作成、利用規約の確認、メール確認を行います。有料プランや追加機能を購入する必要はありません。
2. Brevo の送信者設定で、自分が確認できるメールアドレスを登録・確認します。独自ドメインがある場合は認証します。Gmail 等のアドレスはドメイン認証できないため、Brevo が送信元のドメインを `brevosend.com` へ置き換える場合があります。[送信元の置き換えの説明](https://help.brevo.com/hc/en-us/articles/16045394674066-Troubleshooting-Domain-authentication)
3. Transactional のメール送信を有効にします。新しいアカウントではサポートへの有効化依頼が必要な場合があります。利用目的は「招待した人だけが閲覧する進捗ダッシュボードのログイン・招待メール」です。[SMTP 有効化の説明](https://help.brevo.com/hc/en-us/articles/115000188150-Troubleshooting-Issues-with-Brevo-SMTP)
4. Settings → SMTP & API → SMTP で Login を確認し、SMTP key を本人が作成します。API key、アカウントのパスワードとは別です。
5. Supabase → Authentication → Emails → SMTP Settings に次を入力します。SMTP key は本人が設定画面の Password 欄に直接入力します。

| Supabase の項目 | 値 |
| --- | --- |
| Sender email | Brevo で確認した送信者のアドレス |
| Sender name | michi |
| Host | smtp-relay.brevo.com |
| Port | 587 |
| Username | Brevo の SMTP 画面に表示される Login |
| Password | Brevo の SMTP key（チャットや GitHub には貼らない） |

[Brevo SMTP の公式設定手順](https://help.brevo.com/hc/en-us/articles/7924908994450-Send-transactional-emails-using-Brevo-SMTP)

保存後、オーナーがログインリンクを受け取れることと、実際に招待した閲覧者がリンクから入れることを確認します。アカウントの有効化や送信者の確認が未完了の間は、メール接続が完了したとは扱いません。

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
