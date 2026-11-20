# tools/ — ルート直下のツール

このディレクトリ直下のスクリプトの索引です。サブディレクトリごとの詳細は
それぞれの README を参照してください。

| README | 対象 |
|---|---|
| `tools/provenance/README.md` | PDF からのデータ抽出・照合・適用パイプライン |
| `tools/ui/README.md` | ブラウザ描画の検証基盤（Playwright） |

## データとプロvenance

`data/db.json` を書き換えるのは次の2本だけです。**どちらも既定は dry-run** で、
`--write` / `--apply` を明示しなければファイルは変更されません。

| スクリプト | 目的 | ゲート |
|---|---|---|
| `apply-support-source.mjs` | `data/provenance/three-book-audit.json` の台帳を db.json の source と掲載順へ反映する | `--apply` |
| `repair-end-calendar.mjs` | E.G.O 13件の開始/end/cost を PDF の基準で固定値に整える | `--write` |

```sh
node tools/apply-support-source.mjs          # 変更内容を表示するだけ
node tools/apply-support-source.mjs --apply  # data/db.json を更新する
```

db.json は 788KB のミニファイ済みファイル（改行 0 バイト）です。整形して
書き戻すと diff が全行のノイズになるので、**インデント無し**で保存します。

## アセットとキャッシュ

| スクリプト | 目的 |
|---|---|
| `sync-asset-versions.mjs` | アセットの内容ハッシュを `?v=` として index.html / share.html へ注入する |
| `subset-corplogo.mjs` | ロゴ用フォントを woff2 へサブセット化する |

```sh
node tools/sync-asset-versions.mjs --check   # 読み取り専用。CI 用
node tools/sync-asset-versions.mjs           # index.html などを書き換える
node tools/sync-asset-versions.mjs --all v2  # 全アセットを版 v2 に固定する
```

`--check` は 4 つの場合で exit 1 になります。

1. `?v=` が内容ハッシュとずれている
2. 版パラメータの無いアセット参照がある
3. 参照先が存在しないアセットがある
4. （上記を 1 含む）判定不能

ハッシュはテキストを LF 正規化してから sha256 を取ります。`core.autocrlf` は
各マシンの設定でリポジトリには書けないため、これが無いと Windows と
Linux/macOS で版が別々に計算されます。woff2 だけはバイナリなので生バイトです。

`subset-corplogo.mjs` は `fonttools` と `brotli` をローカルに要求します。

```sh
py -3 -m pip install fonttools brotli
node tools/subset-corplogo.mjs
```

## OGP と共有

| スクリプト | 目的 |
|---|---|
| `simulate-worker-capacity.mjs` | OGP Worker の Free 枠（100,000 req/day）に収まる想定を計算する |
| `generate_share_card.py` | OGP カードの既定画像 `assets/lbt-share-card.png` を生成する |

どちらも読み取り専用で、db.json を変更しません。

`generate_share_card.py` は Linux のフォントパス決め打ちです。Windows で
実行すると既定ビットマップフォントにフォールバックするため、
**フォントが乗らない画像が成功終了**します。生成物を更新するときは
Linux で行ってください。

## 個別データの目視確認

`data/db.json` の特定レコードに対する、その場しのぎの dump です。
用途は限定的で、追跡に値する検証ツールではありません。

| スクリプト | 出力 |
|---|---|
| `inspect-ego-record.mjs` | 指定グループの E.G.O レコード 1 件 |
| `audit-ego-effects.mjs` | E.G.O の効果の種類と表記ゆれの一覧 |
| `compare-ego-names-pdf.mjs` | db.json にあるが PDF にない E.G.O 名 |

いずれも引数なしで実行でき、JSON を標準出力に出すだけです。

## このディレクトリの並び

サブディレクトリの規約は `provenance/TOOL-NAMING.md` にあります。ただし現状は
その規約と実ファイル名が一致していません（`_` 区切りの規約に対して
実体は `-` 区切りが 21 本、`_` 区切りが 9 本）。適合するまでは
新規ファイルは既存の `-` 区切りに合わせることを推奨します。

## このディレクトリの監査記録

- `tools/REVIEW-TOOLS-2026-10-03.md` — 2026-10-03 実行した
  84本の機能レビュー結果（重大・重要・軽微の分類）