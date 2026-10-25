/* V13: 基本機能の説明書（ヘルプ）セクション */
const HELP_ITEMS = [
  { group: "prepare", icon: "settings", title: "駒整形で基本情報を設定する", body: "左側の「駒整形」（スマートフォンでは画面下部の同名タブ）で、キャラクター名・PL名・立ち絵URL・イニシアチブ・色などを設定します。人格を装備する前でも入力できます。立ち絵URLは画像URLを1行に1つ入力し、複数行なら差分として扱われます。" },
  { group: "prepare", icon: "persona", title: "人格を装備する", body: "左側の「ビルド」を開き、ビルド内の「人格」タブでカードを一度押すと詳細が表示され、同じカードをもう一度押すと装備します。装備後にHP、SAN、耐性、パッシブ、スキルを確認します。手動編集は上の「はじめに：人格を選ぶ・作る」を参照してください。" },
  { group: "prepare", icon: "ego", title: "E.G.Oをランク枠に装備・解析する", body: "ビルド内の「E.G.O」タブでZAYINからALEPHまでの各ランク枠に装備します。装備済み枠を押すと右側に簡易詳細が表示されます。全文の確認・編集は、その詳細で「解析を開始」を押します。終えるときは「解析を終了」を押すと内容を保持して終了します。未解析のE.G.Oは、必要な自我の欠片が不足していると解析を開始できません。" },
  { group: "prepare", icon: "plus", title: "オリジナルE.G.Oを作成する", body: "ビルド内の「E.G.O」タブで「E.G.Oを新規作成」を押し、名前と作成ランクを入力して作成します。選んだランク枠が埋まっている場合は確認が表示されます。作成後は対象の枠を選び、「解析を開始」して効果・ダイスなどを編集します。" },
  { group: "prepare", icon: "item", title: "未所持の候補はショップで探す", body: "ショップではサポート・E.G.O・精神・アイテムなどを購入／入手できます。ビルド側のサポート・精神タブは初期状態で「所持のみ」を表示します。候補が見つからないときは「未所持も表示（全体から選ぶ）」へ切り替えるか、ショップで入手してからビルドへ戻ります。" },
  { group: "blocks", icon: "skill", title: "戦術スキルを確認・編集する", body: "スキルタブでは、戦術スキルのオーダー、名称、種別、大罪、範囲、効果、ダイスを確認・編集します。d値・d数が変動する効果は、スキル全体または個別ダイスで変動設定を選びます。" },
  { group: "blocks", icon: "passive", title: "パッシブとサポートを確認・編集する", body: "人格パッシブの入力欄を編集するには、まず人格タブで「◈ 同期化して手動編集」を有効にします。表示カードへ戻すには「カード表示に戻す」を使います。サポートパッシブは、編集できる状態でカードの「この枠を編集」を押します。候補一覧は選択して詳細を確認し、「通常スロットへ装備」などから装備します。ビルド側の候補は初期状態で「所持のみ」です。未所持候補は「未所持も表示（全体から選ぶ）」を選ぶと、一覧から購入して装備できます。" },
  { group: "blocks", icon: "spirit", title: "精神・強化を確認・編集する", body: "精神タブでは混乱時の挙動を、強化タブでは身体強化と特殊強化を確認・編集します。該当する項目がない場合は空欄のままにします。" },
  { group: "blocks", icon: "settings", title: "ステータス・出力先・代入式を設定する", body: "設定タブでは、既定・人格固有ステータスの初期値と上限、ステータスの出力順、固有バフなどの出力先（ステータス側／パラメータ側／登録先なし）、代入式、同期ランクの表示設定などを調整します。メモ／チャットパレットの段落順は設定タブではなく、プレビューの各タブで並べ替えます。" },
  { group: "output", icon: "drag", title: "表示・出力順を変更する", body: "スキル順はビルド内のスキル一覧、ステータス順は設定タブの「ステータス一覧・編集・出力順」、メモ／チャットパレットの段落順はプレビューの各タブで変更します。各一覧の「⋮⋮」グリップをドラッグし、スマートフォンではグリップを押し続けてから動かします。対応する一覧では矢印／▲▼ボタンも使えます。" },
  { group: "output", icon: "eye", title: "プレビューとJSON出力を確認する", body: "プレビューではメモ、チャットパレット、CCFOLIA用JSONの出力結果を確認します。PCでは通常右側に表示され、必要に応じて開閉できます。スマートフォンでは「PREVIEW」操作から開閉します。JSONをコピー／出力する前に、除外設定も含めてプレビューを確認してください。" },
  { group: "operation", icon: "undo", title: "変更を戻す・やり直す", body: "入力や並べ替えを間違えた場合は、画面上部の矢印で元に戻す・やり直すことができます。PCでは入力欄の外でCtrl+Zを押すとアプリ全体の直前の変更を戻し、Ctrl+Shift+ZまたはCtrl+Yでやり直せます。入力欄にカーソルがある間は、Ctrl+Zは文字入力の取り消しを優先します。" },
  { group: "operation", icon: "search", title: "クイック検索で画面や候補を探す", body: "クイック検索はPCではCtrl+K（Macでは⌘K）、スマートフォンでは検索ボタンから開きます。画面移動や操作、人格・E.G.O・アイテム候補を横断して探す機能です。通常の人格図鑑では名前・効果・キーワード、大罪・所属・耐性・所持条件など、E.G.O一覧では名前・効果・キーワード、ランク・必要資源／除外資源・所持条件などで絞り込めます。同期ランク／同期MAXは、通常の人格図鑑の共通フィルターではありません。一方、「記録」の所持人格一覧には同期・同期ランク／MAXの絞り込みがあり、設定変更は所持人格詳細から行います。" },
  { group: "save", icon: "archive", title: "所持ライブラリを保存する", body: "記録タブでは所持データと保存済みビルド、リザルトと収支を確認します。PCでは上部バーのアーカイブアイコン「所持ライブラリを保存」、スマートフォンや幅の狭い画面では「操作・保存」（または「その他」）からJSONファイルを書き出し、別端末へ引き継げます。この専用ファイルは登録済みの所持データ・保存済みビルドに加えて、お気に入り・履歴を含みます。現在の作業状態ファイルとは別です。読み込み時は「所持ライブラリ」および「お気に入り・最近の履歴」の適用範囲を確認してください。" },
  { group: "save", icon: "download", title: "作業状態を保存・復元する", body: "通常の編集内容はブラウザー内に自動保存されます。画面上部の保存状態が「端末内保存不可」と表示された場合は、作業を失わないようJSONファイルにも保存してください。「現在の作業状態を保存」は現在のキャラクターだけでなく、所持データ・導入アイテム・リザルト／収支明細・設定なども含む広い作業データを書き出します。読み込み時はファイルに存在するカテゴリが初期選択されます。適用すると選択したカテゴリを上書きするため、残したいものはチェックを外し、表示された適用範囲を確認してください。なお、抽選ログは現行のカテゴリ選択読み込みでは復元されません。" }
,
  { group: "imports", icon: "persona", title: "人格データを文章から取り込む", body: "「ビルド」→「人格」→「テキスト流し込み反映」を開きます。入力方法は「完成データを分けて入力」「一括テキストを貼り付け」「硝子窓URLから移行」の3つ。解析結果とエラーを確認し、必要なら同期元を選んでから「この人格を作成」または「同期人格として反映」を押します。既存の公式人格データ自体を書き換える機能ではありません。" },
  { group: "imports", icon: "copy", title: "リザルト／購入履歴を文章から取り込む", body: "「記録」→「リザルトを記録」カードの「取り込む」→「テキスト流し込み」です。「【シナリオ名】」「報酬｜」「購入｜」「追加購入｜」などを貼り付けると、リザルトと支出の候補が表示されます。読み取れなかった行、金額が決められない支出、除外する行を確認してから「取り込む」を押します。" },
  { group: "imports", icon: "link", title: "硝子窓のキャラクターURLから取り込む", body: "キャラクター全体の所持・履歴を移す場合は「SINNER SELECT」で対象アカウントの「編集」を押し、「硝子窓の共有データ」内の「共有URLから取り込む」へ進みます。URLを読み込み、対象項目・入手方法・追加予定を確認してから確定します。人格1件だけの草案URLは、こちらではなく人格の「テキスト流し込み反映」内にある「硝子窓URLから移行」を使います。" },
  { group: "imports", icon: "roster", title: "所持人格の一覧をまとめて取り込む", body: "「記録」→「リザルトを記録」→「取り込む」→「所持人格リストを取り込む」です。名前を改行で貼り、「検出する」で一致候補を確認し、見つからない名称を必要に応じて解決してから「保存する」を押します。これは所持一覧の追加であり、リザルトや購入履歴の取り込みとは別機能です。" },
  { group: "accounts", icon: "roster", title: "キャラクター（アカウント）を選ぶ・作る", body: "起動時の「SINNER SELECT」で作業するキャラクターを選びます。新規の場合は「新しいキャラクター」からアカウント名を入力し、「作成して開く」を押します。データはキャラクターごとに分かれ、このブラウザー内に保存されます。別端末へ自動同期される機能ではありません。" },
  { group: "accounts", icon: "settings", title: "アカウントを編集・切替・削除する", body: "画面上部の現在アカウント表示を押すか、「設定」→「アカウントを切替・管理」を開きます。カードの「編集」から名前、用途タグ、アイコンを変更し、「保存」を押します。同じ編集欄から硝子窓URLの取り込みも開始できます。削除はそのアカウントの保存領域を復元できなくするため、内容を確認してから実行してください。最後の1件は削除できません。" },
  { group: "record", icon: "roster", title: "リザルトと収支を確認する", body: "「記録」のリザルト／収支タブで、セッションごとの報酬、抽出チケット、購入履歴、現在の残高を確認します。新規リザルトは「リザルトを記録」から追加し、既存カードの「編集」から訂正します。硝子窓の一括取り込みは1件ずつではなくアカウント全体へ反映する操作です。" },
  { group: "record", icon: "item", title: "手動の支出・消耗を記録する", body: "価格がデータベースにない購入や、手動で記録したい消耗は、記録画面の「支出・消耗を記録」から名前・種別・LP／欠片を入力して「記録」を押します。所持操作などから自動で作成される明細を、同じ消費について重ねて入力しないよう注意してください。" },
  { group: "save", icon: "share", title: "共有シートと保存ファイルを使い分ける", body: "「共有シートを開く」は人に見せる共有用HTMLを作る機能、「CCFOLIA JSONをコピー」はセッション用データの出力、「現在の作業状態を保存」は広い作業データのバックアップ、「所持ライブラリを保存」は所持人格・E.G.O・保存済みビルドやお気に入り・履歴の引き継ぎです。互いに代用できるものではありません。保存データの読み込みでは、適用対象のチェックを確認してください。" }
];

const GUIDE_FLOWS = {
  main: {
    title: "基本の進め方",
    note: "普段の編集はこの端末のブラウザー内へ自動保存されます。別端末へ移すときは保存ファイルを使います。",
    nodes: [
      { step: "01", title: "SINNER SELECT", body: "作業するキャラクターを選ぶ／必要なら新規作成" },
      { step: "02", title: "駒整形", body: "名前・PL名・立ち絵などを設定（必要な場合）" },
      { step: "03", title: "ビルド", body: "人格を選び、スキル・パッシブ・E.G.O等を確認" },
      { step: "04", title: "ショップ（必要な場合）", body: "未所持の候補を探して購入・入手する" },
      { step: "05", title: "プレビュー → CCFOLIA JSON", body: "出力を確認し、必要な形式でコピー・保存" }
    ]
  },
  imports: {
    title: "取り込み口は、入れたいものによって違います",
    note: "迷ったら「何のデータを入れたいか」で選んでください。読み込んだだけでは確定せず、内容確認後に反映する手順が基本です。",
    alternatives: true,
    nodes: [
      { step: "A", title: "人格データそのもの", body: "ビルド → 人格 → テキスト流し込み反映" },
      { step: "B", title: "セッション報酬・購入履歴", body: "記録 → リザルトを記録 → 取り込む → テキスト流し込み" },
      { step: "C", title: "硝子窓のキャラクター全体", body: "SINNER SELECT → 対象アカウントの編集 → 共有URLから取り込む" },
      { step: "D", title: "所持人格の名前一覧", body: "記録 → リザルトを記録 → 取り込む → 所持人格リストを取り込む" }
    ]
  },
  account: {
    title: "硝子窓のキャラクターURLを取り込む",
    note: "人格URLだけを移す場合は、人格タブの「テキスト流し込み反映」→「硝子窓URLから移行」を使います。キャラクター全体の取り込みとは別の入口です。",
    nodes: [
      { step: "01", title: "SINNER SELECTを開く", body: "起動時／上部のアカウント表示／設定の管理ボタン" },
      { step: "02", title: "対象キャラクターの「編集」", body: "違うアカウントを選ばないよう、名前を確認する" },
      { step: "03", title: "「共有URLから取り込む」", body: "URLを貼り付けてデータを読み込む" },
      { step: "04", title: "項目・候補・件数を確認", body: "反映したい内容を選んでから確定する" }
    ]
  },
  save: {
    title: "保存・共有・出力は目的が違います",
    note: "「どこへ渡すか」「何を残すか」で使う機能を選びます。共有シートはバックアップではありません。",
    alternatives: true,
    nodes: [
      { step: "A", title: "自動保存", body: "同じ端末・同じブラウザーで続きを編集する" },
      { step: "B", title: "現在の作業状態を保存", body: "所持・設定・リザルト等を含む広い作業状態のJSON" },
      { step: "C", title: "所持ライブラリを保存", body: "所持人格・E.G.O・保存ビルド + お気に入り・履歴" },
      { step: "D", title: "共有シート／CCFOLIA JSON", body: "共有相手に見せる／セッションで使う出力を作る" }
    ]
  }
};

