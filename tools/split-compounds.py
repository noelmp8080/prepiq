# PrepIQ — split compound ingredient lines into one ingredient each.
#
# WHAT A COMPOUND IS
# The cookbooks bullet several ingredients on one line:
#
#   "1 Tsp each: Salt, Black Pepper, Paprika"   -> 3 ingredients
#   "1 Tsp Salt & Pepper"                       -> 2 ingredients
#
# Re-extraction cannot fix these. They are one bullet in the source —
# authorial, not an artifact — so they need a rule, and the rule needs
# to be readable rather than trusted.
#
# THE GATE IS A VOCABULARY, NOT A PATTERN
# The tempting rule is "split on commas". It is catastrophically wrong
# here: of 780 comma-bearing lines, the word after the first comma is
# `chopped` 256 times, `cubed` 73, `thinly` 61, `finely` 58, `cut` 40.
# Commas overwhelmingly introduce a PREPARATION, not another ingredient.
# Splitting them would turn "600g Raw Chicken Breast, cut into strips"
# into an ingredient called "cut into strips".
#
# So a comma or an ampersand only splits when EVERY resulting piece is a
# known seasoning. The vocabulary is derived from the `each:` lines —
# where the comma-separated items are provably ingredients, because the
# quantity distributes over them — and then frozen below as a literal
# list. A list can be read and argued with. "Looks like a seasoning"
# could not.
#
# INSTRUCTION LINES ARE EXCLUDED BY NAME, NOT BY PATTERN
# Seven lines in the ingredient blocks are not ingredients. They are
# listed verbatim with their card id. A regex for "looks like an
# instruction" would eventually eat a real ingredient; seven named lines
# cannot.
#
# WHAT IS FLAGGED RATHER THAN SPLIT
# `each` does not always distribute a quantity — see EACH_NOT_A_
# DISTRIBUTOR below. Where the meaning is not certain, the line is left
# whole and flagged for a human. A wrong split is silent; a flag is not.

import json, io, re, sys
sys.path.insert(0, __import__('os').path.dirname(__file__))
import _guard
from collections import Counter

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

SRC    = 'tools/extracted/ingredients.json'
OUT    = 'tools/extracted/ingredients-split.json'
REPORT = 'tools/extracted/compound-report.txt'

# ── Exclusions: not ingredients, named individually ────────────────────
# (card id, exact text). Seven lines across 4,587.
EXCLUDE = {
    ('10',  'Distribute into 4 equal servings'),
    ('15',  'Distribute Into 4 Equal Portions'),
    ('18',  'Distribute Into 4 Equal Servings'),
    ('43',  'Distribute into 4 equal servings'),
    ('253', 'Distribute into 4 Equal Servings'),
    ('221', 'Extra seasoning if needed'),
    # A sub-heading the book bullets like an ingredient. Typographically
    # identical to one, so no font rule can catch it.
    ('33',  'Sauce'),

    # PROSE IN THE INGREDIENT BLOCK. Each verified to mention no food
    # that is absent elsewhere in the same recipe, so naming them loses
    # nothing. Card 341's "Drizzle of Sriracha when serving" FAILED that
    # test — sriracha appears nowhere else there — so it is stripped to
    # an ingredient rather than named here. That check is why this list
    # is eleven rather than twelve.
    ('8',   'You can store this in batches in the fridge, flavours get better overtime!'),
    ('11',  'Note: You will only use a small amount (20g, 1oz) per serving'),
    ('11',  'Note: To make the rice fluffy, cover with a lid before it is fully cooked and turn off the heat. Let it cook in its steam for 8-10 mins'),
    ('27',  'Optional: You Can Drizzle a Little Honey Over The Chicken'),
    ('28',  'Note: You will only use a small amount per serving'),
    ('29',  'Boil in Water with 1 Tsp Salt'),
    ('39',  'Mix Till Well Combined'),
    ('39',  'Mix Well'),
    ('228', 'You can toast the wrap in a pan to make it a little crispy and firm'),
    ('234', 'Place Onto 4 Skewers (4-5 Pieces per Skewer)'),
    # Only visible as prose once ACTION_PREFIX stopped hiding its "Add".
    ('10',  'Add water then bring to a boil then simmer on low heat for 8-10 mins till fully cooked'),
    # PROSE, read individually rather than pattern-matched. Each was
    # checked against its recipe first: none names a food that is absent
    # elsewhere. That check is necessary but NOT sufficient — it proves
    # nothing is lost, not that a line is prose — so every one of these
    # was also read. Nineteen more that the check called "safe" were
    # ingredients with a note attached and are normalised, not named.
    ('13',  'Use a whisk to fully combine and mix till smooth'),
    ('15',  'Blend till smooth'),
    ('28',  'Blend Till Smooth'),
    ('15',  'Bring to a Light Bubble Then Lower the Heat and Cover for 8 mins till Fully Cooked'),
    ('22',  'Then Evenly Distribute into 4 Equal Servings'),
    ('223', 'Add Equal Amount Per Burrito Toast in a Pan'),
    ('30',  'Bake or Air Fry for 19 mins at 190°C / 380°F'),
    ('247', 'Extra Seasoning to Taste'),
    ('338', 'Additional seasoning to taste'),
    ('325', 'Salt to taste after cooking'),
    ('234', 'Salt and Pepper To Taste'),
    # Anaphoric: refers to seasoning listed earlier in the same recipe,
    # names no specific food, and cannot be resolved from the line.
    ('28',  '1/2 Tsp of Each Seasoning Used for the Chicken (When Cooking)'),
    ('315', 'Spread evenly on a lined sheet pan, make sure it ﬁlls the pan well'),
}

