# ツール機能レビュー 2026-10-03

92ファイル（うちスクリプト84本）を4領域に分割し、`requesting-code-review` + `think-in-code` で
並行レビューした。重要項目は自分で実測して再検証済み。

判定凡例：**C**=Critical / **I**=Important / **M**=Minor / **要確認**=環境依存で未確定

---

## 1. db.json を無条件に書き換えるツール（3本）

9本のmutatorのうち6本は `--write` / `--apply` ゲートを持つ。**残り3本がゲート無し**。
自分で `writeFileSync` 呼び出し箇所を確認した。

| ツール | 書き換え | ゲート |
|---|---|---|
| `tools/provenance/apply_affiliation.mjs:76` | `writeFileSync(\`${ROOT}/data/db.json\`, ...)` | **無し** |
| `tools/repair-end-calendar.mjs:11` | `writeFileSync(path, ...)` | **無し** |
| `tools/restore-end-calendar-pdf.mjs:10` | `writeFileSync(path, ...)` | **無し** |

3本とも `process.argv` を一切参照しない。実行した瞬間に本番DBを書き換える。
`apply_affiliation.mjs` は `JSON.stringify(db, null, 1)` で**1スペースインデント**に
整形して書き出すため、実行すると `data/db.json` 全体が再整形される（788KB、ミニファイ
状態を破壊）。最も危険。

**bench**: `repair-end-calendar.mjs` と `restore-end-calendar-pdf.mjs` は現在
`JSON.stringify(JSON.parse(db.json))` とバイト同一で no-op OMMになる。ただし
ungated なため、将来的にデータが変われば無言で破壊する。

---

## 2. `sync-asset-versions.mjs` の行末依存（実測・最重要）

**今日自分が `.gitattributes` を追加した結果が悪化したバグ。**

実測（`tmp/eol-check.mjs`、30アセット参照）:

```
LF/CRLF でハッシュが同じ    :  4 件
LF/CRLF でハッシュが変わる  : 26 件
コミット済み ?v= が CRLF 実ファイルと一致 : 26 件
コミット済み ?v= が LF 版とだけ一致      :  0 件
```

`tools/sync-asset-versions.mjs:70` は `readFileSync(absPath)` の生バイトを
sha256 している。行末を正規化していない。

**失敗シナリオ**: `core.autocrlf=true` はこのマシン固有のローカル設定で、
リポジトリには無い。Linux/macOS BANの clone は LF でチェックアウトされ、
`node --test tests/asset-version-sync.test.mjs` が**26件の偽の不一致で失敗**する。
参加者がツールを走らせると ?v= 全置換が LF 版になり、Windows 側が壊れる。
CSS/JS を1行編集するたび全テーブルが ping-pong する。

**追加した `.gitattributes` が無効な理由**: `data/db.json` に pinning したが、
同ファイルはミニファイ済みで改行0バイト（CRLF 0 / LF 0）。**no-op**。
行末が実際に効く26ファイル（`.css`/`.js`）は未指定。

**修正方針の選択が必要**:
- (a) `.gitattributes` に `*.css`/`*.js` を追加 → LF checkout が CRLF 化。Webリポジトリでは非標準
- (b) ハッシュ入力を LF 正規化してから sha256 → **機械非依存になるので推奨**

(b) を採ると ?v= が26件一度に変わり、`--check` は全環境で green になる。

---

## 3. `?v=` が無い新規参照を検出できない

`sync-asset-versions.mjs:78` の `VERSION_RE` は `?v=` を含む参照しか拾えない。
逆向きスキャン（バージョン無しの参照を探す）が無い。

**再現（サブエージェントが一時ツリーで実証、既存ツリーは未変更）**:
`index.html` に `<script src="js/NewFeature.js"></script>` を無バージョンで追加 →
`--check` は **exit 0**。同じ参照に `?v=00000000` を付けると exit 1 でドリフト検出。