const GuideFlowDiagram = ({ kind }) => {
  const h = React.createElement;
  const flow = GUIDE_FLOWS[kind];
  if (!flow) return null;
  const panelX = 26;
  const panelW = 708;
  const nodeH = 76;
  const nodeGap = 18;
  const positions = flow.nodes.map((node, index) => ({ node, y: 20 + index * (nodeH + nodeGap) }));
  const height = 20 + flow.nodes.length * (nodeH + nodeGap) - nodeGap + 20;
  const svgChildren = [
    h("title", { key: "title", id: "guide-flow-title-" + kind }, flow.title),
    h("desc", { key: "desc", id: "guide-flow-desc-" + kind }, flow.nodes.map((n) => n.title + "：" + n.body).join("。")),
    h("defs", { key: "defs" },
      h("marker", { id: "guide-arrow-" + kind, markerWidth: 8, markerHeight: 8, refX: 6, refY: 3, orient: "auto", markerUnits: "strokeWidth" },
        h("path", { d: "M0,0 L6,3 L0,6 Z", fill: "#d7b76b" }))),
    h("rect", { key: "bg", x: 0, y: 0, width: 760, height, rx: 14, fill: "#100f0e", stroke: "#4b4030", strokeWidth: 1 })
  ];
  positions.forEach((entry, index) => {
    if (!flow.alternatives && index < positions.length - 1) {
      svgChildren.push(h("path", {
        key: "arrow-" + index,
        d: "M 380 " + (entry.y + nodeH) + " L 380 " + (entry.y + nodeH + nodeGap - 3),
        fill: "none", stroke: "#d7b76b", strokeWidth: 2, markerEnd: "url(#guide-arrow-" + kind + ")"
      }));
    }
    svgChildren.push(h("g", { key: "node-" + index },
      h("rect", {
        x: panelX, y: entry.y, width: panelW, height: nodeH, rx: 9,
        fill: index === 0 ? "#242016" : "#1a1917",
        stroke: index === 0 ? "#c7a75b" : "#554a37", strokeWidth: 1.4
      }),
      h("rect", { x: panelX, y: entry.y, width: 7, height: nodeH, rx: 3.5, fill: "#d7b76b" }),
      h("text", { x: 52, y: entry.y + 30, fontSize: 17, fontWeight: 700, fill: "#e4c579" }, entry.node.step),
      h("text", { x: 92, y: entry.y + 30, fontSize: 21, fontWeight: 700, fill: "#f5efe4" }, entry.node.title),
      h("text", { x: 92, y: entry.y + 56, fontSize: 16, fill: "#d2cabd" }, entry.node.body)
    ));
  });
  return h("figure", { className: "guide-flow-figure" },
    h("figcaption", { className: "guide-flow-caption" }, flow.title),
    h("svg", {
      className: "guide-flow-svg", viewBox: "0 0 760 " + height,
      role: "img", "aria-labelledby": "guide-flow-title-" + kind + " guide-flow-desc-" + kind,
      xmlns: "http://www.w3.org/2000/svg"
    }, svgChildren),
    h("p", { className: "guide-flow-note" }, flow.note)
  );
};

const GuideRouteCard = ({ icon, title, body, button, onClick, tone }) => {
  const h = React.createElement;
  return h("article", { className: "guide-route-card" + (tone ? " " + tone : "") },
    h("div", { className: "guide-route-card-icon", "aria-hidden": "true" }, h(Icon, { name: icon, size: 18 })),
    h("h3", null, title),
    h("p", null, body),
    h("button", { type: "button", className: "guide-route-button", onClick }, button)
  );
};

const HelpSection = ({ onNavigate, onOpenUtilities }) => {
  const h = React.createElement;
  const [opened, setOpened] = React.useState("imports");
  const openAccounts = () => window.dispatchEvent(new Event("lbt:open-accounts"));
  const go = (section, ui) => onNavigate?.(section, ui || {});
  const groups = [
    { key: "prepare", label: "最初に使うところ", lead: "基本情報・人格・装備を設定します。" },
    { key: "imports", label: "文章や共有URLを取り込む", lead: "人格、リザルト、所持一覧、硝子窓URLの入口を区別します。" },
    { key: "accounts", label: "キャラクター（アカウント）を管理する", lead: "切替・作成・編集・共有URLの取り込み。" },
    { key: "record", label: "記録と所持を管理する", lead: "リザルト、収支、消耗を確認します。" },
    { key: "blocks", label: "必要な項目を確認・編集する", lead: "スキル、パッシブ、精神、強化、設定。" },
    { key: "output", label: "セッション前に確認する", lead: "メモ、パレット、JSONを確認します。" },
    { key: "operation", label: "操作を戻す・探す", lead: "戻す・やり直すと検索を使います。" },
    { key: "save", label: "保存・共有・引き継ぎ", lead: "目的に合う方法を選びます。" }
  ];
  return h("div", { className: "guide stack-4" },
    h("section", { className: "guide-intro" },
      h("div", { className: "guide-kicker" }, "はじめての方へ / 操作ガイド"),
      h("h2", null, "まず「何をしたいか」から選んでください"),
      h("p", null, "ボタンを探し回らなくても済むよう、目的ごとの入口と、その後に押すものをまとめました。PCでは左側、スマートフォンでは画面下部のメニューから移動します。"),
      h("div", { className: "guide-quick" },
        [["1", "キャラクターを選ぶ", "SINNER SELECTで作業するキャラクターを選択します。"], ["2", "人格と装備を整える", "ビルド内の人格を装備し、必要な項目を確認します。"], ["3", "記録または文章を取り込む", "下の目的別カードから正しい取り込み口を選びます。"], ["4", "出力・保存を確認する", "プレビューを確認し、必要なら保存ファイルを作成します。"]].map(([n, t, d]) => h("div", { key: n, className: "guide-step" }, h("span", null, n), h("b", null, t), h("p", null, d)))
      )
    ),
    h("section", { className: "guide-route-panel", "aria-labelledby": "guide-routes-title" },
      h("div", { className: "guide-section-heading" },
        h("h2", { id: "guide-routes-title" }, "やりたいことから、入口へ"),
        h("p", null, "このボタンは目的の画面を開きます。開いた後はカード内の案内に沿って進みます。")),
      h("div", { className: "guide-route-grid" },
        h(GuideRouteCard, { icon: "persona", title: "人格データの文章がある", body: "「ビルド」→「人格」→「テキスト流し込み反映」へ進みます。", button: "ビルドを開く", onClick: () => go("persona"), tone: "is-primary" }),
        h(GuideRouteCard, { icon: "copy", title: "リザルト／購入履歴の文章がある", body: "「記録」→「リザルトを記録」→「取り込む」→「テキスト流し込み」です。", button: "記録を開く", onClick: () => go("roster", { libraryTab: "ledger" }) }),
        h(GuideRouteCard, { icon: "link", title: "硝子窓のキャラクターURLがある", body: "アカウントの編集画面にある「共有URLから取り込む」を使います。", button: "アカウント管理を開く", onClick: openAccounts }),
        h(GuideRouteCard, { icon: "roster", title: "所持人格の名前一覧がある", body: "「記録」→「リザルトを記録」→「取り込む」→「所持人格リストを取り込む」です。", button: "記録を開く", onClick: () => go("roster", { libraryTab: "ledger" }) }),
        h(GuideRouteCard, { icon: "item", title: "未所持アイテム・装備を探したい", body: "ショップで入手するか、ビルド側の「未所持も表示（全体から選ぶ）」を選びます。", button: "ショップを開く", onClick: () => go("shop") }),
        h(GuideRouteCard, { icon: "archive", title: "保存・復元・共有をしたい", body: "作業状態、所持ライブラリ、共有シート、CCFOLIA JSONは用途が違います。", button: "操作・保存を開く", onClick: () => onOpenUtilities?.() })
      )
    ),
    h(GuideFlowDiagram, { kind: "main" }),
    h("section", { className: "guide-visual-section" },
      h("h2", null, "文章の取り込み口を間違えないために"),
      h("p", null, "人格の内容を作る入口と、セッションの報酬・支出を記録する入口は別です。取り込む前に、どの種類のデータなのかを確認してください。"),
      h(GuideFlowDiagram, { kind: "imports" })
    ),
    h("section", { className: "guide-visual-section" },
      h("h2", null, "硝子窓の共有URLからキャラクターを移す"),
      h("p", null, "URLの取り込みは、どのキャラクターの保存領域へ入れるかを先に確認するのが重要です。"),
      h(GuideFlowDiagram, { kind: "account" }),
      h("div", { className: "guide-common-note" }, h(Icon, { name: "info", size: 15 }), h("span", null, "共有URLのキャラクター全体を取り込む操作は、アカウントを編集している時に表示されます。人格だけを取り込みたい場合は、「ビルド」→「人格」→「テキスト流し込み反映」→「硝子窓URLから移行」です。"))
    ),
    h("section", { className: "guide-visual-section" },
      h("h2", null, "保存・共有・出力の違い"),
      h("p", null, "同じ「保存」でも残る内容が異なります。バックアップや別端末への移行は、目的に合ったファイルを選んでください。"),
      h(GuideFlowDiagram, { kind: "save" })
    ),
    h("section", { className: "guide-group guide-beginner is-open", "aria-label": "人格の基本操作" },
      h("div", { className: "guide-group-head guide-beginner-head" },
        h("span", { className: "guide-group-caret", "aria-hidden": true }, "◆"),
        h("span", null,
          h("b", null, "はじめに：人格を選ぶ・作る"),
          h("small", null, "公式人格を卓用に調整するか、オリジナル人格を作るかを選びます。")
        )
      ),
      h("div", { className: "guide-items" },
        h("article", { className: "guide-item" },
          h("div", { className: "guide-item-icon" }, h(Icon, { name: "persona", size: 16 })),
          h("div", null,
            h("h3", null, "公式人格を調整する"),
            h("p", null, "人格を装備して「◈ 同期化して手動編集」を押します。これはステータス・パッシブ・スキル・固有バフを手動編集するモードで、ゲーム上の同期ランク（0・00・000）や同期MAXを設定する操作ではありません。終えるときは「✓ 編集を終了（内容は保持）」を押します。所持人格の保存ビルドとして変更を残すには、変更後に「装備解除」を押し、確認画面でOK（変更を所持人格へ保存して装備解除）を選びます。キャンセルすると装備を継続し、変更は現在の状態に残ります。同期ランクと同期MAXは別設定です。同期ランクは「記録」の所持人格詳細で設定でき、同期MAXはそこに加えて装備中の人格パネルからも切り替えられます。")
          )
        ),
        h("article", { className: "guide-item" },
          h("div", { className: "guide-item-icon" }, h(Icon, { name: "plus", size: 16 })),
          h("div", null,
            h("h3", null, "オリジナル人格を作る"),
            h("p", null, "人格図鑑の「＋ カスタム人格」から名前を入力して作成し、編集後に「この人格を所持に保存」を押します。保存済みのカスタム人格を修正したら「所持人格の保存内容を更新」を押します。完成した人格データの文章がある場合は「テキスト流し込み反映」から解析し、内容を確認して反映できます。")
          )
        )
      )
    ),
    h("div", { className: "guide-common-note" }, h(Icon, { name: "info", size: 15 }), h("span", null, "PCでは左側のナビゲーション、スマートフォンでは画面下部のタブで移動します。「操作・保存」から保存や復元を開けます。プレビューは開閉できます。")),
    groups.map((g) => {
      const items = HELP_ITEMS.filter((item) => item.group === g.key);
      return h("section", { key: g.key, className: "guide-group" + (opened === g.key ? " is-open" : "") },
        h("button", { className: "guide-group-head", onClick: () => setOpened(opened === g.key ? "" : g.key), "aria-expanded": opened === g.key },
          h("span", { className: "guide-group-caret" }, opened === g.key ? "▼" : "▶"),
          h("span", null, h("b", null, g.label), h("small", null, g.lead))
        ),
        opened === g.key && h("div", { className: "guide-items" }, items.map((item) => h("article", { key: item.title, className: "guide-item" },
          h("div", { className: "guide-item-icon" }, h(Icon, { name: item.icon, size: 16 })),
          h("div", null, h("h3", null, item.title), h("p", null, item.body))
        )))
      );
    })
  );
};