# ── Lines the source merged with no separator ─────────────────────────
# Two bullets printed as one, with nothing between them. No rule can
# find the boundary — "Sesame Seeds Green Onion" has only a space where
# the separator should be — and both halves are real food, so neither
# splitting by pattern nor excluding is available. Named individually,
# with the split written out, exactly like the exclusions.
HAND_SPLIT = {
    ('6', 'Sesame Seeds Green Onion / Scallion'):
        ['Sesame Seeds', 'Green Onion'],
    ('7', '170g (6oz) Uncooked Macaroni (Optional) Coriander or Parsley for Garnish'):
        ['170g (6oz) Uncooked Macaroni', 'Coriander'],
    ('331', 'Garnish Fresh Parsley & Parmesan Cheese'):
        ['Fresh Parsley', 'Parmesan Cheese'],
}

# ── The seasoning vocabulary ───────────────────────────────────────────
# Derived from the `each:` lines, where items are provably ingredients,
# then frozen. Only lines whose every piece is in here may be split on a
# comma or an ampersand.
SEASONINGS = {
    'salt', 'pepper', 'black pepper', 'white pepper', 'paprika',
    'smoked paprika', 'garlic powder', 'onion powder', 'oregano', 'cumin',
    'turmeric', 'chilli flakes', 'chili flakes', 'chilli powder',
    'chili powder', 'cayenne pepper', 'cayenne', 'thyme', 'basil',
    'dried basil', 'italian herbs', 'mixed herbs', 'parsley',
    'dried parsley', 'coriander', 'cilantro', 'garam masala', 'ginger',
    'garlic', 'onion', 'nutmeg', 'cinnamon', 'curry powder', 'rosemary',
    'sage', 'dill', 'chives', 'bay leaf', 'star anise', 'cardamom',
    'all spice', 'allspice', 'mustard powder', 'celery salt',
    'lemon pepper', 'sesame seeds', 'red pepper flakes',
}

# ── `each` is not always a quantity distributor ────────────────────────
# Three distinct meanings in this corpus:
#
#   A. DISTRIBUTOR (head position)   "1 Tsp each: Salt, Pepper"
#      -> a tsp of every listed item. Splittable.
#
#   B. PER-PIECE WEIGHT (parenthetical or trailing)
#      "800g Raw Salmon Fillets (200g each)"
#      "3 to 4 (19g each) Light Cheese Slices"
#      -> ONE ingredient; `each` describes the piece, not a list.
#         Splitting these would invent ingredients.
#
#   C. ANAPHORIC (refers to an earlier line)
#      "1/2 Tsp of Each Seasoning Used Earlier"
#      -> there is no list on the line at all. Unresolvable here.
#
# B is detected structurally: `each` inside parentheses, or with no
# comma/& list after it. C is detected by the absence of any list plus a
# back-reference word. Both are flagged, never split.
EACH_ANAPHORIC = re.compile(r'each\s+seasoning\s+(used|from)', re.I)

# A distributor head: quantity, unit, then `each`, then a list.
EACH_HEAD = re.compile(
    r'^\s*(?P<qty>[\d\s./½¼¾⅓⅔⅛]*\d[\d\s./½¼¾⅓⅔⅛]*|[½¼¾⅓⅔⅛])\s*'
    r'(?P<unit>tsp|tbsp|teaspoons?|tablespoons?)\s+'
    r'(of\s+)?each\b[:,]?\s*(?P<list>.+)$', re.I)

