# 共有基盤の設計判断 — 永続性・管理不要性・応答性

調査日: 2026-08-17

## GitHub Pagesの位置付け

現在の自己完結型共有URLは、共有データをURLの`#fragment`に圧縮し、GitHub Pagesは固定の閲覧アプリとOGPだけを配信する。共有ごとのファイル保存、データベース、アカウント、定期的な削除作業は発生しない。リポジトリとGitHub Pages設定が維持される限り、発行済みURLは同じ共有ページを参照し続ける。

一方、GitHub Pagesは永続保管サービスや一般的な無料ホスティング用途を保証するものではない。GitHub公式ドキュメントは、Pagesをオンライン事業・SaaSを動かす無料ホスティングとして利用することを許可しておらず、月間100 GB帯域・毎時10ビルドのソフト制限、レート制限の可能性を明記している。[GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)

LBTの方式は、各共有時にGitHubへファイルをアップロード・ビルド・保存せず、既存の静的クライアントを配信するだけである。共有データの保管・配信の負荷をGitHub Pagesへ転嫁しないため、一般的な小規模TRPGビルド共有としては現在の用途に適合する。ただしGitHubが将来にわたり無条件で公開を維持する保証はないため、「恒久」はリポジトリとPagesが存続する範囲に限られる。

## 比較対象

| 方式 | 共有ごとの保管 | 管理・期限 | 応答性 | Discordカード | 評価 |
| --- | --- | --- | --- | --- | --- |
| GitHub Pages + URL fragment | なし | リポジトリとPages存続中。共有ごとの管理なし | 圧縮・コピーのみで即時 | 静的OGP | 現行の第一候補 |
| 匿名ファイルホスト | あり | ホスト都合の削除・仕様変更・障害 | アップロード待ち・失敗再試行が必要 | 応答形式に依存 | 永続性・速度とも劣後 |
| 時限ホスト | あり | 期限切れを前提 | アップロード待ちが必要 | 応答形式に依存 | 一時共有専用。現行要件では不要 |
| サーバー側共有ストア | あり | 運用・費用・バックアップが必要 | API往復が必要 | 動的人格名OGPが可能 | 管理不要要件と相反 |

## 運用結論

1. 共有の既定方式は、外部保存を伴わないGitHub Pages自己完結URLとする。
2. Discordカードは静的OGPとして提供し、人格名などの実データはクリック後に共有シートで示す。
3. URLがDiscord本文の実用上限を超える場合のみ、既存のHTMLダウンロードを確実なフォールバックとする。匿名ホストへの自動送信は再導入しない。
4. 共有発行は通信待ちを伴わない圧縮・URL生成・自動コピーへ限定し、最速性を優先する。

## v64r74の短縮方針

共有シートに不要な編集UI・履歴・お気に入り・非選択人格に加え、共有シート本体に重複して含まれる人格元データ（スキル原文・パッシブ原文など）は除外する。共有ページに必要な人格元データは人格名だけであり、選択中人格の同期情報は最小化した`roster.personas`へ残す。空配列・空オブジェクト・空文字列も圧縮前に除去し、復元時に共有ビューア用の安全な既定値を補完する。

実データのうち最長の人格ケースも自動テストへ含める。通常の共有はDiscord本文に余裕を持つ長さで即時発行し、長文効果を多く含む最大級ケースが実用長を超えたときだけ、画面上で明確に警告して既存の共有HTMLダウンロードをフォールバックとして案内する。ファイルホストへ自動送信して待機時間や第三者サービス依存を増やすことはしない。

人格DBの基礎データは共有URLに重複して格納せず、選択中人格の`mode`・`no`・`name`だけを記録する。共有ページはGitHub Pages上の同一DBから基礎ステータス・パッシブ・スキルを読み、URLに含まれる編集差分だけを優先する。この設計により、実在の黒雲会組員を使った検証リンクは**365文字**で、人格名・同期MAX・基本ステータス・5件の戦術スキル・パッシブをすべて復元できた。

受信者が初回に読む人格DBは約496 KB（gzip換算約79 KB）であり、共有ごとにファイルを保存するものではない。GitHub PagesのCDNキャッシュが使われるため、同一利用者の後続共有では通常この取得が再利用される。発行者側はDBを既に読み込んだLBT上でURLを圧縮・コピーするだけであり、ネットワーク送信待ちを発生させない。

## v64r74 公開検証

GitHub Pagesの公開URLで365文字の短縮リンクを開き、外部利用者と同じ条件で次を確認した。

- 人格名`黒雲会組員 [MAX]`、同期00・同期MAX、HP 105、SAN 48、速度1d5、耐性を表示した。
- 人格DBからパッシブと5件の戦術スキルを復元した。
- リポジトリへ共有ごとのファイル・履歴・データを追加しないことを確認した。
- `node --test tests/*.test.mjs` は25件すべて成功した。

## 参照

- [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)
- [Configuring a publishing source for your GitHub Pages site](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [GitHub Acceptable Use Policies](https://docs.github.com/en/site-policy/acceptable-use-policies/github-acceptable-use-policies)