const SECTIONS = [
  /* 駒整形 → ビルド → ショップ の順。整えてから選び、選んでから携える。 */
  /* 駒整形（BASEINFO）。装備した人格の同期・固有バフ・戦闘設定をここで整える。 */
  { id: "baseinfo", label: "駒整形", icon: "persona", title: "BASE INFO", subtitle: "装備人格の同期・固有バフ・戦闘設定", num: "01", group: "build" },
  /* ビルドを主とする。人格・スキル・パッシブ・強化・サポート・E.G.O・精神・アイテム は
     BuildWorkspace の8タブ。旧 currentSection 値（skill/passive/enh/support/ego/spirit/
     items-build） も renderSection が受け、移行不要。
     所持ゲートは各タブのフィルタで解除できる（既定は所持のみ）。 */
  { id: "persona", label: "ビルド", icon: "grid", title: "BUILD WORKSPACE", subtitle: "人格・スキル・パッシブ・強化・サポート・E.G.O・精神・アイテム", num: "02", group: "build" },
  /* ショップは所持の唯一の取得口。既定は未所持のみを出す。 */
  { id: "shop", label: "ショップ", icon: "item", title: "SHOP", subtitle: "サポート・E.G.O・精神・アイテムを購入", num: "03", group: "utility" },
  { id: "roster", label: "記録", icon: "roster", title: "CHARACTER RECORD", subtitle: "所持品・リザルト・収支・取り込み", num: null, group: "utility" },
  { id: "settings", label: "設定", icon: "settings", title: "BUILD PARAMETERS", subtitle: "ステータス設計・計算・出力", num: null, group: "utility" },
  { id: "help", label: "使い方", icon: "book", title: "操作ガイド", subtitle: "準備・確認・出力・保存", num: null, group: "utility" }
];

function isComplete(section, s) {
  switch (section) {
    case "persona":
      return !!s.personaSrc;
    case "skill":
      return s.skills.length > 0 && s.skills.every((sk) => sk.name);
    case "passive":
      return !!s.pas.name;
    case "support":
      return s.supports.length > 0;
    case "ego":
      return Object.values(s.egoSlots).some((v) => v);
    case "spirit":
      return !!s.spirit;
    case "enh":
      return true;
    // optional
    case "roster":
      return true;
    case "settings":
      return true;
    // optional
    default:
      return false;
  }
}
function getSessionReadiness(s) {
  return [
    { id: "persona", label: "人格" },
    { id: "skill", label: "スキル" },
    { id: "passive", label: "パッシブ" }
  ].filter((entry) => !isComplete(entry.id, s));
}
window.LBT_getSessionReadiness = getSessionReadiness;
const CommandPalette = ({ open, onClose, state, dispatch }) => {
  const [q, setQ] = React.useState("");
  const [idx, setIdx] = React.useState(0);
  /* 検索で選んだ項目。詳細を出して、取得するかどうかは利用者が決める。 */
  const [picked, setPicked] = React.useState(null);
  const inputRef = React.useRef(null);
  const paletteRef = React.useRef(null);
  const returnFocusRef = React.useRef(null);
  React.useEffect(() => {
if (open) {
returnFocusRef.current = document.activeElement;
/* 開くたびに前回の詳細は捨てる。閉じる側で捨てると、
   項目の選択（run）と閉じる処理が連続radaるため詳細が消えてしまう。 */
setPicked(null);
setTimeout(() => inputRef.current?.focus(), 20);
} else {
    setQ("");
    setIdx(0);
  }
}, [open]);
/* 詳細からの取得。人格は該当の章节へ移して詳細を開かせる。
   検索で選んだだけでは装備も取得もしない。 */
const acquirePicked = () => {
  if (!picked || picked.kind !== "persona") return;
  const { p, m } = picked;
  setPicked(null);
  onClose();
  dispatch({ type: "SET_UI", ui: { currentSection: "persona", personaSearchTarget: { mode: m, no: p.no } } });
};
  /* Escape と Tab を dialog 全体で捕捉する。input の onKeyDown だけに依存すると
     フォーカスが外れた瞬間に Escape が効かなくなる。UtilitySheet と同じ実装。 */
  React.useEffect(() => {
    if (!open) return void 0;
    const getFocusable = () => Array.from(paletteRef.current?.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') || []).filter((node) => node.getClientRects().length > 0);
    const onKeyDown = (event) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab") return;
      const focusable = getFocusable();
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);
  /* 閉じたら呼び出し元へフォーカスを戻す */
  React.useEffect(() => {
    if (open) return;
    const prev = returnFocusRef.current;
    if (prev && typeof prev.focus === "function") prev.focus();
  }, [open]);
  const items = React.useMemo(() => {
    const ql = q.trim().toLowerCase();
    const cmds = [
      ...SECTIONS.map((s) => ({ type: "nav", label: `${s.label} \u30BB\u30AF\u30B7\u30E7\u30F3\u3078\u79FB\u52D5`, kbd: s.num, run: () => dispatch({ type: "SET_UI", ui: { currentSection: s.id } }) })),
      /* ビルドは1画面タブ統合。タブへの直接ジャンプをパレットにも出す。 */
      ...(window.LBT_BUILD_TABS || []).map((t) => ({ type: "nav", label: `ビルド：${t.label}`, kbd: t.num, run: () => dispatch({ type: "SET_UI", ui: { currentSection: t.id } }) })),
      { type: "act", label: "JSON\u3092\u30B3\u30D4\u30FC", kbd: "JSON", run: async () => {
        try {
          await navigator.clipboard.writeText(JSON.stringify(LBT_gen.buildCcfoliaJSON(state)));
          toast("JSON\u3092\u30B3\u30D4\u30FC");
        } catch (e) {
        }
      } },
      { type: "act", label: "\u73FE\u5728\u306E\u4F5C\u696D\u72B6\u614B\u3092\u4FDD\u5B58", keywords: ["\u72B6\u614B\u3092\u30A8\u30AF\u30B9\u30DD\u30FC\u30C8", "\u30A8\u30AF\u30B9\u30DD\u30FC\u30C8", "\u4FDD\u5B58"], kbd: "", run: () => exportState(state) },
      { type: "act", label: "\u3059\u3079\u3066\u30AF\u30EA\u30A2", kbd: "", run: () => {
        if (confirm("\u5165\u529B\u5185\u5BB9\u3092\u3059\u3079\u3066\u30AF\u30EA\u30A2\u3057\u307E\u3059\u304B\uFF1F")) {
          dispatch({ type: "RESET" });
          toast("\u30AF\u30EA\u30A2\u3057\u307E\u3057\u305F");
        }
      } }
    ];
    const personaHits = [];
    const egoHits = [];
    const itemHits = [];
    if (ql) {
      const all = [...DB.normal_personas.map((p) => ({ p, m: "n" })), ...DB.tokui_personas.map((p) => ({ p, m: "t" }))];
all.forEach(({ p, m }) => {
    if ((p.name + " " + p.no).toLowerCase().includes(ql)) {
      personaHits.push({ type: "persona", label: `人格：${p.name}`, kbd: m === "n" ? "通常" : "特異", run: () => {
    /* 選択しただけで装備しない。取得するかどうかは詳細で決める。 */
    setPicked({ kind: "persona", p, m });
  } });
}
});
      (DB.egos || []).forEach((ego) => {
        const haystack = `${ego.name || ""} ${ego.rank || ""} ${ego.resources || ""} ${(ego.keywords || []).join(" ")} ${ego.kakusei?.effect || ""} ${ego.shinshoku?.effect || ""}`.toLowerCase();
        if (haystack.includes(ql)) {
          egoHits.push({ type: "ego", label: `E.G.O：${ego.name}`, kbd: `${ego.rank} / 詳細`, run: () => {
            dispatch({ type: "SET_UI", ui: { currentSection: "ego", egoSearchTarget: { rank: ego.rank, no: ego.no } } });
          } });
        }
      });
      [...(DB.items || []), ...(state.customItems || [])].forEach((item) => {
        const haystack = `${item.name || ""} ${item.category || ""} ${(item.tags || []).join(" ")} ${item.effect || ""}`.toLowerCase();
        if (haystack.includes(ql)) {
          itemHits.push({ type: "item", label: `アイテム：${item.name}`, kbd: "詳細", run: () => {
            dispatch({ type: "SET_UI", ui: { currentSection: "items", itemSearchTarget: { id: item.id } } });
          } });
        }
      });
    }
    const cmdFiltered = ql ? cmds.filter((c) => c.label.toLowerCase().includes(ql) || (c.keywords || []).some((keyword) => keyword.toLowerCase().includes(ql))) : cmds;
    return [...cmdFiltered, ...personaHits.slice(0, 6), ...egoHits.slice(0, 5), ...itemHits.slice(0, 5)];
  }, [q, state]);
  React.useEffect(() => setIdx(0), [q]);
  const onKey = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIdx((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      items[idx]?.run();
      onClose();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };
  const overlay = /* @__PURE__ */ React.createElement("div", { className: `cp-overlay${open ? " is-open" : ""}`, onClick: (e) => e.target === e.currentTarget && onClose() }, /* @__PURE__ */ React.createElement("div", { ref: paletteRef, className: "cp-box", role: "dialog", "aria-modal": "true", "aria-label": "クイック検索" }, /* @__PURE__ */ React.createElement("input", { ref: inputRef, className: "cp-input", "aria-label": "クイック検索：人格・E.G.O・アイテム・操作", placeholder: "\u30AF\u30A4\u30C3\u30AF\u691C\u7D22\uFF1A\u4EBA\u683C\u30FBE.G.O\u30FB\u30A2\u30A4\u30C6\u30E0\u30FB\u64CD\u4F5C\u2026", value: q, onChange: (e) => setQ(e.target.value), onKeyDown: onKey }), /* @__PURE__ */ React.createElement("div", { className: "cp-list", tabIndex: 0 }, items.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "cp-empty" }, "\u8A72\u5F53\u306A\u3057") : items.map((it, i) => /* @__PURE__ */ React.createElement("div", { key: i, className: `cp-item${i === idx ? " sel" : ""}`, onClick: () => {
    it.run();
    onClose();
  }, onMouseMove: () => setIdx(i) }, /* @__PURE__ */ React.createElement("span", { className: "kind" }, it.type === "nav" ? "\u25B8" : it.type === "persona" ? "\u25C8" : it.type === "ego" ? "\u25C7" : it.type === "item" ? "\u25C6" : "\u2318"), /* @__PURE__ */ React.createElement("span", { className: "lbl" }, it.label), it.kbd && /* @__PURE__ */ React.createElement("span", { className: "kbd" }, it.kbd)))), /* @__PURE__ */ React.createElement("div", { className: "cp-hint" }, /* @__PURE__ */ React.createElement("span", null, "\u2191\u2193 \u79FB\u52D5"), /* @__PURE__ */ React.createElement("span", null, "Enter \u8A73\u7D30\u3092\u958B\u304F"), /* @__PURE__ */ React.createElement("span", null, "Esc \u9589\u3058\u308B"))));
  /* 検索で選んだ項目の詳細。選択だけでは装備も取得もしない。 */
  const pickedDetail = picked && picked.kind === "persona" ? /* @__PURE__ */ React.createElement("div", { className: "cp-detail", role: "dialog", "aria-label": picked.p.name + " の詳細" },
    /* @__PURE__ */ React.createElement("div", { className: "cp-detail-head" },
      /* @__PURE__ */ React.createElement("span", { className: "badge" }, picked.m === "t" ? "特異" : "通常"),
      /* @__PURE__ */ React.createElement("strong", null, picked.p.name)
    ),
    /* @__PURE__ */ React.createElement("dl", { className: "cp-detail-stats" },
      /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("dt", null, "HP"), /* @__PURE__ */ React.createElement("dd", null, String(picked.p.hp ?? "—"))),
      /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("dt", null, "SAN"), /* @__PURE__ */ React.createElement("dd", null, String(picked.p.san ?? "—"))),
      /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("dt", null, "速度"), /* @__PURE__ */ React.createElement("dd", null, String(picked.p.speed ?? "—"))),
      /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("dt", null, "パッシブ"), /* @__PURE__ */ React.createElement("dd", null, String(picked.p.passive_name ?? "—")))
    ),
    picked.p.passive_effect ? /* @__PURE__ */ React.createElement("p", { className: "cp-detail-text" }, String(picked.p.passive_effect)) : null,
    (picked.p.skills || []).slice(0, 4).map((skill, n) => /* @__PURE__ */ React.createElement("p", { key: n, className: "cp-detail-skill" },
      [skill.type, skill.sin].filter(Boolean).join("：") + " " + (skill.name || "")
    )),
    /* @__PURE__ */ React.createElement("div", { className: "cp-detail-acts" },
      /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-primary btn-sm", onClick: acquirePicked }, "この人格を取得する"),
      /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-ghost btn-sm", onClick: () => setPicked(null) }, "戻る")
    ),
    /* @__PURE__ */ React.createElement("p", { className: "cp-detail-hint" }, "選択しただけでは装備しません。取得はここで確定します。")
  ) : null;
  return /* @__PURE__ */ React.createElement("div", { className: "cp-layer" }, overlay, pickedDetail);
};
function exportState(state) {
  const { ui, ...data } = state;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  const _pn = state.personaSrc?.name ? `_${state.personaSrc.name.replace(/[\\/:*?"<>|\s]+/g, "")}` : "";
  a.download = `${(state.charName || "character").replace(/[\\/:*?"<>|\s]+/g, "")}${_pn}_current-work_lbt.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1e3);
  toast("\u73FE\u5728\u306E\u4F5C\u696D\u72B6\u614B\u3092\u4FDD\u5B58\u3057\u307E\u3057\u305F");
}
/* V22: 所持人格・所持E.G.Oのみを単体ファイルとしてエクスポートする。
   統合セーブデータから分離し、所持データだけを別端末へ引き継ぐ運用を可能にする。
   編集済み人格（build）は roster エントリに内包されるため、そのまま持ち運べる。 */
function exportRoster(state) {
  const payload = {
    schemaVersion: state.schemaVersion || 2,
    _lbtRosterOnly: true,
    exportedAt: new Date().toISOString(),
    roster: state.roster || { personas: [], egos: [] },
    favorites: state.favorites || [],
    historyRecent: state.historyRecent || []
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  const cn = (state.charName || "character").replace(/[\\/:*?"<>|\s]+/g, "");
  a.download = `${cn}_owned-library_lbt.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1e3);
  toast("所持ライブラリを保存しました");
}

