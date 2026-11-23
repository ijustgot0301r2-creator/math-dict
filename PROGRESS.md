# PROGRESS

## 完了したフェーズ
- [x] フェーズ1 土台：Vite + React + TS、HashRouter、設定画面（接続テスト）、GitHub API クライアント（Trees / Blobs / Contents / Git Data）、Pages デプロイ用ワークフロー
- [x] フェーズ2 データ層：frontmatter パーサ、Wiki リンクパーサ（コード・数式内を無視）、リンク解決、インデックス生成（被リンク）、リネーム書き換え、IndexedDB キャッシュ、差分同期（Vault ストア）
- [x] フェーズ3 表示：markdown-it＋KaTeX、callout（折りたたみ・ラベル・色）、Wiki リンク（未作成リンク）、見出し・ブロックのアンカーとハイライト、被リンク一覧
- [x] フェーズ4 トップと検索：タグツリー（階層・未分類）、ステータスのバッジと絞り込み、検索（タイトル→別名→本文、抜粋、新規作成、/ と Ctrl+K）
- [x] フェーズ5 編集：CodeMirror、PC の分割表示とスマホのタブ、補助ツールバー、[[ 補完（別名は [[タイトル|別名]]）、frontmatter フォーム、下書き（IndexedDB）、保存・競合の 3 択、新規作成、削除、リネーム（Git Data API で 1 コミット）、記事画面でのステータス切替
- [x] フェーズ6 プレビュー：PC は 300ms ホバー、スマホは 500ms 長押し（iOS のリンクメニュー抑止）、summary→最初の定義→最初の段落、見出し・ブロックの部分プレビュー、未作成リンク（作成ボタン）、最大 3 段の積み重ね、「記事を開く」
- [x] フェーズ7 画像：ペースト・ドラッグ＆ドロップ・ファイル選択、長辺 1600px への縮小、500KB 超の PNG は WebP、attachments/YYYYMMDD-HHmmss-xxxx.ext へ保存、Blobs API＋Blob URL で表示、IndexedDB キャッシュ

## 次にやること
- フェーズ8 PWA と仕上げ

## 既知の問題
- まだ実際の GitHub への接続確認はしていない（開発者本人のトークンが必要）
