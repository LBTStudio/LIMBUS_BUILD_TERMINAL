# 出典照合ツール（provenance）

## 2026-09-19: 共通検出器の入口と現在の範囲

**全データ構造化のGoalは未完了です。**
厳密な完了条件は [data-provenance-goal.md](../../docs/data-provenance-goal.md) の U1〜U8。
既存の監査が0件でも、未対応の原典ページや分類を合格扱いにはしません。

### 再実行

依存関係は `requirements.txt`（PyMuPDF 1.28.2）に固定しています。
検証環境は Python 3.13.14 / Node 22.23.2。Pythonの依存はローカルの仮想環境などへ導入してください。

```bash
python3 -m pip install -r tools/provenance/requirements.txt

# 4冊全頁の原文台帳と未解決一覧。現時点では終了コード1が正しい結果。
python3 tools/provenance/detect_pdf_data.py --scope all --write-ledger --write-report

# 実装・検証済みスコープのDB一致確認。終了コード0。
python3 tools/provenance/detect_pdf_data.py --scope pack-shop --check-db

# 検証成功時のみ登録。同名異値・重複は拒否し、同じデータの再登録は無変更。
python3 tools/provenance/detect_pdf_data.py --scope pack-shop --write-db --write-report

# 新しい実出力監査。JSONはcommandsとmemoを独立して検査。
node tools/provenance/audit-output-content.mjs
node --test tests/*.test.mjs
```

### 何を保存・検証しているか

- `sources/` の4冊・1,429頁をファイル名、SHA-256、頁数で固定。
  基本・サプリはHubのPDFと一致、パックもアップロードされたPDFと一致を確認済み。
- `all-ledger.sqlite` は4冊43,977行を保持する**原文・来歴用DB**。
  `sources / pages / lines / candidates / evidence` を持ち、行ID、本文、座標、罫線、項目への対応を保存。
  外部キー・件数・SQLite整合性も確認する。再生成可能なためGitでは無視し、原典PDFとJSON報告をコミットする。
- `all-audit.json` は全頁の未解決状態を記録する。現時点の1,429件は
  **頁の分類・除外根拠が未完了という件数**であり、1,429個の誤記や欠落レコードという意味ではない。
  表紙・説明文・ノンブルを含め、除外の妥当性をまだ全頁で承認していない。
- 利用者向け `data/db.json` へ今回追加したのは、検証済みのサポートパッシブ29件と精神5件。
  `pack1-shop.json` に各項目の原文行ID・ページ・座標・変換種別を保持。
  列・セル境界で所属を確定し、短い数字や任意の発動条件も落とさず、全項目を原文へ戻して比較する。
- 原文台帳への保存を、全カテゴリの構造化成功とは数えない。
  既存の人格・E.G.O抽出器はまだ全巻共通の項目来歴モデルへ移行していない。
  別冊の同期・LCB・MAX、他巻のショップ、強化・用語・弾丸などは引き続き対応が必要。

### 修正と検証

旧ショップ検出器の条件語依存・数字行除外を廃止し、`extract_pack_data.py` も共通検出器へ委譲します。
「人生の終止符」と「マージン」の混同、「苦痛なき慈悲」と「魔王の行進」の混同、
「発電モーターL-22」の末尾数字欠落、語中の改行を解消しました。
`verify-pack-extract.mjs` はショップ34件を毎回PDFから再抽出して完全一致を確認します。

実出力監査は9区分・836レコードを5チェック経路（パレット、メモ、JSON.commands、JSON.memo、共有）へ通し、
28,312件の本文／名称存在チェックを実施します。E.G.Oのパレットから欠けていた発動条件・固有バフ、
共有シートから欠けていた同化スキルを修復し、同化パレットのSAN表示も精神力へ統一しました。

