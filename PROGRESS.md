# PROGRESS

## 完了したフェーズ
- [x] フェーズ1 土台：Vite + React + TS、HashRouter、設定画面（接続テスト）、GitHub API クライアント（Trees / Blobs / Contents / Git Data）、Pages デプロイ用ワークフロー
- [x] フェーズ2 データ層：frontmatter パーサ、Wiki リンクパーサ（コード・数式内を無視）、リンク解決、インデックス生成（被リンク）、リネーム書き換え、IndexedDB キャッシュ、差分同期（Vault ストア）
- [x] フェーズ3 表示：markdown-it＋KaTeX、callout（折りたたみ・ラベル・色）、Wiki リンク（未作成リンク）、見出し・ブロックのアンカーとハイライト、被リンク一覧
- [x] フェーズ4 トップと検索：タグツリー（階層・未分類）、ステータスのバッジと絞り込み、検索（タイトル→別名→本文、抜粋、新規作成、/ と Ctrl+K）
- [x] フェーズ5 編集：CodeMirror、PC の分割表示とスマホのタブ、補助ツールバー、[[ 補完（別名は [[タイトル|別名]]）、frontmatter フォーム、下書き（IndexedDB）、保存・競合の 3 択、新規作成、削除、リネーム（Git Data API で 1 コミット）、記事画面でのステータス切替
- [x] フェーズ6 プレビュー：PC は 300ms ホバー、スマホは 500ms 長押し（iOS のリンクメニュー抑止）、summary→最初の定義→最初の段落、見出し・ブロックの部分プレビュー、未作成リンク（作成ボタン）、最大 3 段の積み重ね、「記事を開く」
- [x] フェーズ7 画像：ペースト・ドラッグ＆ドロップ・ファイル選択、長辺 1600px への縮小、500KB 超の PNG は WebP、attachments/YYYYMMDD-HHmmss-xxxx.ext へ保存、Blobs API＋Blob URL で表示、IndexedDB キャッシュ
- [x] フェーズ8 PWA と仕上げ：manifest・アイコン、Service Worker（アプリ本体と KaTeX フォントをプリキャッシュ）、オフライン起動、セーフエリア、同期状態の表示、エディタの遅延読み込み、IndexedDB が使えない場合の扱い

## 次にやること（開発者本人の操作が必要）
1. GitHub に非公開リポジトリ `math-notes` を作る（README だけ入れて初期化しておくとよい）。
2. fine-grained PAT を作る（対象は math-notes のみ、Contents: Read and write）。
3. `git push -u origin main` で math-dict を push し、リポジトリの Settings → Pages → Source を「GitHub Actions」にする。
4. https://<owner>.github.io/math-dict/ を開いて設定画面で接続テストし、実機で動作確認する。

## 既知の問題
- 実際の GitHub API・実機（iPhone Safari）での動作確認はまだ（開発者本人のトークンと端末が必要）。単体テストとビルドのみ確認済み。
- ブラウザでの画面操作の自動テストはない（Vitest の単体テストはパーサ・リンク解決・インデックス・リネーム・検索・プレビュー抽出・画像の判定・API クライアントが対象）。
- 空のリポジトリでは記事の新規作成はできるが、リネームは最初のコミットができてからでないとできない（Git Data API が空リポジトリで使えないため）。
- 記事の保存は Contents API の PUT なので、記事ごとに 1 コミットになる。画像のアップロードも 1 枚 1 コミット。
- Trees API の結果が切り詰められる（truncated）ほど巨大なリポジトリには対応していない（1000 記事程度なら問題ない）。
- 編集中のプレビューは本文を変えるたびに描画し直すため、画像が多い記事では一瞬ちらつくことがある。
- iOS の「ホーム画面に追加」した PWA は Safari と別の保存領域を使うため、設定（トークン）とキャッシュはホーム画面版で改めて入力・同期が必要。
- 本体の JS は gzip で約 220KB（KaTeX・markdown-it を含む）、エディタは別チャンクで約 190KB。初回だけ読み込みに時間がかかる。