/* T26: セーブデータのカテゴリ定義（部分ロード用）。
   各カテゴリはトップレベル state フィールドの集合。 */
const IMPORT_GROUPS = [
  { key: "persona", label: "\u88C5\u5099\u4EBA\u683C\u30FB\u57FA\u672C\u60C5\u5831", fields: ["charName","plName","imgUrls","shareImageData","color","initiative","personaMode","personaNo","personaSrc","syncedManual","hp","san","speed","bullets","resS","resP","resB"] },
  { key: "skills", label: "\u30B9\u30AD\u30EB\uFF08\u6D3E\u751F\u542B\u3080\uFF09", fields: ["skills"] },
  { key: "passive", label: "\u30D1\u30C3\u30B7\u30D6", fields: ["pas","pas2Enabled","pas2","extraPassives"] },
  { key: "support", label: "\u30B5\u30DD\u30FC\u30C8\u30D1\u30C3\u30B7\u30D6\uFF08\u6B7B\u4EA1\u5F8C\u542B\u3080\uFF09", fields: ["supports","deathSupport"] },
  { key: "ego", label: "E.G.O\u88C5\u5099", fields: ["egoSlots"] },
  { key: "mental", label: "\u7CBE\u795E", fields: ["spirit","spiritMorale","spiritConfuse","spiritAlways"] },
  { key: "roster", label: "所持ライブラリ", fields: ["roster"] },
  { key: "ledger", label: "\u901A\u5E33\uFF08\u30EA\u30B6\u30EB\u30C8\u3068\u6536\u652F\u660E\u7D30\uFF09", fields: ["results", "entries"] },
  { key: "gacha", label: "抽選記録・旧セーブ移行データ", fields: ["gachaLog","draws","tickets"] },
  { key: "usage-history", label: "お気に入り・最近の履歴", fields: ["favorites","historyRecent"] },
  { key: "status", label: "\u30B9\u30C6\u30FC\u30BF\u30B9\u30FB\u56FA\u6709\u30D0\u30D5\u30FB\u51FA\u529B\u8A2D\u5B9A", fields: ["uniqueBuffs","customStatuses","defaultStatuses","outputExclude","shareOptions","paletteOptions"] },
  { key: "enh", label: "\u7279\u6B8A\u5F37\u5316", fields: ["enhancements"] },
  { key: "items", label: "\u5C0E\u5165\u6E08\u307F\u30A2\u30A4\u30C6\u30E0", fields: ["inventory","initialItems","customItems"] },
  { key: "formulas", label: "\u4EE3\u5165\u5F0F\u30FB\u305D\u306E\u4ED6\u8A2D\u5B9A", fields: ["formulas","builtinFormulasOverride","autoFml","moraleLine","extraCmd"] }
];
/* Partial JSON import checks caps against the definitions that will actually be used.
   normalizeStateShape clamps over-cap quantities; reject beforehand instead of reporting a successful
   import that silently reduces the number of owned items. */
function validateImportedInventoryCaps(data, fields, currentState) {
  const selectedFields = new Set(Array.isArray(fields) ? fields : []);
  if (!selectedFields.has("inventory") || !Array.isArray(data?.inventory)) return null;

  /* If custom item definitions are included in the selected import, validate against those;
     otherwise the existing definitions in the current state remain authoritative. */
  const useIncomingCustomItems = selectedFields.has("customItems")
    && Object.prototype.hasOwnProperty.call(data, "customItems")
    && Array.isArray(data.customItems);
  const customItems = useIncomingCustomItems
    ? data.customItems
    : (Array.isArray(currentState?.customItems) ? currentState.customItems : []);
  const candidateState = { customItems };

  const parseQuantity = (value) => {
    if (value === void 0 || value === null || value === "") return 1;
    if (typeof value === "number") return Number.isSafeInteger(value) && value > 0 ? value : null;
    if (typeof value !== "string" || !/^\d+$/.test(value.trim())) return null;
    const parsed = Number(value.trim());
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  };

  /* normalizeStateShape coalesces repeated item IDs into one stack, so validate the
     same aggregate here rather than allowing individually-valid rows to be silently capped. */
  const quantitiesByItemId = new Map();
  for (let i = 0; i < data.inventory.length; i += 1) {
    const entry = data.inventory[i];
    const itemId = typeof entry?.itemId === "string" ? entry.itemId.trim() : "";
    if (!itemId) continue; // validateImportData reports missing IDs before the dialog opens.

    const quantity = parseQuantity(entry.quantity);
    if (quantity === null) return "inventory[" + i + "].quantity は1以上の整数で入力してください";
    const group = quantitiesByItemId.get(itemId) || { quantity: 0, lastIndex: i };
    const total = group.quantity + quantity;
    if (!Number.isSafeInteger(total)) {
      return "inventory[" + i + "].quantity の合計が安全な整数の範囲を超えています";
    }
    group.quantity = total;
    group.lastIndex = i;
    quantitiesByItemId.set(itemId, group);
  }

  for (const [itemId, incoming] of quantitiesByItemId) {
    const rawMaximum = window.LBT_getItemMaxOwned?.(candidateState, itemId);
    const maximum = Number.isSafeInteger(rawMaximum) && rawMaximum > 0 ? rawMaximum : 99;
    if (incoming.quantity <= maximum) continue;

    const official = Array.isArray(window.DB?.items)
      ? window.DB.items.find((item) => item?.id === itemId) : null;
    const custom = customItems.find((item) => item?.id === itemId) || null;
    const itemName = String((official || custom)?.name || itemId);
    return "inventory[" + incoming.lastIndex + "]「" + itemName + "」の合計数量 " + incoming.quantity
      + " 個は所持上限 " + maximum + " 個を超えています";
  }
  return null;
}
function filterInventoryImportActions(actions, state) {
  const source = Array.isArray(actions) ? actions : [];
  const inventory = Array.isArray(state?.inventory) ? state.inventory : [];
  const parseQuantity = (value) => {
    if (value === void 0 || value === null || value === "") return 1;
    if (typeof value === "number") return Number.isSafeInteger(value) && value > 0 ? value : null;
    if (typeof value !== "string" || !/^\d+$/.test(value.trim())) return null;
    const parsed = Number(value.trim());
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  };

  const rejectedActions = new Set();
  const skipped = [];
  const quantitiesByItem = new Map();

  for (const action of source) {
    if (action?.type !== "ADD_ITEM_INVENTORY") continue;
    const itemId = typeof action.itemId === "string" ? action.itemId.trim() : "";
    if (!itemId) {
      rejectedActions.add(action);
      skipped.push({ key: "", reason: "アイテムIDがありません" });
      continue;
    }
    const quantity = parseQuantity(action.quantity);
    if (quantity === null) {
      rejectedActions.add(action);
      skipped.push({ key: itemId, reason: "アイテムの個数が正の整数ではありません" });
      continue;
    }
    const group = quantitiesByItem.get(itemId) || { quantity: 0 };
    group.quantity += quantity;
    quantitiesByItem.set(itemId, group);
  }

  const overCapItemIds = new Set();
  for (const [itemId, incoming] of quantitiesByItem) {
    const currentQuantity = inventory.reduce((sum, entry) => {
      if (entry?.itemId !== itemId) return sum;
      const quantity = Number(entry.quantity);
      return sum + (Number.isFinite(quantity) && quantity > 0 ? quantity : 0);
    }, 0);
    let maximum = 99;
    try {
      const rawMaximum = window.LBT_getItemMaxOwned?.(state, itemId);
      if (Number.isSafeInteger(rawMaximum) && rawMaximum > 0) maximum = Math.min(99, rawMaximum);
    } catch (_) {
      /* If catalog metadata is unavailable, use the same default cap as the reducer. */
    }
    if (currentQuantity + incoming.quantity <= maximum) continue;
    overCapItemIds.add(itemId);
    const official = Array.isArray(window.DB?.items)
      ? window.DB.items.find((item) => item?.id === itemId) : null;
    const custom = Array.isArray(state?.customItems)
      ? state.customItems.find((item) => item?.id === itemId) : null;
    const name = String((official || custom)?.name || itemId);
    skipped.push({
      key: itemId,
      reason: "「" + name + "」は所持上限×" + maximum + "を超えるため未取り込み（現在"
        + currentQuantity + "個／追加" + incoming.quantity + "個）"
    });
  }

  return {
    actions: source.filter((action) => action?.type !== "ADD_ITEM_INVENTORY"
      || (!rejectedActions.has(action) && !overCapItemIds.has(String(action.itemId || "").trim()))),
    skipped
  };
}