**監査の限界も区別します。** `audit-output-content` は本文の存在を検査し、改行を正規化するため
段落検査の代わりにはなりません。従来の `audit-output-paragraphs` の実装対象は人格です。
メモの戦術／E.G.Oは従来から概要表示、アイテムのパレットは専用短文表示であり、
これらは `omittedByContract` へ件数を明示します。全経路に全原文が出たという意味ではありません。
同一レコード内で同じ本文を持つ複数フィールドの取り違え・出現回数や、UI全画面の目視確認も別途必要です。

237件のNode回帰テストが成功し、その中で10件のPython原典／破損注入テストも実行します。
レコード削除、短文欠落、価格変更、引用の所属入替、出力削除・例外・空出力を注入すると失敗します。
全巻の再抽出ダイジェストとコミット済み報告の一致、ショップの再登録無変更も確認します。

以下は従来の限定スコープ監査の説明です。これら単独の0件を全Goal完了と解釈しないでください。


原典PDFとLBTのデータベース、そしてCCFOLIA出力の三段階を監査するツール群です。
利用者から「スキルテキストが途中で寸断される」「発動タイミングで改行されない」
という報告を受けた際に、どの段階の問題なのかを切り分けるために使います。

目的と設計方針は次の二つにあります。

- [docs/output-fidelity-goal.md](../../docs/output-fidelity-goal.md) — 現行の目標と計画
- [docs/data-provenance-goal.md](../../docs/data-provenance-goal.md) — 先行作業（文字照合）

作業中に詰まった箇所と判断の根拠は
[docs/provenance-lessons.md](../../docs/provenance-lessons.md) にまとめてあります。
このツール群を触る前に一度目を通してください。

## 監査する三段階

| 段階 | 内容 | ツール |
|---|---|---|
| 1. データベース | 本文の文字が原典に実在するか | `audit-db-text.mjs` |
| 1. データベース | 本文の段落構造が原典と一致するか | `audit-db-paragraphs.mjs` |
| 2. 信ぴょう性検査 | 1・3を機械的に再実行できるか | `extract_pdf_corpus.py` + 上記の各監査 |
| 3. 抽出・反映 | 段落分割器が本文を壊していないか | `audit-output-lossless.mjs` |
| 3. 抽出・反映 | **実出力**が段落構造を保っているか | `audit-output-paragraphs.mjs` |

段階1の二つは役割が違います。`audit-db-text.mjs` は比較前に改行を除去するため
段落構造の破損を原理的に検出できず、`audit-db-paragraphs.mjs` がその死角を埋めます。

段階3の二つも同様です。`audit-output-lossless.mjs` は分割器を単体で検査しますが、
利用者が受け取るのは `buildPalette()` などの出力です。
分割器を通らない経路の欠陷を見逃さないため、
`audit-output-paragraphs.mjs` が実出力4経路を直接照合します。

## 使い方

### 実出力の段落構造を検査する（PDF不要）

```bash
node tools/provenance/audit-output-paragraphs.mjs
node tools/provenance/audit-output-paragraphs.mjs --json
```

全人格を実際に装備し、チャットパレット・メモ・CCFOLIA JSON・共有シートの
4経路について、DB本文の段落境界がその経路の改行表現で現れるかを確かめます。

新しい出力経路を追加したら、`output-paragraphs.mjs` の `OUTPUT_ROUTES` へ
必ず登録してください。登録を忘れるとその経路は監査の外に置かれます。

### DBの段落構造を原典と照合する（PDF不要）

```bash
node tools/provenance/audit-db-paragraphs.mjs
node tools/provenance/audit-db-paragraphs.mjs --json
```

組版情報から段落境界を復元したコーパス
（`data/provenance/*.paragraphs.txt`）と突き合わせ、二種類の破損を報告します。

- **連結** — 原典が改段している位置で、DBが改行を落としている
- **分断** — 原典が一文で書いている位置に、DBが改行を入れている

組版から一意に定まらない位置（行末の余白が1文字に満たず、
続きが発動タイミング見出しの場合）は、偽陽性を避けるため報告しません。

