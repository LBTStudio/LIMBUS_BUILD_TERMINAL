const LBT_EGO_INFLUENCE_TEXT = (() => {
  const getRounds = (effect) => {
    const match = String(effect || "").match(/^\s*\[\s*影響\s*\][ \t]*(\d+R?)/i);
    return match ? match[1] : "";
  };
  /* Strip only the serialized header. The effect body must keep its own spaces,
     including trailing spaces and line breaks while a controlled textarea is edited. */
  const stripHeader = (effect) => String(effect || "").replace(/^\s*\[\s*影響\s*\](?:[ \t]*\d+R?)?[ \t]*(?:[:：])?/i, "");
  const makeEffect = (rounds, effect) => {
    const rawRounds = String(rounds ?? "").trim();
    const match = /^(\d+)R?$/i.exec(rawRounds);
    const canonicalRounds = rawRounds ? (match ? match[1] + "R" : rawRounds) : "";
    const label = "[影響]" + (canonicalRounds ? " " + canonicalRounds : "");
    const body = stripHeader(effect);
    return body.length ? label + "：" + body : label;
  };
  return Object.freeze({ getRounds, stripHeader, makeEffect });
})();
window.LBT_EGO_INFLUENCE_TEXT = LBT_EGO_INFLUENCE_TEXT;

window.LBT_EGO_SLOT_FORMS = Object.freeze({
  "TETH:15": Object.freeze({ kakusei: "skill", shinshoku: "assimilation" }),
  "TETH:20": Object.freeze({ kakusei: "assimilation", shinshoku: "skill" }),
  "HE:62": Object.freeze({ kakusei: "assimilation", shinshoku: "skill" }),
  "HE:69": Object.freeze({ kakusei: "assimilation", shinshoku: "influence" }),
  "WAW:70": Object.freeze({ kakusei: "assimilation", shinshoku: "skill" }),
  "ALEPH:95": Object.freeze({ kakusei: "assimilation", shinshoku: "skill" }),
  "ALEPH:99": Object.freeze({ kakusei: "skill", shinshoku: "assimilation" }),
  "WAW:113": Object.freeze({ kakusei: "assimilation", shinshoku: "skill" })
});