テストも同構造の盲点を持つ。`tests/asset-version-sync.test.mjs` は
`VERSION_RE` の出力をテストケース生成に使うので、構造上バージョン無し参照を
原理的に見えない。

**深刻度は現行で緩和される**: ライブは `Cache-Control: max-age=600`（`immutable`
無し）。10分で自己修復する。`?v=` は現在「監査可能性」をproviding Vk 「鮮度」ではない。

---

## 4. 存在しない資産への参照は `--check` が exit 0

`sync-asset-versions.mjs:96-99` は `existsSync` 失敗時に `whole`（無変更）を返す。
`:101` の `if (!newVersion) return whole;` も同じく無変更を返す。
→ 行130の `text !== before` が false になり `:165` の `process.exit(1)` に到達しない。

**実証**: `assets/items.css` を削除（`index.html` の `?v=` 参照は残置）→
`--check` は **exit 0**、標準エラーにだけ `! 参照先が存在しない` が出る。
**警告は二重発行される**（142-147行の2パスで dedupe なし）。

診断は存在するが**助言のみ**。終了コードに影響しない。
CI が終了コードだけ見れば green、ページは 404。
`tests/asset-version-sync.test.mjs` は `existsSync` を assert するので node --test は捕捉。

---

## 5. `tools/ui/` の36/43 に失敗機構が無い

**これが最大の問題**。`verify-*.mjs` が「検証して通過」 하지만、
失敗時に非ゼロ終了しない。偽の安心感を作る。

自分の `verify-roster-tab-sort.mjs` を実測確認:
```
L56: console.log(`\n判定: ${ok ? "OK..." : "NG"}`);
L58: await page.screenshot({ ... });
```
**`NG` を print して終了コード0**。`process.exit` は L42 の「要素見つからない」ケースのみ。

分類:
- **ASSERT（実際に gate する）4本**: `axe-scan.mjs`, `audit-reachability.mjs`, `dead-css-verify.mjs`, `measure-ux.mjs`
- **DUMP（常に print するだけ）36本**: `verify-roster-tab-sort.mjs`, `verify-disclaimer.mjs`, `verify-ego-expanded.mjs`, `verify-corplogo.mjs`, `verify-source-filter.mjs`, `probe-*` 6本, `measure-*` 4本, `perf-*` 2本 ほか

**この規約が文書化されていない**。README も `capture.mjs` は
`exit 1` して「失敗時スクリーンショットを撮って終了する」と書いているが、
`verify-*.mjs` は同じ이지ず全部 exit 0。

---

## 6. `dead-css-verify.mjs:45` の stateful ゲートが 0 件

`remove-dead-css.mjs` を gate する supposed な stateful フィルタが、
**今回のデータでは 0 件しか hit しない**。`roster-tags`, `stacked *`, `.is-*`
のみを対象にし、他に state selector は存在しない。

**後段が ~580 ブロックを pass させる**。`:43` の `/([^{}]*)\{([^{}]*)\}/g` は
**ワイルドカードを含むセレクタも娴く掉落**。`:46` の sel 単位のチェックは
**gate に無関係**。短いルール（`p{...}` 等）は class 分節で regex が壊れる。

なお `:71` の `writeFileSync` は **`--dry-run` がある**。そして
**class 始まりでない全セレクタを削除する**。

過去 2 回の検証で 151 セレクタ削除 podidoいたのは `stateful` 判定が
その Selector を捕まえたからだ（その後 class を持つ形になり上位で fall-through した）。
今は capture し直しが必要。

---

## 7. `capture.mjs` / `axe-scan.mjs` はURL引数を無視

実測:
```
capture.mjs L15: const url = process.argv[3] || BASE_URL;
capture.mjs L19: const { context, page, errors } = await openApp(browser, { bypassCache: true });   ← url 未渡
capture.mjs L21: console.log(`target: ${url}`);                                                   ← print するだけ
axe-scan.mjs L18: const url = process.argv[2] || BASE_URL;
axe-scan.mjs L23: const { context, page, errors } = await openApp(browser);                        ← url 未渡
axe-scan.mjs L25: console.log(`target: ${url}\n`);
```
指定したURLに**一切開かない**。print だけが実際の対象と違う。