### 段落の破損を修復する

```bash
node tools/provenance/plan-paragraph-repairs.mjs           # 修復案を確認
node tools/provenance/plan-paragraph-repairs.mjs --write   # repairs.json へ追記
node tools/provenance/apply-repairs.mjs                    # 適用内容を確認
node tools/provenance/apply-repairs.mjs --write            # data/db.json を更新
```

修復は「原典が改段している位置へ改行を戻す」だけで、文字は変えません。
案は手で書かず、監査の指摘から機械的に生成してください（転記の誤りを防ぐため）。

### 出力生成の検査（PDF不要）

```bash
node tools/provenance/audit-output-lossless.mjs
```

DBの全本文（約4000件）を段落分割器へ通し、
本文の欠落・括弧の分断・見出しの整列崩れを検出します。
差分があると終了コード1を返します。

`[1R]`（1ラウンド持続の状態表記）や `（1Rに2回）`（発動回数の制限）は
ラウンド進行の段落見出しではないため、ここで分断されてはいけません。

### DB本文と原典PDFの照合

```bash
# 破損（原典に存在しない本文）のみ表示
node tools/provenance/audit-db-text.mjs

# 用語集など他頁からの引用も含めて表示
node tools/provenance/audit-db-text.mjs --all

# 機械処理向け
node tools/provenance/audit-db-text.mjs --json
```

照合には `data/provenance/*.txt` のコーパスを使います。
コーパスはリポジトリに含まれているため、PDF本体がなくても再実行できます。

### 紙面の記載を確認する

```bash
node tools/provenance/show-source.mjs "N社握る者"
node tools/provenance/show-source.mjs "N社握る者" --raw   # 行見出しを除かない
```

指摘された本文を修正するとき、原典の紙面をそのまま確認できます。

### コーパスの再生成

原典PDFは `sources/` に格納してあるので、引数なしで再生成できます。

```bash
python3 tools/provenance/extract_pdf_corpus.py
```

二種類のコーパスを書き出します。

| ファイル | 用途 |
|---|---|
| `<key>.txt` | 素のテキスト。文字照合（`audit-db-text.mjs`）が使う |
| `<key>.paragraphs.txt` | 折り返しを連結し、段落境界だけを改行にした版 |

別の場所のPDFを使う場合は引数で渡せます。

```bash
python3 tools/provenance/extract_pdf_corpus.py \
  "新リンバスTRPG.pdf" \
  "新リンバスTRPG サプリメント 『アンロックド・シンク』.pdf"
```

`PyMuPDF` が必要です（`pip install pymupdf`）。
人格データの紙面は表組みで、PyMuPDFはセル単位で読み順を保つため、
セルの内容が途中で分断されません。

`pdftotext -layout` でも読み順は保たれますが、表の左端にある行見出し
（`効果` `戦` `術` など）を本文と同じ行へ出力するため、
本文が折り返されると見出し語が本文の途中へ割り込みます。
照合の精度が落ちるので、PyMuPDFを既定としています。

## ファイル

| ファイル | 役割 |
|---|---|
| `extract_pdf_corpus.py` | PDFから照合用コーパス（素・段落復元の二種）を書き出す |
| `db-provenance.mjs` | 文字照合のロジック（正規化・紙面ブロック構築・判定） |
| `db-paragraphs.mjs` | 段落照合のロジック。監査とテストが共有する |
| `output-paragraphs.mjs` | 実出力の段落照合ロジック。出力経路の一覧もここにある |
| `audit-db-text.mjs` | DB本文の文字が原典に実在するかを報告する |
| `audit-db-paragraphs.mjs` | DB本文の段落構造が原典と一致するかを報告する |
| `audit-output-lossless.mjs` | 段落分割器が本文を壊していないかを報告する |
| `audit-output-paragraphs.mjs` | 実出力4経路が段落構造を保っているかを報告する |
| `plan-paragraph-repairs.mjs` | 段落照合の指摘から `repairs.json` の追記案を作る |
| `apply-repairs.mjs` | `repairs.json` に従って `data/db.json` を修正する |
| `show-source.mjs` | ある人格の原典紙面をそのまま表示する |
| `pipeline-harness.mjs` | `js/generator.js` と `js/state.js` をNode上で動かす足場 |

