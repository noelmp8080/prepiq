# PrepIQ — emit the shipped grocery catalog into src/data/.
#
# WHY THIS STEP EXISTS
# Everything under tools/extracted/ is gitignored: it is intermediate
# working data, regenerated from the PDFs. The app cannot import from
# there, so the final catalog is emitted into src/data/ as a committed
# artifact — the same arrangement recipeDetailKeys.js already uses.
#
# STABLE IDS ARE THE POINT
# Exclusions ("I already have olive oil") are persisted per user and
# keyed on the item id. A name-derived key would break every time the
# normaliser changes, and it has changed on almost every pass of this
# work. So ids are integers, assigned once, and CARRIED FORWARD from the
# previously emitted file. A rebuild may add ids and may stop using ids;
# it must never reassign one to a different food.
#
# Retired ids are kept in the file rather than reused, for the same
# reason build-catalog.mjs never reuses a retired recipe id: a stored
# exclusion pointing at a recycled id would silently exclude the wrong
# thing.

import json, io, os, re, sys
sys.path.insert(0, os.path.dirname(__file__))
import _guard
from collections import defaultdict

# NOTE: no stdout wrapper here. build-merge-map installs one when it is
# imported below, and wrapping twice closes the underlying buffer.

SPLIT   = 'tools/extracted/ingredients-split.json'
CATALOG = 'tools/extracted/shopping-catalog.json'
SECTION = 'tools/extracted/section-map.json'
OUT     = 'src/data/groceryCatalog.json'

# Quantities are shown on the expanded chip for these sections only.
# Spices are excluded deliberately: "1 Tsp Paprika" tells you nothing at
# the shelf, and a jar lasts a year.
QUANTITY_SECTIONS = {'Meat & fish', 'Dairy & chilled', 'Dry goods'}


def load_previous_ids():
    if not os.path.exists(OUT):
        return {}, 1
    prev = json.load(io.open(OUT, encoding='utf-8'))
    ids = {v['name']: int(k) for k, v in prev.get('items', {}).items()}
    return ids, max(ids.values(), default=0) + 1


def main():
    sys.path.insert(0, os.path.dirname(__file__))
    import importlib.util
    spec = importlib.util.spec_from_file_location('bm', 'tools/build-merge-map.py')
    bm = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(bm)

    S = json.load(io.open(SPLIT, encoding='utf-8'))
    canon = json.load(io.open(CATALOG, encoding='utf-8'))['canonical']
    M = json.load(io.open(SECTION, encoding='utf-8'))
    section_of = {n: s for s, names in M['sections'].items() for n in names}
    not_bought = set(M['notBought'])

    ids, next_id = load_previous_ids()
    items = {}                       # id -> {name, section}
    by_card = defaultdict(list)      # card id -> [{id, qty}]

    for cid, v in S.items():
        seen = {}
        for line in v['ingredients']:
            name = canon.get(bm.shopping_name(line['text']), bm.shopping_name(line['text']))
            if len(name) < 2 or name in not_bought:
                continue
            if name not in ids:
                ids[name] = next_id
                next_id += 1
            iid = ids[name]
            section = section_of.get(name, 'Other')
            items[iid] = {'name': name, 'section': section}
            entry = seen.get(iid)
            if entry is None:
                entry = {'id': iid, 'qty': []}
                seen[iid] = entry
                by_card[cid].append(entry)
            # The raw line is the quantity, unsummed and unedited.
            if section in QUANTITY_SECTIONS:
                entry['qty'].append(line['text'])

    # Ids that exist only in the previous file are RETIRED, not dropped —
    # a stored exclusion may still point at one.
    retired = sorted(i for n, i in ids.items() if i not in items)

    out = {
        'version': 1,
        'sectionOrder': M['order'],
        'collapsedByDefault': M['collapsed'],
        'hideWhenEmpty': M['hideWhenEmpty'],
        'quantitySections': sorted(QUANTITY_SECTIONS),
        'items': {str(i): items[i] for i in sorted(items)},
        'retiredIds': retired,
        'byCard': {c: by_card[c] for c in sorted(by_card, key=int)},
    }
    _guard.write_json(OUT, out)

    n_qty = sum(1 for v in items.values() if v['section'] in QUANTITY_SECTIONS)
    print(f'{len(items)} items, {len(by_card)} cards -> {OUT}')
    print(f'   ids assigned {min(items) if items else 0}..{max(items) if items else 0}, '
          f'{len(retired)} retired and kept')
    print(f'   {n_qty} items carry quantities ({", ".join(sorted(QUANTITY_SECTIONS))})')


if __name__ == '__main__':
    main()