function validateImportData(data) {
  // 既知の構造のみ受け入れる。壊れたデータの部分適用で state を壊さない。
  if (!data || typeof data !== "object" || Array.isArray(data)) return "オブジェクト形式ではありません";

  const isRecord = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
  const validateRecordArray = (value, path) => {
    if (value === void 0) return null;
    if (!Array.isArray(value)) return path + " は配列ではありません";
    const badIndex = value.findIndex((entry) => !isRecord(entry));
    return badIndex < 0 ? null : path + "[" + badIndex + "] はオブジェクトではありません";
  };
  const validateSkillArray = (value, path) => {
    const arrayError = validateRecordArray(value, path);
    if (arrayError) return arrayError;
    if (!Array.isArray(value)) return null;
    for (let i = 0; i < value.length; i += 1) {
      const diceError = validateRecordArray(value[i].dice, path + "[" + i + "].dice");
      if (diceError) return diceError;
    }
    return null;
  };
  const validatePersonaSource = (value, path) => {
    if (value === void 0 || value === null) return null;
    if (!isRecord(value)) return path + " はオブジェクトではありません";
    const skillError = validateSkillArray(value.skills, path + ".skills");
    if (skillError) return skillError;
    const buffError = validateRecordArray(value.unique_buffs, path + ".unique_buffs");
    if (buffError) return buffError;
    // Custom Persona secondary passives are part of the source definition and must
    // survive equip/save/import just like the primary passive and skills.
    const extraPassiveError = validateRecordArray(value.extra_passives, path + ".extra_passives");
    if (extraPassiveError) return extraPassiveError;
    if (value.keywords !== void 0 && (!Array.isArray(value.keywords)
      || value.keywords.some((keyword) => typeof keyword !== "string"))) {
      return path + ".keywords は文字列配列ではありません";
    }
    return null;
  };

  const rootSkillError = validateSkillArray(data.skills, "skills");
  if (rootSkillError) return rootSkillError;
  const personaSourceError = validatePersonaSource(data.personaSrc, "personaSrc");
  if (personaSourceError) return personaSourceError;
  // null は「DB既定を使う」正常値。配列なら各状態がオブジェクトであることを要求する。
  if (data.defaultStatuses !== void 0 && data.defaultStatuses !== null) {
    const statusError = validateRecordArray(data.defaultStatuses, "defaultStatuses");
    if (statusError) return statusError;
  }
  if (data.outputExclude !== void 0 && data.outputExclude !== null) {
    if (!isRecord(data.outputExclude)) return "outputExclude はオブジェクトではありません";
    for (const group of ["memo", "palette"]) {
      const map = data.outputExclude[group];
      if (map !== void 0 && !isRecord(map)) return "outputExclude." + group + " はオブジェクトではありません";
      if (isRecord(map)) {
        const badKey = Object.entries(map).find(([, enabled]) => typeof enabled !== "boolean");
        if (badKey) return "outputExclude." + group + "." + badKey[0] + " は真偽値ではありません";
      }
    }
  }
  if (data.builtinFormulasOverride !== void 0 && data.builtinFormulasOverride !== null) {
    if (!isRecord(data.builtinFormulasOverride)) return "builtinFormulasOverride はオブジェクトではありません";
    const badOverride = Object.entries(data.builtinFormulasOverride).find(([, value]) => value !== null && typeof value !== "string");
    if (badOverride) return "builtinFormulasOverride." + badOverride[0] + " は文字列またはnullではありません";
  }
  if (data.egoSlots !== void 0 && data.egoSlots !== null) {
    if (!isRecord(data.egoSlots)) return "egoSlots はオブジェクトではありません";
    const validRanks = new Set(["ZAYIN", "TETH", "HE", "WAW", "ALEPH"]);
    for (const [rank, slot] of Object.entries(data.egoSlots)) {
      if (!validRanks.has(rank)) return "egoSlots." + rank + " は未知のランクです";
      if (slot !== null && !isRecord(slot)) return "egoSlots." + rank + " はオブジェクトまたはnullではありません";
    }
  }

  // 未解決の旧チケット行は移行のために保持する。形式そのものが壊れている場合だけ拒否し、
  // パック名なし／不明な種類など、移行不能なレコード内容は勝手に捨てない。
  if (data.tickets !== void 0) {
    if (Array.isArray(data.tickets)) {
      const badIndex = data.tickets.findIndex((ticket) => !isRecord(ticket));
      if (badIndex >= 0) return "tickets[" + badIndex + "] はオブジェクトではありません";
    } else if (isRecord(data.tickets)) {
      const badKey = Object.entries(data.tickets).find(([, count]) =>
        count !== null && typeof count !== "number" && typeof count !== "string"
      );
      if (badKey) return "tickets." + badKey[0] + " は数値または数値文字列ではありません";
    } else {
      return "tickets は配列またはオブジェクトではありません";
    }
  }

  // インポートに使う配列フィールドは適用前に型を確認する。
  const arrayFields = [
    "skills", "supports", "gachaLog", "draws", "results", "entries", "inventory", "formulas",
    "initialItems", "customItems", "enhancements", "uniqueBuffs", "extraPassives",
    "customStatuses", "favorites", "historyRecent"
  ];
  for (const field of arrayFields) {
    if (data[field] !== void 0 && !Array.isArray(data[field])) {
      return field + " は配列ではありません";
    }
  }

  // reducer の正規化処理は results / entries の各要素をレコードとして参照する。
  // JSON として有効でも [null] や ["broken"] が入ると、適用時に例外または静かな欠損を起こす。
  const objectArrayFields = [
    "skills", "supports", "gachaLog", "draws", "results", "entries", "inventory", "formulas",
    "customItems", "enhancements", "uniqueBuffs", "extraPassives", "customStatuses"
  ];
  for (const field of objectArrayFields) {
    if (!Array.isArray(data[field])) continue;
    const badIndex = data[field].findIndex((item) =>
      !item || typeof item !== "object" || Array.isArray(item)
    );
    if (badIndex >= 0) return field + "[" + badIndex + "] はオブジェクトではありません";
  }

  // 所持アイテムとオリジナルアイテムの数量・上限も部分一致で解釈しない。
  // normalizeStateShape は破損したローカルセーブを安全な既定値へ直すが、
  // JSONインポートは数量が変わってしまう前に項目パス付きで拒否する。
  const isPositiveIntegerCount = (value) => {
    if (value === void 0 || value === null || value === "") return true;
    if (typeof value === "number") return Number.isSafeInteger(value) && value > 0;
    if (typeof value !== "string") return false;
    const text = value.trim();
    if (!/^\d+$/.test(text)) return false;
    const number = Number(text);
    return Number.isSafeInteger(number) && number > 0;
  };
  const seenInventoryItemIds = new Set();
  for (let i = 0; i < (data.inventory || []).length; i += 1) {
    const itemId = typeof data.inventory[i].itemId === "string" ? data.inventory[i].itemId.trim() : "";
    if (!itemId) return "inventory[" + i + "].itemId は空でない文字列で入力してください";
    if (seenInventoryItemIds.has(itemId)) {
      return "inventory[" + i + "] に重複 itemId " + itemId + " があります";
    }
    seenInventoryItemIds.add(itemId);
    if (!isPositiveIntegerCount(data.inventory[i].quantity)) {
      return "inventory[" + i + "].quantity は1以上の整数で入力してください";
    }
  }
  for (let i = 0; i < (data.customItems || []).length; i += 1) {
    if (!isPositiveIntegerCount(data.customItems[i].maxOwned)) {
      return "customItems[" + i + "].maxOwned は正の整数または未指定で入力してください";
    }
  }

  // 通帳の通貨／チケット数量は部分一致の parseInt で解釈しない。
  // 不正な金額を正規化時に0へ落とすだけだと、バックアップを取り込めたように見えて
  // 収入や支出の数字だけ消えるため、適用前に項目パス付きで拒否する。
  const isNonNegativeIntegerAmount = (value) => {
    if (value === void 0 || value === null || value === "") return true;
    if (typeof value === "number") return Number.isSafeInteger(value) && value >= 0;
    if (typeof value !== "string") return false;
    const text = value.trim();
    if (!/^\+?(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(text)) return false;
    const number = Number(text.replace(/,/g, ""));
    return Number.isSafeInteger(number) && number >= 0;
  };
  const validateMoneyObject = (value, path) => {
    if (value === void 0 || value === null) return null;
    if (!isRecord(value)) return path + " はオブジェクトではありません";
    for (const currency of ["lp", "shards"]) {
      if (!isNonNegativeIntegerAmount(value[currency])) {
        return path + "." + currency + " は0以上の整数で入力してください";
      }
    }
    return null;
  };
  const validateTicketCounts = (value, path) => {
    if (value === void 0 || value === null) return null;
    if (!isRecord(value)) return path + " はオブジェクトではありません";
    for (const kind of ["persona", "ego", "choice"]) {
      if (!isNonNegativeIntegerAmount(value[kind])) {
        return path + "." + kind + " は0以上の整数で入力してください";
      }
    }
    if (value.pack !== void 0 && value.pack !== null) {
      if (!isRecord(value.pack)) return path + ".pack はオブジェクトではありません";
      for (const [name, count] of Object.entries(value.pack)) {
        if (!isNonNegativeIntegerAmount(count)) {
          return path + ".pack." + name + " は0以上の整数で入力してください";
        }
      }
    }
    return null;
  };
  for (let i = 0; i < (data.results || []).length; i += 1) {
    const result = data.results[i];
    for (const [field, value] of [["income", result.income], ["exchange", result.exchange]]) {
      const error = validateMoneyObject(value, "results[" + i + "]." + field);
      if (error) return error;
    }
    const ticketError = validateTicketCounts(result.income?.tickets, "results[" + i + "].income.tickets");
    if (ticketError) return ticketError;
  }
  for (let i = 0; i < (data.entries || []).length; i += 1) {
    const entry = data.entries[i];
    const moneyError = validateMoneyObject(entry.cost, "entries[" + i + "].cost");
    if (moneyError) return moneyError;
    const ticketError = validateTicketCounts(entry.tickets, "entries[" + i + "].tickets");
    if (ticketError) return ticketError;
  }

  // 抽選の封緘記録は検証単位の records を必要とする。壊れたバッチを
  // 正規化時に黙って捨てるのではなく、インポート時点で明示的に拒否する。
  if (Array.isArray(data.draws)) {
    const seenProofKeys = new Set();
    for (let i = 0; i < data.draws.length; i += 1) {
      const batch = data.draws[i];
      if (!Array.isArray(batch.records)) return "draws[" + i + "].records は配列ではありません";
      const proofKey = String(batch.batchHash || batch.commit || "").trim();
      if (!proofKey) return "draws[" + i + "] に batchHash または commit がありません";
      if (seenProofKeys.has(proofKey)) {
        return "draws[" + i + "] に重複した証明キー " + proofKey + " があります";
      }
      seenProofKeys.add(proofKey);
      const badRecord = batch.records.findIndex((record) =>
        !record || typeof record !== "object" || Array.isArray(record)
      );
      if (badRecord >= 0) return "draws[" + i + "].records[" + badRecord + "] はオブジェクトではありません";
    }
  }

  // 抽選ログは封緘バッチとは別に表示されるが、同じ明示IDを複数行受け入れると
  // 画面上で同じ抽選の件数・結果を二重に数えうる。IDなしの旧ログは互換のため許容する。
  if (Array.isArray(data.gachaLog)) {
    const seenLogIds = new Set();
    for (let i = 0; i < data.gachaLog.length; i += 1) {
      const id = String(data.gachaLog[i].id ?? "").trim();
      if (!id) continue;
      if (seenLogIds.has(id)) return "gachaLog[" + i + "] に重複ID " + id + " があります";
      seenLogIds.add(id);
    }
  }

  // ID重複は編集／削除／帰属操作が複数行へ誤爆する。古いレコードでIDが無いものは
  // state 正規化が採番するため許容し、同じIDを明示したレコードだけを拒否する。
  for (const field of ["results", "entries"]) {
    if (!Array.isArray(data[field])) continue;
    const seenIds = new Set();
    for (let i = 0; i < data[field].length; i += 1) {
      const id = String(data[field][i].id ?? "").trim();
      if (!id) continue;
      if (seenIds.has(id)) return field + "[" + i + "] に重複ID " + id + " があります";
      seenIds.add(id);
    }
  }

  // 所持ライブラリの単独ファイル／通常セーブのどちらも、roster配下の配列を検証する。
  if (data.roster !== void 0) {
    if (!data.roster || typeof data.roster !== "object" || Array.isArray(data.roster)) {
      return "roster はオブジェクトではありません";
    }
    for (const field of ["personas", "egos", "supports", "spirits"]) {
      if (data.roster[field] !== void 0 && !Array.isArray(data.roster[field])) {
        return "roster." + field + " は配列ではありません";
      }
      if (Array.isArray(data.roster[field])) {
        const badIndex = data.roster[field].findIndex((entry) =>
          !entry || typeof entry !== "object" || Array.isArray(entry)
        );
        if (badIndex >= 0) return "roster." + field + "[" + badIndex + "] はオブジェクトではありません";
      }
    }
    for (let i = 0; i < (data.roster.personas || []).length; i += 1) {
      const persona = data.roster.personas[i];
      const path = "roster.personas[" + i + "]";
      const sourceError = validatePersonaSource(persona.src, path + ".src");
      if (sourceError) return sourceError;
      if (persona.build !== void 0 && persona.build !== null) {
        if (!isRecord(persona.build)) return path + ".build はオブジェクトではありません";
        const buildSkillError = validateSkillArray(persona.build.skills, path + ".build.skills");
        if (buildSkillError) return buildSkillError;
        for (const field of ["uniqueBuffs", "extraPassives", "supports", "enhancements", "customStatuses", "formulas"]) {
          const error = validateRecordArray(persona.build[field], path + ".build." + field);
          if (error) return error;
        }
        const buildSourceError = validatePersonaSource(persona.build.personaSrc, path + ".build.personaSrc");
        if (buildSourceError) return buildSourceError;
      }
    }
    for (let i = 0; i < (data.roster.egos || []).length; i += 1) {
      const build = data.roster.egos[i].build;
      if (build !== void 0 && build !== null && !isRecord(build)) {
        return "roster.egos[" + i + "].build はオブジェクトではありません";
      }
    }
  }

  // ID/UID は編集・削除・通帳帰属で対象レコードを指定するキー。
  // JSONとして有効でも同じキーが複数あると、一操作で複数行を更新／削除し、
  // 異なる所持品の支出明細まで一緒に消す可能性がある。古い形式でキーが無い
  // レコードは正規化で採番するため許容し、明示された重複だけを拒否する。
  const validateUniqueIdentity = (rows, field, path, skipEntry = null) => {
    if (!Array.isArray(rows)) return null;
    const seen = new Set();
    for (let i = 0; i < rows.length; i += 1) {
      if (typeof skipEntry === "function" && skipEntry(rows[i])) continue;
      const raw = rows[i]?.[field];
      if (raw === void 0 || raw === null || String(raw).trim() === "") continue;
      const id = String(raw).trim();
      if (seen.has(id)) return path + "[" + i + "] に重複" + field + " " + id + " があります";
      seen.add(id);
    }
    return null;
  };
  const identityCollections = [
    ["skills", data.skills, "id"],
    ["supports", data.supports, "id"],
    ["inventory", data.inventory, "uid"],
    ["customItems", data.customItems, "id"],
    ["enhancements", data.enhancements, "id"],
    ["uniqueBuffs", data.uniqueBuffs, "id"],
    ["extraPassives", data.extraPassives, "id"],
    ["customStatuses", data.customStatuses, "id"],
    ["formulas", data.formulas, "id"]
  ];
  for (const [path, rows, field] of identityCollections) {
    const error = validateUniqueIdentity(rows, field, path);
    if (error) return error;
  }
  if (data.roster) {
    for (const [field, rows] of [
      ["personas", data.roster.personas],
      ["egos", data.roster.egos],
      ["supports", data.roster.supports],
      ["spirits", data.roster.spirits]
    ]) {
      /* Custom Persona UID collisions are repairable: normalizeCustomPersonaRosterIdentity
         deterministically assigns fresh IDs while preserving each source/build record. */
      const skipRepairableCustomUid = field === "personas" ? (entry) => entry?.mode === "custom" : null;
      const error = validateUniqueIdentity(rows, "uid", "roster." + field, skipRepairableCustomUid);
      if (error) return error;
    }
    const personaKeys = new Set();
    for (let i = 0; i < (data.roster.personas || []).length; i += 1) {
      const persona = data.roster.personas[i];
      /* Custom Persona source.no was historically a shared 999 placeholder.
         Their owned identity is uid/no after migration, so treating every custom
         source as a normal Persona falsely rejects valid legacy multi-custom saves. */
      if (persona.mode === "custom") continue;
      const no = String(persona.no ?? "").trim();
      if (!no) continue; // 旧形式で識別子のない行は既存の互換処理へ任せる
      const key = (persona.mode === "t" ? "t:" : "n:") + no;
      if (personaKeys.has(key)) return "roster.personas[" + i + "] に重複人格 " + key + " があります";
      personaKeys.add(key);
    }
    const egoKeys = new Set();
    for (let i = 0; i < (data.roster.egos || []).length; i += 1) {
      const ego = data.roster.egos[i];
      const no = String(ego.no ?? "").trim();
      const rank = String(ego.rank ?? "").trim();
      if (!no || !rank) continue;
      const key = rank + ":" + no;
      if (egoKeys.has(key)) return "roster.egos[" + i + "] に重複E.G.O " + key + " があります";
      egoKeys.add(key);
    }
    for (const field of ["supports", "spirits"]) {
      const names = new Set();
      const rows = data.roster[field] || [];
      for (let i = 0; i < rows.length; i += 1) {
        const name = String(rows[i].name ?? "").trim();
        if (!name) continue;
        if (names.has(name)) return "roster." + field + "[" + i + "] に重複名称 " + name + " があります";
        names.add(name);
      }
    }
  }

  // V22: roster 単体ファイル（所持人格/E.G.Oのみ）はここで検証後に受け入れる。
  if (data._lbtRosterOnly) {
    if (!data.roster) return "roster 単体ファイルに所持データがありません";
    return null;
  }

  const known = IMPORT_GROUPS.flatMap((g) => g.fields).concat(["schemaVersion", "ui"]);
  const unknown = Object.keys(data).filter((k) => !known.includes(k));
  if (unknown.length > Object.keys(data).length * 0.8 && unknown.length > 3) {
    return "LBTのセーブデータではない可能性があります";
  }
  return null;
}

function importStateFromFile(file, dispatch) {
  const rd = new FileReader();
  rd.onload = () => {
    let data = null;
    try {
      data = JSON.parse(rd.result);
    } catch (e) {
      toast("\u30A4\u30F3\u30DD\u30FC\u30C8\u5931\u6557\uFF08JSON\u3068\u3057\u3066\u8AAD\u3081\u307E\u305B\u3093\uFF09");
      return;
    }
    const err = validateImportData(data);
    if (err) {
      toast("\u30A4\u30F3\u30DD\u30FC\u30C8\u5931\u6557: " + err);
      return;
    }
    // 部分ロードの選択ダイアログを表示（全選択が既定）
    window.LBT_openImportDialog && window.LBT_openImportDialog(data);
  };
  rd.readAsText(file);
}

const UtilitySheet = ({ open, onClose, actions, sections, currentSection, onNavigate }) => {
  const utilitySheetRef = React.useRef(null);
  React.useEffect(() => {
    if (!open) return void 0;
    const getFocusable = () => Array.from(utilitySheetRef.current?.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') || []).filter((node) => node.getClientRects().length > 0);
    const focusInitialControl = () => getFocusable()[0]?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
      if (event.key !== "Tab") return;
      const focusable = getFocusable();
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const focusFrame = requestAnimationFrame(focusInitialControl);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);
  if (!open) return null;
  const h = React.createElement;
  const activate = (fn) => { fn(); onClose(); };
  return h("div", { className: "utility-sheet-backdrop", onClick: (e) => e.target === e.currentTarget && onClose() },
    h("section", { ref: utilitySheetRef, className: "utility-sheet", role: "dialog", "aria-modal": "true", "aria-label": "操作と保存" },
      h("div", { className: "utility-sheet-head" },
        h("div", null, h("span", { className: "utility-sheet-kicker" }, "ACTIONS"), h("h2", null, "操作・保存"), h("p", null, "保存対象と表示操作を、用途の説明とともに選べます。")),
        h("button", { type: "button", className: "utility-sheet-close", onClick: onClose, "aria-label": "操作メニューを閉じる" }, h(Icon, { name: "x", size: 18 }))
      ),
      h("div", { className: "utility-sheet-grid" }, actions.map((action) => h("button", {
        type: "button", key: action.key, className: `utility-sheet-action${action.tone ? ` ${action.tone}` : ""}`,
        onClick: () => activate(action.onClick)
      }, h("span", { className: "utility-sheet-icon" }, h(Icon, { name: action.icon, size: 18 })), h("span", { className: "utility-sheet-copy" }, action.scope && h("span", { className: "utility-sheet-scope" }, action.scope), h("b", null, action.label), h("small", null, action.note))))),
      h("div", { className: "utility-sheet-section" },
        h("span", { className: "utility-sheet-kicker" }, "OTHER SECTIONS"),
        h("p", null, "構築の補助、保存済みデータ、設定、ガイドへ移動します。"),
        h("div", { className: "utility-section-grid" }, sections.map((section) => h("button", {
          key: section.id, type: "button", className: `utility-section-link${currentSection === section.id ? " is-active" : ""}`,
          "aria-current": currentSection === section.id ? "page" : void 0,
          onClick: () => { onNavigate(section.id); onClose(); }
        }, h(Icon, { name: section.icon, size: 16 }), h("span", null, section.label))))
      )
    )
  );
};

/* 免責事項の本文。.topbar 左の鮭マーク（作者・しゃけ）から開く。 */
const DISCLAIMER_BLOCKS = [
  { head: "このツールについて", body: "本ツールは「リンバスTRPG ルールブック（以下LBT）」ユーザーの支援を目的とした非公式ツールです。" },
  { head: "公式ではありません", body: "本ツールは、原著作権者・権利者・関連企業等が公式に提供・承認・監修しているものではありません。" },
  { head: "LBT での解釈について", body: "LBTにおいては、原作者であるProject Moonが明確に定義していない事項について、原作の設定や描写に基づく解釈から定められたルールやデータが存在します。しかし、本ツールはそのような解釈を公式設定として提示すること、または原作に対する特定の解釈を示すことを意図したものではありません。" },
  { head: "正確性は保証しません", body: "本ツールに掲載・表示される情報については、可能な限り正確な内容となるよう努めていますが、その完全性、正確性、最新性を保証するものではありません。ルールの裁定やゲーム上の処理については、必ず公式の「リンバスTRPG ルールブック」および関連する公式資料を確認してください。" },
  { head: "損害について", body: "本ツールの利用によって生じた損害、データの消失、誤ったルール適用、その他のトラブルについて、運営者は責任を負いかねます。ただし、法令上免責することが認められない事項については、この限りではありません。" },
  { head: "原著作物の代替ではありません", body: "本ツールは原著作物そのものを代替することを目的としたものではありません。ルールブックその他資料の利用を妨げるものではなく、あくまでユーザーによるゲームプレイやキャラクター管理等を補助することを目的としています。" },
  { head: "名称・著作物の権利", body: "本ツールで使用される名称、設定、画像、文章その他の著作物について、運営者が権利を主張するものではありません。権利者からの申し立てや要請があった場合には、必要に応じて該当するコンテンツの修正・削除等を行う場合があります。" },
];

const DisclaimerSheet = ({ open, onClose }) => {
  const h = React.createElement;
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!open) return;
    const prev = document.activeElement;
    const focusable = () => ref.current?.querySelectorAll('button:not([disabled]), [href], a[href], [tabindex]:not([tabindex="-1"])');
    focusable()?.[0]?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); return; }
      if (e.key !== "Tab") return;
      const list = focusable();
      if (!list?.length) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey, true);
    return () => { document.removeEventListener("keydown", onKey, true); if (prev && prev.focus) prev.focus(); };
  }, [open]);
  if (!open) return null;
  return h("div", { className: "utility-sheet-backdrop", onClick: (e) => e.target === e.currentTarget && onClose() },
    h("section", { ref, className: "utility-sheet disclaimer-sheet", role: "dialog", "aria-modal": "true", "aria-label": "免責事項" },
      h("div", { className: "utility-sheet-head" },
        h("div", null,
          h("span", { className: "utility-sheet-kicker" }, "DISCLAIMER"),
          h("h2", null, "免責事項"),
          h("p", null, "本ツールは非公式のファンによる補助ツールです。実際の裁定は必ず公式のルールブックと関連資料で確認してください。")),
        h("button", { type: "button", className: "utility-sheet-close", onClick: onClose, "aria-label": "免責事項を閉じる" }, h(Icon, { name: "x", size: 18 }))),
      h("div", { className: "disclaimer-body" },
        DISCLAIMER_BLOCKS.map((b, i) => h("section", { key: i, className: "disclaimer-block" },
          h("h3", null, b.head),
          h("p", null, b.body)))),
      h("p", { className: "disclaimer-sign" },
        h("span", { className: "brand-author-fish" }, h(Icon, { name: "salmon", size: 18 })),
        h("span", null, "作者：しゃけ"))));
};

