# PROGRESS

## 完了したフェーズ
- [x] フェーズ1 土台：Vite + React + TS、HashRouter、設定画面（接続テスト）、GitHub API クライアント（Trees / Blobs / Contents / Git Data）、Pages デプロイ用ワークフロー
- [x] フェーズ2 データ層：frontmatter パーサ、Wiki リンクパーサ（コード・数式内を無視）、リンク解決、インデックス生成（被リンク）、リネーム書き換え、IndexedDB キャッシュ、差分同期（Vault ストア）

- [x] フェーズ3 表示：markdown-it＋KaTeX、callout（折りたたみ・ラベル・色）、Wiki リンク（未作成リンク）、見出し・ブロックのアンカーとハイライト、被リンク一覧

## 次にやること
- フェーズ4 トップと検索

## 既知の問題
- まだ実際の GitHub への接続確認はしていない（開発者本人のトークンが必要）
