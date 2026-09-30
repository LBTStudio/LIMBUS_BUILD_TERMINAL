# AGENTS.md — LIMBUS BUILD TERMINAL エージェント行動規範

## 常時適用ルール（義務・スキル呼び出し不要の絶対規則）

### 1. 証拠なき完了宣言の禁止
コードを変更したら必ずテストを実行し、出力を確認してから「完了」と言う。
「should work」「たぶん動く」は虚偽。コマンドを実行し、出力を読み、それから主張する。

### 2. データ > 100件 は手動で読まない
比較・検証・差分確認が必要なデータが100行を超える場合、目視で読む前にスクリプトを書く。
スクリプトは正確で再現可能でトークン効率が良い。

### 3. ルート原因の特定前に修正しない
バグに遭遇したら、修正を提案する前にPhase 1（根因調査）を完了する。
3回以上修正が失敗したら、アーキテクチャを疑う。

### 4. コミット前に必ず全テスト実行
`node --test tests/*.test.mjs` を実行し、fail: 0 を確認してからコミットする。

---

## ワークフロー・パイプライン

### 実装修正時
```
1. [systematic-debugging] 根因特定
2. [test-driven-development] Red → Green → Refactor
3. [verifying-before-completion] 全テスト実行 → 出力確認
4. [requesting-code-review] 必要に応じてサブエージェントにレビュー
5. コミット → push
```

### 計画実行時
```
1. [executing-plans] 計画を批判的にレビュー → 2-3タスクずつバッチ実行
2. [persistent-progress] マイルストーンごとに進捗をファイルに保存
3. [verifying-before-completion] 各チェックポイントでテスト実行
4. 次のバッチへ
```

### UI作業時
```
1. [better-ui] ポリッシュ値の適用（border-radius、shadow、motion値）
2. [better-accessibility] WCAG確認（focus、keyboard、ARIA、label）
3. [interface-review] 差分レビュー（Regression検出、blast radius）
```

### データ検証時
```
1. [think-in-code] スクリプトを書いて自動比較
2. 結果を読む → 問題があれば[systematic-debugging]へ
3. 検証を完了 → [verifying-before-completion]で最終確認
```

### 並行作業時
```
1. [dispatching-parallel-agents] 独立タスクを識別
2. 各エージェントに focused prompt（500行以内、明確な境界）
3. 結果レビュー → コンフリクト確認 → 全テスト実行
```

---

## コンテキスト効率規則

| 規則 | 理由 |
|---|---|
| ファイル全体を読む前に `grep` で該当行を特定 | 2000行読む → 50行読む |
| 同じファイルを再読しない（変更がない限り） | コンテキスト節約 |
| サブエージェントには共通の文脈を `AGENTS.md` 参照で渡す | prompt重複の排除 |
| テスト出力は pass/fail 数だけ確認する | 260行の詳細出力を読まない |
| 一時スクリプト（tmp_*.js）は使用後削除 | リポジトリ清潔性 |

---

## コミット規範

```
形式: <type>(<scope>): <subject>

type: fix | feat | perf | arch | maint | docs | test
subject: 英語で簡潔に、50文字以内

body: 何を・なぜ・影響範囲（日本語可）
      テスト件数を含める（"260 tests pass"）
```

---

## プロジェクト固有知識

- **静的Webアプリ**: build stepなし、GitHub Pages配信、React手動読込
- **テスト**: `node --test tests/*.test.mjs`（unified-provenance除く）
- **DB**: `data/db.json` 474KB（ミニファイ済み）、`data/items.json`
- **キャッシュ**: `?v=65r69` パラメータで全JS/DB管理
- **共有**: share-link.js → Telegraph/Rentry → share.html viewer
- **PDF原典**: `sources/エラッタ最新版/` + `data/provenance/*.txt`
- **監査ツール**: `tools/provenance/audit-*.mjs`

---

## スキル参照（.opencode/skills/）

| スキル名 | トリガー | 義務/任意 |
|---|---|---|
| verifying-before-completion | コード変更後 | **義務** |
| think-in-code | データ > 100件 | **義務** |
| systematic-debugging | バグ・テスト失敗時 | **義務** |
| test-driven-development | 機能実装時 | 推奨 |
| executing-plans | 計画実行時 | 推奨 |
| persistent-progress | マルチセッション時 | 推奨 |
| requesting-code-review | 機能完了後 | 推奨 |
| dispatching-parallel-agents | 3+独立タスク時 | 推奨 |
| better-ui | UI変更時 | 推奨 |
| better-accessibility | UI変更時 | 推奨 |
| interface-review | 差分レビュー時 | 任意 |