const RailNavigation = ({ sections, current, dispatch, onOpenUtilities, state }) => {
  const h = React.createElement;
  const buildRailItem = (s) => {
    /* ビルド項目（persona）は 8タブ分の旧 currentSection 値でも
       アクティブ表示し、必須3項目の合成完了でドットを出す。 */
    const isBuild = s.id === "persona";
    const active = isBuild ? ["persona", "skill", "passive", "enh", "support", "ego", "spirit", "items-build"].includes(current) : current === s.id;
    const done = isBuild
      ? isComplete("persona", state) && isComplete("skill", state) && isComplete("passive", state)
      : isComplete(s.id, state);
    return h("button", {
      key: s.id,
      type: "button",
      className: `rail-item${s.group === "utility" ? " is-utility" : ""}${active ? " is-active" : ""}`,
      onClick: () => dispatch({ type: "SET_UI", ui: { currentSection: s.id } }),
      "aria-current": active ? "page" : void 0,
      title: s.label
    }, h("span", { className: "rail-icon" }, h(Icon, { name: s.icon, size: 18 })), h("span", { className: "rail-label" }, s.label), isBuild && !done && h("span", { className: "dot is-warn" }), done && h("span", { className: "dot" }));
  };
  return h("nav", { className: "rail", "aria-label": "画面移動" }, sections.map(buildRailItem),
    h("button", { type: "button", className: "rail-item rail-more", onClick: onOpenUtilities, "aria-haspopup": "dialog", title: "その他の操作と画面" }, h("span", { className: "rail-icon" }, h(Icon, { name: "grid", size: 18 })), h("span", { className: "rail-label" }, "その他"))
  );
};