# "+" IS A LIST SEPARATOR. "/" IS NOT, AND ADDING IT WAS A MISTAKE.
# Measured across all 476 slash-bearing lines: 366 restate a quantity
# ("620g cooked weight"), 58 are synonym pairs, 3 are units or
# temperatures, and every one of the remaining 49 is an alternative
# form of ONE ingredient — Cornflour/Corn Starch, Ground/Mince Beef,
# Low Fat/Skimmed Milk. Not one joins two things you buy both of.
#
# With "/" in this list the gate split "Coriander/Cilantro" into two
# ingredients, because both halves are in the vocabulary. That is the
# invent-an-ingredient failure the gate exists to prevent, caused by
# the separator rather than caught by it.
SPLIT_LIST = re.compile(r'\s*(?:,|\s+and\s+|\s*&\s*|\s*\+\s*)\s*', re.I)

# Same two normalisations build-merge-map.py applies. Named here rather
# than imported so each script reads standalone.
# Imperative prefixes, stripped so the gate can read what follows.
# "with", "to taste" and quantities are absorbed here; the noun list is
# what survives.
IMPERATIVE_PREFIX = re.compile(
    r'^(?:season|sprinkle|coat|rub|dust|toss|add|use|or\s+serve\s+with)\b'
    # `sides?` not `(?:side|sides)` — the alternation matched "side"
    # first and left a stray "s", so the remainder began "s generously
    # with Oregano" and the gate correctly refused a nonsense piece.
    # Longer alternatives first, or a quantifier, in every branch.
    r'(?:\s+(?:both\s+)?(?:sides?|again|generously|lightly|evenly|well|'
    r'them|it|the\s+\w+))*'
    r'\s*(?:with|to\s+taste|in)?\s*(?:a\s+)?(?:pinch|handful|sprinkle|dash)?\s*(?:of\s+)?\s*[:,]?\s*', re.I)

ROLE_PREFIX = re.compile(
    r'^(?:to\s+)?(?:garnish(?:\s+with)?|serve(?:\s+with)?|to\s+serve|'
    r'topping|top\s+with|for\s+(?:cooking|garnish|serving|frying)|'
    r'optional[: ])[:\s]*', re.I)


def norm(s):
    s = re.sub(r'\([^)]*\)', ' ', s)
    return re.sub(r'[^a-z ]', ' ', s.lower()).strip()


def all_seasonings(parts):
    return bool(parts) and all(norm(p) in SEASONINGS for p in parts if norm(p))