---

## 8. `ogp-gateway/worker.mjs`（本番デプロイ済み）

### I4: OGP テキストが query param で攻撃者制御され、7日キャッシュ
`:177-197` の `previewFromQuery` が `lbt_n` / `lbt_hp` / `lbt_s` / `lbt_sync` /
`lbt_max` から name/summary/sanity/speed/max-power を**全て構築**。
`:279-280` のゲートは `sources.length >= 1` のみ。`?s=r:aaa` で通過。

`GET /s?s=r:aaa&lbt_n=<攻撃者テキスト>` → `<title>`/`og:title`/`og:description`/
`twitter:card` が攻撃者テキストになる（`og:image` は本物のカード）。
`CACHE_CONTROL` `max-age=604800`。subrequest 0・CPUほぼ0で無限に生成できる。
**XSS は不可**（`htmlEscape` と `encodeURIComponent` が全フィールドを通す）。
**content spoofing** が_bounds。

### I5: module-scope キャッシュ無し、788KB db.json を cache miss 毎に parse
`:199-224` の `enrichOfficialPersona` が `OFFICIAL_DB_URL` を毎回 fetch + `.json()`。
module-scope 変数なし。Workers Free は **10ms CPU/req**。Cloudflare 公式値では
大きな payload の parse は 10-20ms。**10ms 予算をそれだけで超える**。
超えると `:304-305` の catch が `fallbackHtml` を **status 200** で返す
→ crawler は OGP 無しページを受け取る。
`max-age=604800` + `cross_version_cache` で miss は実質1回/共有リンク。

### M: エラーメッセージが public に漏れる
`:304-305` → `:249` で `error?.message` をそのまま出力（HTML escape 済み）。
`"Rentry HTTP 500"`, `"Telegraph HTTP 404"`, `"Rentry内に共有トークンがありません"` 等。
backing store の状態を攻撃者が識別できる。

### M: 未認識パスが 404 ではなく 200
`:278` の `fallbackHtml(url)` が status 200。`README.md` が `/s` `/i` `/health` の
3本のみ記載、実装は `/d` と 405 パスを含む（実装は正しい、doc が不完全）。
405 は `:275` で正しく `status:405` + `Allow: GET, HEAD` + `no-store`。

### M: `ogp:image` のホストが ingress Host から派生
`:264` の `` `${url.origin}/i?...` `` が `new URL(request.url)` の origin 由来。
Host header 操作で off-origin `og:image` を诱导できる。反射入力シンク。

### 要確認: `cross_version_cache` の実地検証
`wrangler.toml:19-21` の `[cache]` は実在キーだが、
`cross_version_cache` は wrangler **4.107.0+** 必須。
`ogp-gateway/` に `package.json` がなく wrangler バージョンが pin されない。
`DEPLOYMENT-NOTES.md:29` の手動検証記録は 2026-08-18 で、
`cross_version_cache` 追加 (2026-10-02) より**前**。

---

## 9. 文書化

**57/84 (68%) が未記載**。`tools/` ルートには **README が存在しない**ため
10本全てが未記載。

| ディレクトリ | 総数 | 記載済 | **未記載** |
|---|---|---|---|
| `tools/ui/` | 43 | 9 | **34** |
| `tools/provenance/` | 30 | 17 | **13** |
| `tools/` ルート | 10 | 0 | **10** |

### `TOOL-NAMING.md` の自己矛盾
- 仕様は `{用途}_{精度ランク}`（アンダースコア）だが、**30/30 が違反**
- 28/30 はランクなし。2本だけ `-v3` / `-v2`（ハイフン）で仕様と矛盾
- doc 自身が `audit-all-detect.py` → `audit-all-detect_v1.py`（ハイフン）と書いている
- rename 表が指す5ファイルのうち**3本は存在しない**
- snake_case 9本 / kebab-case 21本。**snake_case 9本全部が未記載ファイル**

