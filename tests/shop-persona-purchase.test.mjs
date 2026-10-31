import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const otherSectionsSource = readFileSync(new URL("../js/OtherSections.js", import.meta.url), "utf8");
const personaSource = readFileSync(new URL("../js/PersonaCodex.js", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../js/App.js", import.meta.url), "utf8");
const personaCss = readFileSync(new URL("../assets/persona-codex.css", import.meta.url), "utf8");
const workbenchCss = readFileSync(new URL("../assets/b-type-workbench.css", import.meta.url), "utf8");
const sectionsCss = readFileSync(new URL("../assets/sections.css", import.meta.url), "utf8");

test("ショップに通常人格の指定購入カテゴリがあり、未所持・検索・件数が連動する", () => {
  assert.match(otherSectionsSource, /\[\["persona", "人格"\], \["support", "サポート"\]/);
  assert.match(otherSectionsSource, /const ownedPersonaKeys = React\.useMemo/);
  assert.match(otherSectionsSource, /const personas = \(DB\.normal_personas \|\| \[\]\)\.filter/);
  assert.match(otherSectionsSource, /persona: \(\) => personas\.map\(\(persona\) => \{/);
  assert.match(otherSectionsSource, /const shopCategories = \[/);
  for (const id of ["persona", "support", "ego", "spirit", "item", "gacha"]) {
    assert.match(otherSectionsSource, new RegExp('id: "' + id + '"'));
    assert.match(otherSectionsSource, new RegExp('data-category'));
  }
  assert.match(otherSectionsSource, /shopView: "catalog", shopTab: id/);
  assert.match(otherSectionsSource, /className: "btype-shop-category-card"/);
  assert.match(otherSectionsSource, /persona: \(DB\.normal_personas \|\| \[\]\)\.length/);
  assert.match(otherSectionsSource, /人格・サポート・E\.G\.O・精神・アイテムを購入/);
  assert.match(appSource, /subtitle: "人格・サポート・E\.G\.O・精神・アイテムを購入"/);
  assert.match(otherSectionsSource, /className: "p-card shop-persona-card"/);
  assert.match(otherSectionsSource, /className: "p-stats"/);
  assert.match(otherSectionsSource, /className: "p-res-mini shop-persona-res"/);
  assert.match(otherSectionsSource, /className: "p-sin-row"/);
  assert.match(otherSectionsSource, /className: "shop-persona-actions spirit-item-actions shop-card-actions"/);
  assert.match(personaCss, /\.p-card\s*\{/);
  assert.match(workbenchCss, /\.btype-shop-category-grid\s*\{/);
  assert.match(sectionsCss, /\.shop-persona-card\s*\{/);
  assert.match(otherSectionsSource, /const emptyMessage = \{ persona: "条件に合う未所持の通常人格はありません。"/);
  assert.doesNotMatch(otherSectionsSource, /const personas = \[\s*\.\.\.\(DB\.tokui_personas/);
});

test("人格ショップの指定購入は通常人格の mode:n + No を使い、現在の価格・残高を確認する", () => {
  assert.match(otherSectionsSource, /type: "ADD_ROSTER",\s*mode: "n",\s*no: persona\.no,\s*purchase: true,/);
  assert.match(otherSectionsSource, /cost: \{ lp: cost\.lp \|\| 0, shards: cost\.shards \|\| 0 \}/);
  assert.match(otherSectionsSource, /ownsPersona: \(state\.roster\?\.personas \|\| \[\]\)\.length > 0/);
  assert.match(otherSectionsSource, /window\.LBT_purchaseAffordability\?\.\(state, cost\)/);
  assert.match(otherSectionsSource, /通常人格を選んで指定購入できます/);
});

test("人格図鑑のクイック獲得ボタンは全面選択ボタンより手前にあり、購入失敗を成功扱いしない", () => {
  assert.match(personaCss, /\.p-card \.p-card-quick-acquire\s*\{[^}]*position:\s*relative;[^}]*z-index:\s*2/s);
  assert.match(personaCss, /\.p-card-hit\s*\{/);
  const guard = personaSource.indexOf("const affordability = window.LBT_purchaseAffordability?.(state, cost)");
  const dispatch = personaSource.indexOf('dispatch({ type: "ADD_ROSTER", mode: personaMode', guard);
  const success = personaSource.indexOf("toast(successMessage ||", dispatch);
  assert.ok(guard >= 0, "共通購入処理に残高チェックがある");
  assert.ok(dispatch > guard, "残高確認後にだけ action を dispatch する");
  assert.ok(success > dispatch, "成功通知は購入処理の後に限る");
});