def split_line(text):
    """-> (rule_name, [pieces]) or (flag_name, None) or (None, None)."""
    t = text.strip()

    if EACH_ANAPHORIC.search(t):
        return 'FLAG each-anaphoric', None

    # A LINE THAT ENDS IN A CONJUNCTION IS TRUNCATED IN THE SOURCE.
    # "1 Tsp of Each, Salt, Oregano, Cumin, Garlic Powder and" — the
    # book's line runs off and the last item is missing. Splitting it
    # yields an ingredient called "Garlic Powder and" and silently loses
    # whatever followed.
    # A trailing CONJUNCTION means an item is missing. A trailing COMMA
    # does not — "1 Tsp Salt, Paprika, Cumin," is a complete list with
    # stray punctuation, and flagging it would refuse a good split.
    if re.search(r'\b(and)\s*$|[&+]\s*$', t, re.I):
        return 'FLAG truncated-line', None
    t = t.rstrip(' ,')

    # A HEADING GLUED TO THE LINE hides the distributor. The book prints
    # "Spice Mix: ½ Tsp each Smoked Paprika, ..." as one bullet, which
    # puts `each` out of head position and would flag a line that is in
    # fact a perfectly ordinary distributor. The label is carried back
    # onto every piece so nothing is lost.
    label = ''
    lm = re.match(r'^([A-Z][A-Za-z /&-]{2,24}):\s*(.+)$', t)
    if lm:
        # Stripped for EVERY labelled line, not only `each` ones.
        # "Seasoning: Paprika, Garlic Powder" is an ordinary two-item
        # compound wearing the same hat, and the gate never saw past it.
        # The label is carried back onto the pieces only for `each`,
        # where it names a spice mix worth keeping.
        if re.search(r'\beach\b', lm.group(2), re.I):
            label = lm.group(1) + ': '
        t = lm.group(2)

    m = EACH_HEAD.match(t)
    if m:
        qty, unit, lst = m.group('qty').strip(), m.group('unit'), m.group('list')
        # "1 Tsp Each of Paprika, ..." puts the `of` after `each`, so it
        # leads the list rather than the head and rides onto the first
        # ingredient as "of Paprika".
        lst = re.sub(r'^\s*of\s+', '', lst, flags=re.I)
        trailing = ''
        pm = re.search(r'\s*\(([^)]*)\)\s*$', lst)
        if pm:                                  # "(adjust to preference)"
            lst, trailing = lst[:pm.start()], pm.group(1)
        parts = [p.strip(' .') for p in SPLIT_LIST.split(lst) if p.strip(' .')]
        if len(parts) < 2:
            return 'FLAG each-no-list', None
        if any(re.search(r'\d', p) for p in parts):
            return 'FLAG each-list-has-numbers', None
        return 'R1 each-distributor', [f'{label}{qty} {unit} {p}'.strip() for p in parts]

    if re.search(r'\beach\b', t, re.I):
        # Not head position: per-piece weight, or something unmodelled.
        return 'FLAG each-not-head', None

    # A ROLE PREFIX OR A TRAILING PARENTHETICAL HID TEN COMPOUNDS.
    #
    # "Garnish Chilli Flakes & Parsley" and "Salt & Pepper (for
    # seasoning)" are ordinary compounds wearing a hat. The gate never
    # saw them: the prefix made the first piece "garnish chilli flakes",
    # and any line containing a bracket was rejected outright.
    #
    # THIS DOES NOT LOOSEN THE GATE. The vocabulary check is unchanged
    # and still decides; only the input is normalised first, the same
    # two ways build-merge-map.py already normalises it. Verified to
    # change exactly these ten lines and no others:
    #
    #   17  Garnish Chilli Flakes & Parsley
    #  263  Salt, Pepper, Chilli Flakes (for seasoning)
    #  264  Chilli Flakes & Parsley (for garnish)
    #  266  Salt, Pepper, Garlic Powder (for seasoning)
    #  267  Salt & Pepper (for seasoning)
    #  268  Salt, Pepper, Chilli Flakes & Garlic Powder (for seasoning)
    #  276  Pinch of Salt, Pepper and Paprika (For Seasoning)
    #  307  Garnish Sesame Seeds & Red Pepper Flakes
    #  330  Garnish Parsley, Chilli Flakes
    #  352  Garnish with Chilli Flakes & Sesame Seeds
    # AN IMPERATIVE PREFIX IS NOT AN INSTRUCTION TO DISCARD.
    #
    # "Season both sides generously with Oregano, Garlic Powder, Paprika,
    # Onion Powder, Chilli Flakes, Salt" names six spices that appear
    # NOWHERE ELSE in that recipe. Dropping the line loses all six.
    #
    # And a verb-led exclusion rule cannot be made safe: "Cooking Spray",
    # "Boiled Water" and "Boiling Water" are ingredients whose names
    # begin with a verb form, and a first pass at this rule ate all
    # three. So no line is ever dropped for looking like an instruction.
    #
    # Instead the prefix is stripped and THE VOCABULARY GATE DECIDES, the
    # same gate that already refuses to split "Light & Dark Soy Sauce".
    # A seasoning list becomes seasonings; anything else stays whole.
    imp = IMPERATIVE_PREFIX.match(t)
    if imp:
        t = t[imp.end():]

    role = ROLE_PREFIX.match(t)
    if role:
        t = t[role.end():]
    paren = re.search(r'\s*\(([^)]*)\)\s*$', t)
    if paren and re.search(r'season|garnish|serv|taste|top', paren.group(1), re.I):
        t = t[:paren.start()]

    # R2/R3: an all-seasoning tail, with the quantity OPTIONAL.
    #
    # Requiring "<number> <unit>" missed three shapes the book uses often:
    #   "Salt & pepper"              no quantity at all
    #   "Pinch of Salt & Pepper"     a non-numeric quantity
    #   "1-2 Tsp Salt & Pepper"      a RANGE, which the numeric pattern
    #                                stopped at the hyphen
    # All three are the same compound and all three were left whole.
    # The vocabulary gate is what keeps this safe, not the quantity — so
    # the quantity became optional rather than the gate becoming looser.
    qm = re.match(r'^\s*(?P<qty>(?:[\d½¼¾⅓⅔⅛][\d\s./½¼¾⅓⅔⅛-]*)?'
                  r'\s*(?:tsp|tbsp|g|ml)\b\.?|pinch(?:\s+of)?|handful(?:\s+of)?|'
                  r'sprinkle(?:\s+of)?|dash(?:\s+of)?)?\s*(?P<rest>.+)$', t, re.I)
    if not qm:
        return None, None
    rest = qm.group('rest')
    if re.search(r'\(', rest):
        return None, None
    parts = [p.strip(' .') for p in SPLIT_LIST.split(rest) if p.strip(' .')]
    if len(parts) < 2 or not all_seasonings(parts):
        return None, None
    head = (qm.group('qty') or '').strip()
    rule = 'R2 ampersand-pair' if '&' in rest or ' and ' in rest.lower() else 'R3 seasoning-comma-list'
    return rule, [f'{head} {p}'.strip() for p in parts]


