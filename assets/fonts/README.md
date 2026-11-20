# assets/fonts

## corporate-logo-{medium,bold}-subset.woff2

| 項目 | 内容 |
|---|---|
| フォント名 | コーポレート・ロゴ Corporate Logo **ver3** |
| 設計 | [KANA_main] LOGOTYPE.JP |
| 配布元 | <https://logotype.jp/corporate-logo-font-dl.html>（公式）<br><https://free-fonts.jp/corporate-logo/>（紹介記事） |
| ライセンス | **SIL Open Font License 1.1** → 同梱の `OFL-1.1.txt` |
| 商用利用 | 可。ロゴ・商標登録も可。 |
| 由来 | 漢字と英字は源ノ角ゴシック（Source Han Sans = Noto Sans JP と同一）、**ひらがなとカタカナがオリジナル**のロゴ風 |

### なぜサブセット化するか

配布元の OTF は 1 ウェイトあたり約 2.7 MB で、Medium と Bold の 2 つを
そのまま置くと **5.4 MB** になる。現状 Noto Sans JP は Google Fonts が
unicode-range で分割してくれていて実際に落ちているのは約 3.06 MB なので、
素のまま入れると 2 倍悪化する。

意匠を持つのは仮名だけ。漢字と英字は Noto Sans JP と
**字形が同一**なので Google Fonts 側の Noto Sans JP に任せれば見た目も
変わらず、意匠を担うのはこのフォントの仮名だけになる。
CSS の per-character fallback で、1 行の中に漢字とかなが混在しても自動で分かれる。

そのためサブセットは**仮名・記号・ASCII のみ**に絞った。

```
    元 OTF  2,649 KB  →  woff2  40 KB   (1.5%)
    元 OTF  2,768 KB  →  woff2  41 KB   (1.5%)
    合計  5,417 KB    →      81 KB
```

### 再生成方法

配布元から OTF を入手して展開し、`tools/subset-corplogo.mjs` を実行する。

```bash
# 1. 公式から ver3 の zip を取って適当な場所に展開
#    Corporate-Logo-Medium-ver3.zip / Corporate-Logo-Bold-ver3.zip
# 2. subset（py -3 -m pip install fonttools brotli が必要）
node tools/subset-corplogo.mjs "展開先パス"

# 3. 出力先が変わるので ?v= を同期する
node tools/sync-asset-versions.mjs
```

採用する文字（`tools/subset-corplogo.mjs` の `UNICODES`）:

```
U+0020-007E  ASCII（英字・数字・記号）
U+00A0-00FF  Latin-1 補足
U+3000-303F  CJK 記号（、。「」〜など）
U+3040-30FF  ひらがな・カタカナ
U+FF01-FF60  全角記号（：＜＞など）
```

**採用文字を変えたときは `assets/fonts/` 内の woff2 を入れ替えてから
`node tools/sync-asset-versions.mjs` を実行すること。** ファイル名は
変わらないので、中身のハッシュでキャッシュを破棄している
（`tests/asset-version-sync.test.mjs` が検証）。

### ライセンス表示について

OFL 1.1 は「配布物にはライセンス本文を同梱すること」を求めているため、
本ディレクトリに `OFL-1.1.txt` を置いている。フォント自体を再配布する場合は
このファイルを必ず同梱すること。