## 判定の考え方

### 照合は「部分一致」で行う

PDFの紙面は二段組みの表組みで、行の折り返し位置はPDF側の組版に従います。
行単位で厳密に再構築することは現実的ではないため、
「DBの本文が、その人格の紙面ブロック内に部分文字列として実在するか」で判定します。

比較の前に、空白・句読点・全角半角の差を取り除きます（`canon()`）。
これらはPDFのレイアウト由来の差であり、意味の差ではありません。

これにより「原典に無い文字列の混入」＝隣接セルの断片流入が検出できます。

### 途中で切れた本文も検出する

部分一致だけでは、原典の手前で転記が止まった本文を見逃します。
DB側が短いだけなら、原典の部分文字列として一致してしまうためです。

そこで一致位置の直後を調べ、そこから次の記載が始まっているかを見ます。
次の記載の始まりは、ダイス表記・表の行見出し・括弧書きの状態定義、
そしてその人格が持つ他のスキル名・バフ名・本文です。
これらのいずれでもなければ、原典の文がまだ続いているのに
転記が止まっていると判断し、`切断` として報告します。

原典の語彙は広く「文の続きになりうる語」を列挙できないため、
逆に「記載の区切りとして現れるもの」だけを列挙し、
それ以外を続きとみなす形にしています。

### 表の行見出しを取り除く

抽出したテキストには、表の左端にある行見出し（`効果` `戦` `術` `固有` など）が
本文と同じ流れに現れます。これは表のラベルであって本文ではないため、
照合の前に取り除いた版も作り、素の版と両方で突き合わせます（`stripGutterLabels()`）。

どちらか一方で一致すれば、原典に実在する本文として扱います。

### 例外の登録

PDFが判読できない、または原典自体が省略している場合は
`data/provenance/exceptions.json` に登録します。
人格名・項目パス・理由の三点が必要で、理由が空の登録は無効です。

```json
{
  "entries": [
    { "persona": "人格名", "label": "スキル4「技名」/効果", "reason": "理由を書く" }
  ]
}
```

## 回帰テスト

すべての監査はテストスイートからも実行されます。

| テスト | 対象 |
|---|---|
| `tests/db-provenance.test.mjs` | 段階1（文字が原典に実在するか） |
| `tests/output-lossless.test.mjs` | 段階3（段落分割器が本文を壊さないか） |
| `tests/output-paragraphs.test.mjs` | 段階3（実出力4経路が段落を保つか）・報告事例の固定 |
| `tests/audit-non-vacuity.test.mjs` | 監査が空回りしていないこと |

```bash
node --test "tests/*.test.mjs"
```

### 非空虚性の試験について

`tests/audit-non-vacuity.test.mjs` は、監査が「検出すべきものを検出できる」ことを
破損の注入によって確かめます。

この作業の発端は、監査が0件を報告し続けたまま利用者が破損を踏んだことでした。
監査が検査していた内部関数と、利用者が受け取る出力の経路が別だったためです。
**「0件」は監査が働いている証拠にはなりません。**

そのため次の五つを常時確認しています。

- 4つの出力経路それぞれについて、改行を空白へ潰すと段階3の監査が検出すること
- 壊していない経路は指摘されないこと（常に何か検出するだけの試験にしない）
- DBの改行を落とすと段階1の段落照合が検出すること
- 原典に無い改行を入れると段階1の段落照合が検出すること
- 監査が検査対象を実際に集めていること（対象0件でも「検出0件」と出てしまうため）

監査や出力経路を変更したときは、このテストが通ることを必ず確認してください。