const App = () => {
  const [state, dispatch, { undo, redo, canUndo, canRedo, saveStatus }] = useAppState();
  const latestStateRef = React.useRef(state);
  latestStateRef.current = state;
  const [cpOpen, setCpOpen] = React.useState(false);
  const [qiOpen, setQiOpen] = React.useState(false);
  const [utilityOpen, setUtilityOpen] = React.useState(false);
  const [disclaimerOpen, setDisclaimerOpen] = React.useState(false);
  const [importData, setImportData] = React.useState(null);
  const [importSel, setImportSel] = React.useState({});
  const fileRef = React.useRef(null);
  const utilityReturnFocusRef = React.useRef(null);
  const openUtilities = (event) => {
    const trigger = event?.currentTarget || document.activeElement;
    utilityReturnFocusRef.current = trigger instanceof HTMLElement ? trigger : null;
    setUtilityOpen(true);
  };
  const closeUtilities = React.useCallback(() => {
    setUtilityOpen(false);
    const trigger = utilityReturnFocusRef.current;
    requestAnimationFrame(() => {
      if (trigger && document.contains(trigger)) trigger.focus();
    });
  }, []);
  // T26: インポートファイル検証後に部分ロードダイアログを開く（既定=全カテゴリ選択）
  React.useEffect(() => {
    window.LBT_openImportDialog = (data) => {
      const sel = {};
      IMPORT_GROUPS.forEach((g) => {
        // データ内に該当フィールドが存在するカテゴリのみ既定ON
        sel[g.key] = g.fields.some((f) => f in data);
      });
      setImportSel(sel);
      setImportData(data);
    };
    return () => { delete window.LBT_openImportDialog; };
  }, []);
  

  /* 硝子窓からの取り込みは、このアカウントの state へ直接流す。
     UNDO は state の履歴機構に乗るので、取り込み後も差し戻せる。 */
  const applyImport = (all) => {
    if (!importData) return;
    const fields = all
      ? IMPORT_GROUPS.flatMap((g) => g.fields)
      : IMPORT_GROUPS.filter((g) => importSel[g.key]).flatMap((g) => g.fields);
    if (!fields.length) { toast("\u8AAD\u307F\u8FBC\u3080\u9805\u76EE\u304C\u9078\u629E\u3055\u308C\u3066\u3044\u307E\u305B\u3093"); return; }
    const inventoryCapError = validateImportedInventoryCaps(importData, fields, state);
    if (inventoryCapError) { toast("インポート失敗: " + inventoryCapError, "assertive"); return; }
    dispatch({ type: "APPLY_PARTIAL", state: importData, fields });
    setImportData(null);
    toast(all ? "\u5168\u9805\u76EE\u3092\u30A4\u30F3\u30DD\u30FC\u30C8\u3057\u307E\u3057\u305F\uFF08Ctrl+Z\u3067\u5DEE\u3057\u623B\u3057\u53EF\uFF09" : "\u9078\u629E\u9805\u76EE\u3092\u30A4\u30F3\u30DD\u30FC\u30C8\u3057\u307E\u3057\u305F\uFF08Ctrl+Z\u3067\u5DEE\u3057\u623B\u3057\u53EF\uFF09");
  };
  const selectedImportGroups = importData ? IMPORT_GROUPS.filter((g) => importSel[g.key] && g.fields.some((f) => f in importData)) : [];
  const selectedImportLabel = selectedImportGroups.length ? selectedImportGroups.map((g) => g.label).join("\u30FB") : "\u9078\u629E\u306A\u3057";
  const saveStateLabel = saveStatus.phase === "error" ? "\u7AEF\u672B\u5185\u4FDD\u5B58\u4E0D\u53EF" : saveStatus.phase === "saved" ? "\u7AEF\u672B\u5185\u306B\u81EA\u52D5\u4FDD\u5B58\u6E08\u307F" : "\u7AEF\u672B\u5185\u3078\u81EA\u52D5\u4FDD\u5B58\u4E2D";
  React.useEffect(() => {
    const host = document.querySelector(".topbar");
    const anchor = host?.querySelector(".topbar-search");
    if (!host || !anchor) return;
    anchor.dataset.autosave = saveStateLabel;
    anchor.dataset.autosaveState = saveStatus.phase;
    anchor.setAttribute("aria-label", `\u30AF\u30A4\u30C3\u30AF\u691C\u7D22\u3002${saveStateLabel}`);
    const indicator = document.getElementById("lbt-autosave-status") || document.createElement("div");
    indicator.id = "lbt-autosave-status";
    indicator.className = `topbar-save-state is-${saveStatus.phase}`;
    indicator.setAttribute("role", "status");
    indicator.setAttribute("aria-atomic", "true");
    indicator.title = saveStatus.phase === "saved" && saveStatus.savedAt ? `\u7AEF\u672B\u5185\u4FDD\u5B58: ${new Date(saveStatus.savedAt).toLocaleTimeString()}` : saveStateLabel;
    const label = document.createElement("span");
    label.textContent = saveStateLabel;
    indicator.replaceChildren(label);
    if (saveStatus.phase === "error") {
      const backup = document.createElement("button");
      backup.type = "button";
      backup.textContent = "\u4F5C\u696D\u72B6\u614B\u3092\u4FDD\u5B58";
      backup.title = "\u73FE\u5728\u306E\u4F5C\u696D\u72B6\u614B\u3092\u30D5\u30A1\u30A4\u30EB\u3068\u3057\u3066\u4FDD\u5B58";
      backup.onclick = () => exportState(state);
      indicator.appendChild(backup);
    }
    anchor.insertAdjacentElement("afterend", indicator);
    return () => indicator.remove();
  }, [saveStatus.phase, saveStatus.savedAt, saveStateLabel, state]);
  React.useEffect(() => {
    const onKey = (e) => {
      const isCtrl = e.ctrlKey || e.metaKey;
      if (isCtrl && e.key === "k") {
        e.preventDefault();
        setCpOpen((o) => !o);
        return;
      }
      // テキスト入力中の undo/redo はOS標準の入力履歴操作に譲る。
      // アプリ全体のundoで入力中の文字列を巻き戻すと、ユーザーの意図しない
      // ビルド状態変更が発生するため、入力要素へのフォーカス中はスキップする。
      const el = document.activeElement;
      const isTyping = !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
      if (isTyping) return;
      if (isCtrl && !e.shiftKey && e.key === "z") {
        e.preventDefault();
        undo();
      } else if (isCtrl && ((e.shiftKey && (e.key === "Z" || e.key === "Y")) || e.key === "y" || e.key === "Y")) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);
  // T12: 数値入力 UX。初期値 0 が入った number 入力はフォーカス時に全選択し、
  // 「0 を消してから打ち直す」操作を不要にする。値は変更せず選択のみ（controlled input を壊さない）。
  /* アカウント切替オーバーレイ。設定・topbar の chip からは
     lbt:open-accounts イベントだけで開く（状態の所在を App に一元化）。 */
  const [accountSwitcherOpen, setAccountSwitcherOpen] = React.useState(false);
  /* 取り込みは accounts-ui からイベントで届く。状態の所在は App に一元する。 */
  React.useEffect(() => {
    const onImport = (event) => {
      const detail = event.detail && typeof event.detail === "object" ? event.detail : {};
      const requestedActions = Array.isArray(detail.actions) ? detail.actions : [];
      const filtered = filterInventoryImportActions(requestedActions, latestStateRef.current);
      const skipped = [
        ...(Array.isArray(detail.skipped) ? detail.skipped : []),
        ...filtered.skipped
      ];
      /* CustomEvent.detail is shared with the synchronous caller, so return the accepted
         actions and skipped reasons for the source UI's result summary. */
      detail.actions = filtered.actions;
      detail.skipped = skipped;

      if (!filtered.actions.length) {
        toast(skipped.length
          ? "取り込める項目がありません（" + skipped.length + "件を除外しました。理由は取り込み結果を確認してください）"
          : "取り込む項目がありません", "assertive");
        return;
      }

      dispatch({ type: "APPLY_IMPORT_BATCH", actions: filtered.actions });
      toast(skipped.length
        ? filtered.actions.length + "件を取り込みました（" + skipped.length + "件を除外しました。理由は取り込み結果を確認してください）"
        : filtered.actions.length + "件を取り込みました（Ctrl+Z で戻せます）");
    };
    window.addEventListener("lbt:apply-import", onImport);
    return () => window.removeEventListener("lbt:apply-import", onImport);
  }, [dispatch]);
  React.useEffect(() => {
    const onOpenAccounts = () => setAccountSwitcherOpen(true);
    window.addEventListener("lbt:open-accounts", onOpenAccounts);
    return () => window.removeEventListener("lbt:open-accounts", onOpenAccounts);
  }, []);
  /* アクセス時のアカウント選択ゲート。ページを開いたら必ずこの画面を出す。
     どのアカウントの保存領域で作業するかを利用者が選んでから本体へ入る。
     保存領域そのものが使えない端末（LBT_accounts が機能しない）ときだけ
     素通しにする。ここで止めると作業の入り口が完全に塞がるため。 */
  const [accountGateOpen, setAccountGateOpen] = React.useState(() => window.LBT_accounts?.storageAvailable?.() !== false);
  /* ゲートでアカウントを選んだ通知。ページ再読込はせず、そのアカウントの
     保存領域で state を作り直す。保存の束縛先も選んだアカウントに更新する。 */
  React.useEffect(() => {
    const onAccountsEntered = (event) => {
      const id = event.detail?.id || window.LBT_accounts?.getActiveId?.() || null;
      window.__LBT_BOOT_ACCOUNT_ID = id;
      dispatch({ type: "RELOAD_ACCOUNT" });
      setAccountGateOpen(false);
    };
    window.addEventListener("lbt:accounts-entered", onAccountsEntered);
    return () => window.removeEventListener("lbt:accounts-entered", onAccountsEntered);
  }, []);
  React.useEffect(() => {
    const onFocusIn = (e) => {
      const el = e.target;
      if (!el || el.tagName !== "INPUT" || el.type !== "number") return;
      // フォーカス直後のブラウザ既定選択を上書きするため次フレームで実行
      requestAnimationFrame(() => {
        try {
          if (document.activeElement === el) el.select();
        } catch (err) {}
      });
    };
    document.addEventListener("focusin", onFocusIn, true);
    return () => document.removeEventListener("focusin", onFocusIn, true);
  }, []);
  const current = state.ui.currentSection || "persona";
  const sec = SECTIONS.find((s) => s.id === current) || SECTIONS[0];
  const renderSection = () => {
    switch (current) {
      /* 6タブ統合。currentSection が skill/passive/enh/support/ego の旧値でも
         BuildWorkspace が BUILD_TABS からアクティブタブを引く。 */
      case "persona":
      case "skill":
      case "passive":
      case "enh":
      case "support":
      case "ego":
      case "spirit":
      case "items-build":
        return /* @__PURE__ */ React.createElement(BuildWorkspace, { state, dispatch });
      case "baseinfo":
        /* 他のセクション（roster/help/settings）と同じく SectionTitle を付ける。
           ここは SECTIONS に title:"BASE INFO" / subtitle が定義されているのに
           描画されておらず、本文が CHARACTER NAME の入力欄から始まっていた。 */
        return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(SectionTitle, { num: sec.num, title: sec.title, subtitle: sec.subtitle }), /* @__PURE__ */ React.createElement(BaseInfoWorkspace, { state, dispatch }));
      case "roster":
        return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(SectionTitle, { num: sec.num, title: sec.title, subtitle: sec.subtitle }), /* @__PURE__ */ React.createElement(RosterSection, { state, dispatch }));
      case "shop":
        return /* @__PURE__ */ React.createElement(ShopSection, { state, dispatch });
;
      case "help":
        return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(SectionTitle, { num: sec.num, title: sec.title, subtitle: sec.subtitle }), /* @__PURE__ */ React.createElement(HelpSection, { onNavigate: (id, ui = {}) => dispatch({ type: "SET_UI", ui: { ...ui, currentSection: id } }), onOpenUtilities: openUtilities }));
      case "settings":
        return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(SectionTitle, { num: sec.num, title: sec.title, subtitle: sec.subtitle }), /* @__PURE__ */ React.createElement(SettingsSection, { state, dispatch }));
      default:
        return null;
    }
  };
  const isNarrow = typeof window !== "undefined" && window.innerWidth <= 1024;
  const previewOpen = state.ui.previewOpen !== void 0 ? state.ui.previewOpen !== false : !isNarrow;
  // 初期値が未保存でも、画面に実際に表示されている状態を基準に即時反転する。
  const togglePreview = () => dispatch({ type: "SET_UI", ui: { previewOpen: !previewOpen } });
  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(LBT_gen.buildCcfoliaJSON(state)));
      toast("JSONをコピー");
    } catch (_) {
      toast("JSONをコピーできませんでした", "assertive");
    }
  };
  const utilityActions = [
    { key: "undo", icon: "undo", label: "元に戻す", note: "直前の編集を取り消します。", onClick: undo },
    { key: "redo", icon: "redo", label: "やり直す", note: "取り消した編集をもう一度適用します。", onClick: redo },
    { key: "work", icon: "download", scope: "このビルド", label: "現在の作業状態を保存", note: saveStatus.phase === "error" ? "端末内自動保存が使えません。作業を失わないよう、ファイルとして保存してください。" : "端末内には自動保存されています。別端末への移動・長期保管にはファイルとして保存してください。", onClick: () => exportState(state) },
    { key: "library", icon: "archive", scope: "所持データ", label: "所持ライブラリを保存", note: "所持人格・E.G.O・保存済みビルドを書き出して、別端末へ引き継ぎます。", tone: "is-library-save", onClick: () => exportRoster(state) },
    { key: "import", icon: "upload", label: "保存データを読み込む", note: "読み込む範囲を確認して、現在の作業へ適用します。", onClick: () => fileRef.current?.click() },
    { key: "preview", icon: "eye", label: previewOpen ? "プレビューを閉じる" : "プレビューを開く", note: "メモ、パレット、JSONの出力結果を確認します。", onClick: togglePreview },
    { key: "share", icon: "share", label: "共有シートを開く", note: "整形されたHTMLの共有用プレビューを新規タブで開きます。", onClick: () => LBT_gen.openShareSheet(state) },
    { key: "json", icon: "copy", scope: "出力", label: "CCFOLIA JSONをコピー", note: "現在の出力対象をJSONとしてクリップボードへコピーします。", tone: "is-primary", onClick: copyJson }
  ];
  const utilitySections = SECTIONS.filter((s) => s.group === "utility");

  /* アカウント未選択なら本体を出さず、選択ゲートだけを描画する。
     「どのキャラクターのデータか」が決まるまで編集画面へ入れないことで、
     前回の作業状態が別アカウントの画面へ漏れる経路を無くす。 */
  if (accountGateOpen) {
    return /* @__PURE__ */ React.createElement(AccountGate, null);
  }
  return /* @__PURE__ */ React.createElement("div", { className: `app${!previewOpen ? " preview-collapsed" : ""}` }, /* 最初のフォーカス可能要素。WCAG 2.4.1 の bypass block。
   通常時は画面外へ逃がし、フォーカス時のみ表示する。 */ /* @__PURE__ */ React.createElement("a", { href: "#main-content", className: "skip-link" }, "本文へスキップ"), /* @__PURE__ */ React.createElement("header", { className: "topbar" }, /* @__PURE__ */ React.createElement("div", { className: "brand" }, /* @__PURE__ */ React.createElement("span", { className: "brand-mark" }, "\u25C8"), /* @__PURE__ */ React.createElement("h1", { className: "brand-name" }, "LIMBUS BUILD TERMINAL"), /* @__PURE__ */ React.createElement("span", { className: "brand-sub" }, "CCFOLIA CHARACTER BUILDER ", /* @__PURE__ */ React.createElement("span", { className: "brand-ver" }, window.LBT_VERSION || "v64r45"))), /* @__PURE__ */ React.createElement("button", { type: "button", className: "brand-author", onClick: () => setDisclaimerOpen(true), title: "\u4F5C\u8005\uFF1A\u3057\u3083\u3051\uFF08\u514D\u8CAC\u4E8B\u9805\u3092\u958B\u304F\uFF09", "aria-haspopup": "dialog" }, /* @__PURE__ */ React.createElement("span", { className: "brand-author-fish" }, /* @__PURE__ */ React.createElement(Icon, { name: "salmon", size: 20 })), /* @__PURE__ */ React.createElement("span", { className: "brand-author-name" }, "しゃけ")), /* @__PURE__ */ React.createElement("div", { className: "topbar-spacer" }), /* @__PURE__ */ React.createElement("button", { className: "topbar-search", onClick: () => setCpOpen(true) }, /* @__PURE__ */ React.createElement(Icon, { name: "search", size: 14 }), /* @__PURE__ */ React.createElement("span", { className: "topbar-search-text" }, "\u30AF\u30A4\u30C3\u30AF\u691C\u7D22"), /* @__PURE__ */ React.createElement("kbd", null, "\u2318K")), /* 残高は常に見える必要がある。.topbar-actions の中に入れると ≤640px と
   横向きで display:none になるため、.topbar の直接子として置く。 */
/* @__PURE__ */ React.createElement(BalanceChip, { state, onClick: () => dispatch({ type: "SET_UI", ui: { currentSection: "roster", libraryTab: "ledger" } }) }), /* @__PURE__ */ React.createElement("div", { className: "topbar-actions" }, /* @__PURE__ */ React.createElement(AccountChip, null), /* @__PURE__ */ React.createElement(Button, { variant: "ghost", size: "sm", icon: "undo", onClick: undo, disabled: !canUndo, title: "\u5143\u306B\u623B\u3059 (Ctrl+Z)" }), /* @__PURE__ */ React.createElement(Button, { variant: "ghost", size: "sm", icon: "redo", onClick: redo, disabled: !canRedo, title: "\u3084\u308A\u76F4\u3057 (Ctrl+Shift+Z)" }), /* @__PURE__ */ React.createElement(Button, { variant: "ghost", size: "sm", icon: "download", onClick: () => exportState(state), title: "\u73FE\u5728\u306E\u4F5C\u696D\u72B6\u614B\u3092\u4FDD\u5B58\uFF08\u8AAD\u307F\u8FBC\u307F\u6642\u306B\u7BC4\u56F2\u3092\u9078\u3079\u307E\u3059\uFF09" }), /* @__PURE__ */ React.createElement(Button, { variant: "ghost", size: "sm", icon: "archive", className: "topbar-library-save", "aria-label": "所持ライブラリを保存", onClick: () => exportRoster(state), title: "\u6240\u6301\u30E9\u30A4\u30D6\u30E9\u30EA\u3092\u4FDD\u5B58\uFF08\u7DE8\u96C6\u6E08\u307F\u4EBA\u683C\u30FBE.G.O\u3092\u5225\u7AEF\u672B\u3078\u5F15\u304D\u7D99\u304E\uFF09" }), /* @__PURE__ */ React.createElement(Button, { variant: "ghost", size: "sm", icon: "upload", onClick: () => fileRef.current.click(), title: "\u4FDD\u5B58\u30C7\u30FC\u30BF\u3092\u8AAD\u307F\u8FBC\u3080\uFF08\u4E0A\u66F8\u304D\u7BC4\u56F2\u3092\u9078\u629E\uFF09" }), /* @__PURE__ */ React.createElement("input", { type: "file", ref: fileRef, accept: "application/json", style: { display: "none" }, onChange: (e) => {
    const f = e.target.files?.[0];
    if (f) importStateFromFile(f, dispatch);
    e.target.value = "";
  } }), /* @__PURE__ */ React.createElement(Button, { variant: "ghost", size: "sm", icon: "eye", onClick: togglePreview, title: "\u30D7\u30EC\u30D3\u30E5\u30FC\u5207\u66FF" }), /* @__PURE__ */ React.createElement(Button, { variant: "ghost", size: "sm", icon: "share", onClick: () => LBT_gen.openShareSheet(state), title: "\u5171\u6709\u30B7\u30FC\u30C8\uFF08\u6574\u5F62HTML\uFF09\u3092\u65B0\u898F\u30BF\u30D6\u3067\u30D7\u30EC\u30D3\u30E5\u30FC" }), /* @__PURE__ */ React.createElement(Button, { variant: "primary", size: "sm", icon: "copy", onClick: async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(LBT_gen.buildCcfoliaJSON(state)));
      toast("JSON\u3092\u30B3\u30D4\u30FC");
    } catch (e) {
    }
  } }, "JSON\u51FA\u529B")), /* @__PURE__ */ React.createElement("button", { type: "button", className: "utility-trigger", onClick: openUtilities, "aria-haspopup": "dialog", "aria-expanded": utilityOpen }, /* @__PURE__ */ React.createElement(Icon, { name: "grid", size: 15 }), /* @__PURE__ */ React.createElement("span", null, "操作・保存"))), /* @__PURE__ */ React.createElement(RailNavigation, { sections: SECTIONS, current, dispatch, state, onOpenUtilities: openUtilities }), /* @__PURE__ */ React.createElement("main", { className: "focus", id: "main-content", tabIndex: -1 }, /* @__PURE__ */ React.createElement("div", { className: "focus-inner" }, renderSection())), /* @__PURE__ */ React.createElement(LivePreview, { state, dispatch }), !previewOpen && /* @__PURE__ */ React.createElement("button", { className: "preview-reopen", onClick: togglePreview, title: "\u30D7\u30EC\u30D3\u30E5\u30FC\u3092\u958B\u304F" }, "PREVIEW \u25C8"), /* R15 utility sheet */ utilityOpen && /* @__PURE__ */ React.createElement(UtilitySheet, { open: utilityOpen, onClose: closeUtilities, actions: utilityActions, sections: utilitySections, currentSection: current, onNavigate: (id) => dispatch({ type: "SET_UI", ui: { currentSection: id } }) }), /* @__PURE__ */ React.createElement(DisclaimerSheet, { open: disclaimerOpen, onClose: () => setDisclaimerOpen(false) }), /* @__PURE__ */ React.createElement(CommandPalette, { open: cpOpen, onClose: () => setCpOpen(false), state, dispatch }), /* @__PURE__ */ React.createElement(QualityInspector, { open: qiOpen, onClose: () => setQiOpen(false) }), /* @__PURE__ */ React.createElement(AccountSwitcher, { open: accountSwitcherOpen, onClose: () => setAccountSwitcherOpen(false) }), importData && /* @__PURE__ */ React.createElement("div", { className: "share-modal-backdrop", onClick: (e) => { if (e.target === e.currentTarget) setImportData(null); }, style: { position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 } }, /* @__PURE__ */ React.createElement("div", { className: "card", style: { maxWidth: 520, width: "100%", maxHeight: "85vh", overflow: "auto", background: "var(--surface-1, #1a1715)", border: "1px solid var(--line)", borderRadius: 6, padding: 16 } },
    /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--f-display)", fontWeight: 700, fontSize: "var(--fs-15)", color: "var(--gold)", marginBottom: 4 } }, "\u30BB\u30FC\u30D6\u30C7\u30FC\u30BF\u306E\u8AAD\u307F\u8FBC\u307F"),
    /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-11)", color: "var(--tx-2)", marginBottom: 12, lineHeight: 1.6 } }, "\u8AAD\u307F\u8FBC\u3080\u9805\u76EE\u3092\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044\u3002\u73FE\u5728\u306E\u72B6\u614B\u306F\u4E0A\u66F8\u304D\u3055\u308C\u307E\u3059\u304C\u3001Ctrl+Z\u3067\u5DEE\u3057\u623B\u305B\u307E\u3059\u3002"),
    /* @__PURE__ */ React.createElement("div", { className: "import-apply-summary", role: "status", "aria-live": "polite", style: { fontSize: "var(--fs-11)", color: "var(--gold)", marginBottom: 10, padding: "7px 9px", background: "var(--surface-inset)", border: "1px solid var(--line-dim)", borderRadius: 4, lineHeight: 1.5 } }, "\u4ECA\u56DE\u306E\u9069\u7528\u7BC4\u56F2\uFF1A", selectedImportLabel),
    /* @__PURE__ */ React.createElement("div", { className: "stack-2" }, IMPORT_GROUPS.map((g) => {
      const has = g.fields.some((f) => f in importData);
      return /* @__PURE__ */ React.createElement("label", { key: g.key, style: { display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: has ? "var(--surface-inset)" : "transparent", border: "1px solid var(--line-dim)", borderRadius: 4, cursor: has ? "pointer" : "default", opacity: has ? 1 : 0.4, fontSize: "var(--fs-12)" } },
        /* @__PURE__ */ React.createElement("input", { type: "checkbox", disabled: !has, checked: !!importSel[g.key], onChange: (e) => setImportSel((s) => ({ ...s, [g.key]: e.target.checked })), style: { accentColor: "var(--gold)" } }),
        /* @__PURE__ */ React.createElement("span", null, g.label, !has && /* @__PURE__ */ React.createElement("span", { style: { fontSize: "var(--fs-10)", color: "var(--tx-mute)", marginLeft: 6 } }, "\uFF08\u30C7\u30FC\u30BF\u306A\u3057\uFF09"))
      );
    })),
    /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8, marginTop: 14, justifyContent: "flex-end", flexWrap: "wrap" } },
      /* @__PURE__ */ React.createElement("button", { className: "btn btn-ghost btn-sm", onClick: () => {
        const sel = {};
        IMPORT_GROUPS.forEach((g) => { sel[g.key] = false; });
        setImportSel(sel);
      }, title: "\u5168\u30AB\u30C6\u30B4\u30EA\u306E\u30C1\u30A7\u30C3\u30AF\u3092\u5916\u3059" }, "\u3059\u3079\u3066\u5916\u3059"),
      /* @__PURE__ */ React.createElement("button", { className: "btn btn-ghost btn-sm", onClick: () => {
        const sel = {};
        IMPORT_GROUPS.forEach((g) => { sel[g.key] = g.fields.some((f) => f in importData); });
        setImportSel(sel);
      }, title: "\u30C7\u30FC\u30BF\u304C\u5B58\u5728\u3059\u308B\u30AB\u30C6\u30B4\u30EA\u306E\u307F\u9078\u629E\u3057\u305F\u521D\u671F\u72B6\u614B\u306B\u623B\u3059" }, "\u9078\u629E\u3092\u521D\u671F\u72B6\u614B\u306B\u623B\u3059"),
      /* @__PURE__ */ React.createElement("div", { style: { flex: 1 } }),
      /* @__PURE__ */ React.createElement("button", { className: "btn btn-ghost btn-sm", onClick: () => setImportData(null) }, "\u30AD\u30E3\u30F3\u30BB\u30EB"),
      /* @__PURE__ */ React.createElement("button", { className: "btn btn-sm btn-primary", onClick: () => applyImport(false), disabled: selectedImportGroups.length === 0, title: selectedImportGroups.length ? "\u8868\u793A\u4E2D\u306E\u9069\u7528\u7BC4\u56F2\u3092\u73FE\u5728\u306E\u4F5C\u696D\u72B6\u614B\u3078\u8AAD\u307F\u8FBC\u307F\u307E\u3059" : "\u8AAD\u307F\u8FBC\u3080\u9805\u76EE\u3092\u4E00\u3064\u4EE5\u4E0A\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044" }, "\u9078\u629E\u9805\u76EE\u3092\u8AAD\u307F\u8FBC\u3080")
    )
  )));
};
window.App = App;