---

## 10. Orphan（無参照ツール）

**49/84 が README・他のツール・tests・CI のいずれからも参照0**。
CID は Last commit が 2026-10-02/03 = staller  Cleanup は整合的。

ただし「無参照 ≠ 出力済み ≠ 不要」:
`generate_share_card.py`, `subset-corplogo.mjs`, `extract_pack_data.py` は
**成果物が追跡済み・ship 済み**（`lbt-share-card.png`, woff2, `pack1-extracted.json`）。
**再生成手順が pin されていない**。

---

## 11. Minor 一覧

- `sync-asset-versions.mjs:43` — `--all` を最終引数にすると `undefined` になり falsy。force-bust が起きない。無警告。
- `sync-asset-versions.mjs:45` — トークン検証が deny-list (`/[^0-9a-zA-Z_-]/`) なので `--all --check` が `--check` を token として受理。`--check` が short-circuit するため今日は無害。
- `sync-asset-versions.mjs:132` — in-place 書き込みで atomic でない。4ソース全部 utf8 round-trip は byte 同一（検証済み）。
- `ogp-gateway/worker.mjs:293` — `同じ条件战士 restrictive し`（**実在の文字列**、U+FFFD=0。壊れた find/replace）
- `ogp-gateway/wrangler.toml:11` — `Cache で说话了`
- `ogp-gateway/DEPLOYMENT-NOTES.md:17` — `写在文件里` / `:33` — `定数と一对になる`
- `tools/subset-corplogo.mjs:17` — `ロゴ attorneys な仮名`（**attorneys** は find/replace 事故）
- `tools/subset-corplogo.mjs:30` — doc comment が `py -3 tools/subset-corplogo.mjs` と書いているが Node スクリプト。実行すると Python syntax error。
- `tools/subset-corplogo.mjs:34` — 個人 `%TEMP%` パス hardcode
- `tools/subset-corplogo.mjs:66` — woff2 の妥当性を検証せず、縮小も assert しない
- `tools/subset-corplogo.mjs:86` — NFKC 重複で `.find()` が先頭1件のみ。1行が黙って適用されない可能性
- `tools/generate_share_card.py:8-11` — **Linux** フォントパス hardcode。win32 では `load_default()` に落ち、**6pxビットマップフォントで成功終了**する
- `run_verification` 未設定 → AGENTS.md の必須検証ステップが利用不可
- `share.html` の sync 結果が未コミット（HEAD は `?v=8ea44270`、worktree は `?v=c4bc7d87`）

---

## 検証済みOK

- `sync-asset-versions.mjs --check` は**本当に read-only**（書き込みは `:132` の1箇所のみ、`if (!CHECK)` で gate）
- 現リポジトリは `?v=` が**完全同期**（30アセット、drift 0、missing 0、無バージョン参照0）
- 新規アセットは登録表不要。`SOURCES` は参照側4ファイルのみ
- `VERSION_RE` は `fetch("data/db.json?v=…")` や `xhr.open` 内の参照も拾う（属性 illumination 限定でない）
- `data/db.json` は健全。115 E.G.O レコードに U+FFFD 0、minified、`JSON.stringify(JSON.parse(…))` がバイト同一
- Worker: zip bomb ガード（`MAX_DECOMPRESSED_BYTES`, `MAX_TOKEN_CHARS`, `MAX_SOURCES`）全部正しく配備
- Worker: SSRF なし（upstream fetch 先は固定ホスト + `encodeURIComponent`）
- Worker: エラーステータスは **一度も cache されない**（405/400/404 全部 `no-store`）
- Worker: 4xx/5xx は全て `no-store`。cache されるのは 200 fallback のみ（意図的設計）
- メモリ 2/50 subrequest、788KB は 128MB 枠内
- テストは全 read-only。62テスト 중 db.json を書くものは 0
- `tools/provenance/README.md` の文書化コマンドは実在