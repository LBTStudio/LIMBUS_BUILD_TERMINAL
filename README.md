# LIMBUS BUILD TERMINAL v65r67

Limbus TRPGで使うキャラクター情報の準備、人格・E.G.Oの参照、CCFOLIA出力を支援する静的Webツールです。TRPGのルールや裁定を決めるものではなく、セッションで参照する情報を整えるために使います。

## 起動

フォルダ構成を保ったままローカルサーバーで配信してください。

```bash
python3 -m http.server 8000
```

ブラウザーで `http://localhost:8000/` を開きます。`file://` で直接開くと、データベース読み込みが失敗する場合があります。

## 現行リリース

**v65r67** では、本文が途中で切れて出力される不具合を修正しました。`[1R]`（持続表記）や（1Rに2回）（回数制限）の手前で段落が分断され、固有バフやスキル効果が尾切れになっていました。さらに原典PDF二冊と全人格を照合し、転記破損88件（40人格）を修復しています。以後の再発を防ぐため、原典との照合と出力の無損失性を回帰テストに組み込んでいます。

**v64r45** では、CCFOLIAのチャットパレットに出すE.G.O本文からSAN表記を除外しました。E.G.Oコスト、パッシブ、覚醒・侵蝕の効果、ダイス実行ラベルに残るSANは精神力として表示し、SAN検索がE.G.O本文に埋もれないようにしています。E.G.Oの資源コスト、効果、ダイスは残り、SANコストはE.G.O編集画面とメモで確認できます。

使い方画面は、LIMBUS BUILD TERMINALの目的と「人格を装備する → 必要な情報を整える → 出力を確認して保存する」の順を案内します。設定画面では、ステータス一覧、初期値・上限の編集、出力順の変更を一つの作業面で扱えます。人格編集のキーワード候補は、基本ルールPDFの掲載順で追加できます。メモとチャットパレットのカテゴリは、長押しドラッグまたは上下ボタンで並べ替えられます。E.G.O解析は通常・同化・影響の形態別に編集でき、派生スキルはS4-2のような親子関係で表示されます。

一般利用者向けの詳細は [パッチノート.txt](パッチノート.txt) を参照してください。

## 保存データ

既存データとの互換性を維持するため、ブラウザー内の保存キーは `lbt_v46_state` のままです。保存データ形式は `schemaVersion: 2` です。旧保存データを開いた場合も、現在装備中の人格に必要な自己管理状態を再確認します。DB固有値は既定ステータスへ重複追加せず、固有側の初期値・上限を維持します。

## 共通PDF検出器と機能監査（開発中）

全データ対応の厳密なGoalは [docs/data-provenance-goal.md](docs/data-provenance-goal.md) の U1〜U8です。
**全Goalは未完了です。** 4冊・1,429頁・43,977行の原文台帳を作成し、今回の構造化登録は
パックのサポートパッシブ29件・精神5件を検証済みです。他巻・別冊を含む全カテゴリの
構造化・項目別来歴の統合は引き続き必要で、全体監査は未対応を成功扱いせず終了コード1を返します。

```bash
# 依存: tools/provenance/requirements.txt の PyMuPDF
python3 tools/provenance/detect_pdf_data.py --scope all --write-ledger --write-report
python3 tools/provenance/detect_pdf_data.py --scope pack-shop --check-db
node tools/provenance/audit-output-content.mjs
```

登録済み9区分836レコードの実出力を監査し、E.G.Oの発動条件・固有バフ・同化スキルの出力漏れを修正しました。
JSONはcommandsとmemoを別々に検査します。メモの概要表示など、意図的に本文を出さない項目は
除外件数を報告します。手順・対応範囲・未解決事項は [出典照合ツール](tools/provenance/README.md) を参照してください。

## 本文の出典照合

`data/db.json` の本文は原典PDFの紙面を根拠とし、ルールの解釈や調整は行いません。

原典PDF4冊は `sources/` に格納しています。下記の従来コーパス監査は基本・サプリ・パックの3冊を対象とし、
別冊を含めた全データ構造化の保証ではありません。照合と修正のツールは `tools/provenance/` にまとめてあります。

```bash
# 段階1: DB本文の文字が原典に実在し、原典の途中で切れていないか
node tools/provenance/audit-db-text.mjs

# 段階1: DB本文の段落構造が原典と一致しているか
node tools/provenance/audit-db-paragraphs.mjs

# 段階3: 段落分割器がDB本文を壊していないか
node tools/provenance/audit-output-lossless.mjs

# 段階3: 実際の出力（パレット・メモ・JSON・共有シート）が段落構造を保っているか
node tools/provenance/audit-output-paragraphs.mjs
```

いずれも指摘0件で通る状態を維持してください。

「本文の文字」と「段落構造」、「段落分割器」と「実際の出力」をそれぞれ別に検査するのは、前者だけでは後者の破損を原理的に検出できないためです。文字照合は比較前に改行を除去するので段落の破損を見逃し、分割器の検査は分割器を通らない経路の欠陥を見逃します。

手順や判定の根拠は [tools/provenance/README.md](tools/provenance/README.md)、この作業の目標と方針は [docs/output-fidelity-goal.md](docs/output-fidelity-goal.md)、作業中に詰まった箇所と教訓は [docs/provenance-lessons.md](docs/provenance-lessons.md) にあります。

## テスト

```bash
node --test "tests/*.test.mjs"
```
