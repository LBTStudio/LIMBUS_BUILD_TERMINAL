import json, pathlib
db = json.load(open("data/db.json", encoding="utf-8"))
layout = pathlib.Path("tmp_layout.txt").read_text(encoding="utf-8")
for key in ["normal_personas", "tokui_personas", "egos"]:
    names = set(e.get("name","") for e in db.get(key,[]) if isinstance(e,dict))
    found = sum(1 for n in names if n and n in layout)
    print(key, len(names), "found", found)