def check_named_lines_still_apply(D):
    """Every EXCLUDE and HAND_SPLIT entry must still match a real line.

       These are keyed on a card id and the EXACT text of a line. That is
       deliberate — a pattern for "looks like an instruction" would
       eventually eat a real ingredient, and naming lines cannot. But it
       is also brittle in a way nothing was checking: change one comma in
       the source, re-extract, and the entry quietly stops matching. No
       error anywhere; "blend till smooth" simply reappears as an item on
       a shopping list six months later.

       So the same assertion the typo map gets. A named line that names
       nothing is a lie about the source, and it fails the run rather
       than sitting there excluding nothing.
    """
    present = {(cid, i['text']) for cid, v in D.items() for i in v['ingredients']}
    stale_ex = sorted(k for k in EXCLUDE if k not in present)
    stale_hs = sorted(k for k in HAND_SPLIT if k not in present)
    if not (stale_ex or stale_hs):
        return len(EXCLUDE), len(HAND_SPLIT)

    print('NAMED LINES NO LONGER MATCH THE SOURCE:', file=sys.stderr)
    for cid, text in stale_ex:
        print(f'  EXCLUDE    card {cid}: {text[:70]!r}', file=sys.stderr)
    for cid, text in stale_hs:
        print(f'  HAND_SPLIT card {cid}: {text[:70]!r}', file=sys.stderr)
    # Nearest surviving line on the same card, so the fix is obvious
    # rather than a hunt through the extraction.
    for cid, text in stale_ex + stale_hs:
        near = [t for c, t in present if c == cid and t[:12].lower() == text[:12].lower()]
        if near:
            print(f'  card {cid} now reads: {near[0][:70]!r}', file=sys.stderr)
    raise SystemExit(
        f'{len(stale_ex) + len(stale_hs)} named line(s) match nothing. Update or '
        'remove them — an exclusion that excludes nothing puts the junk it '
        'was written for back on the list, silently.')


def main():
    D = json.load(io.open(SRC, encoding='utf-8'))
    n_ex, n_hs = check_named_lines_still_apply(D)
    rules, flags, excluded = Counter(), Counter(), 0
    examples, flagged_lines = {}, []
    out = {}

    for cid, v in D.items():
        kept = []
        for item in v['ingredients']:
            t = item['text']
            if (cid, t) in HAND_SPLIT:
                for piece in HAND_SPLIT[(cid, t)]:
                    kept.append({'section': item['section'], 'text': piece,
                                 'split_from': t, 'rule': 'HAND source-merged'})
                rules['HAND source-merged'] += 1
                continue
            if (cid, t) in EXCLUDE:
                excluded += 1
                continue
            rule, pieces = split_line(t)
            if rule and rule.startswith('FLAG'):
                flags[rule] += 1
                flagged_lines.append((cid, v['name'], rule, t))
                kept.append(item)
                continue
            if pieces:
                rules[rule] += 1
                examples.setdefault(rule, []).append((cid, t, pieces))
                for p in pieces:
                    kept.append({'section': item['section'], 'text': p,
                                 'split_from': t, 'rule': rule})
                continue
            kept.append(item)
        out[cid] = {**v, 'ingredients': kept}

    _guard.write_json(OUT, out)

    before = sum(len(v['ingredients']) for v in D.values())
    after = sum(len(v['ingredients']) for v in out.values())
    with io.open(REPORT, 'w', encoding='utf-8') as f:
        def w(s=''):
            print(s); f.write(s + '\n')
        w(f'COMPOUND SPLIT — {before} lines in, {after} out '
          f'(+{after - before - 0}), {excluded} excluded by name')
        w()
        for rule in sorted(examples):
            w(f'### {rule} — {rules[rule]} lines')
            for cid, t, pieces in examples[rule]:
                w(f'  card {cid}')
                w(f'    BEFORE  {t}')
                for p in pieces:
                    w(f'    AFTER   {p}')
            w()
        w('### FLAGGED — left whole, needs a human')
        for k, n in flags.most_common():
            w(f'  {k}: {n}')
        for cid, name, rule, t in flagged_lines:
            w(f'    [{rule}] card {cid} {name[:28]}: {t}')
    print(f'\nwrote {OUT} and {REPORT}')


if __name__ == '__main__':
    main()
