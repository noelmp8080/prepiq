# PrepIQ — assign every shopping item to an aisle.
#
# WHY A MAP AND NOT A PATTERN
# A regex over the whole name files things in the wrong aisle, and the
# wrong aisle is worse than no aisle: you walk past it. Two real
# misfilings from the first attempt:
#
#   "minced garlic"        matched /mince/  -> Meat & fish   (it is Produce)
#   "uncooked egg noodles" matched /egg/    -> Dairy         (it is Dry goods)
#
# The first is a substring collision; the second is a real word in the
# wrong role. Whole-word matching fixes only the first. So the rule is:
#
#   1. COMPOUNDS win. "garlic powder" is a spice even though "garlic" is
#      produce; "coconut milk" is a tin even though "milk" is dairy.
#      Longest compound match, anywhere in the name.
#   2. Then the HEAD NOUN — the last word — because English food names
#      put the thing last and the modifiers first. "uncooked egg
#      noodles" heads on noodles; "minced garlic" heads on garlic.
#   3. Anything left is OTHER. Never guessed, always reported, and shown
#      on the list rather than hidden — an unplaced item is still an
#      item you are buying.
#
# `powder` is why compounds have to come first: it is the single most
# common head word in the catalog (421 lines) and it means nothing on
# its own — garlic, onion, chilli and baking powder are three sections.

import json, io, re, sys
sys.path.insert(0, __import__('os').path.dirname(__file__))
import _guard
from collections import Counter, defaultdict

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

SRC    = 'tools/extracted/shopping-catalog.json'
OUT    = 'tools/extracted/section-map.json'
REPORT = 'tools/extracted/section-report.txt'

# ORDER IS DATA, NOT STRUCTURE. This list is the walk through the shop,
# and it is a plain sequence so it can become a user preference later
# without touching anything that reads it. Nothing downstream may assume
# these names or this order — they look them up.
SECTION_ORDER = [
    'Produce',
    'Bakery',
    'Meat & fish',
    'Dairy & chilled',
    'Tins & jars',
    'Dry goods',
    'Sauces, oils & condiments',
    'Spices & seasoning',
    'Frozen',
    'Other',                       # always last, always shown, never hidden
]
COLLAPSED_BY_DEFAULT = {'Spices & seasoning'}
HIDDEN_WHEN_EMPTY    = set(SECTION_ORDER) - {'Other'}

P, B, M, D, T, G, C, S, F = (
    'Produce', 'Bakery', 'Meat & fish', 'Dairy & chilled', 'Tins & jars',
    'Dry goods', 'Sauces, oils & condiments', 'Spices & seasoning', 'Frozen')

# ── Compounds: checked first, longest first ───────────────────────────
COMPOUNDS = {
    # the powder problem
    'garlic powder': S, 'onion powder': S, 'chilli powder': S, 'chili powder': S,
    'curry powder': S, 'mustard powder': S, 'baking powder': G, 'protein powder': G,
    'cocoa powder': G, 'garlic granule': S,
    # pepper: spice or vegetable
    'black pepper': S, 'white pepper': S, 'lemon pepper': S, 'cayenne pepper': S,
    'bell pepper': P, 'chilli pepper': P, 'red pepper flakes': S, 'peppercorn': S,
    # milk: dairy or tin
    'coconut milk': T, 'almond milk': T, 'oat milk': T, 'soy milk': T,
    'evaporated milk': T, 'condensed milk': T,
    # juice: produce, not the drinks aisle
    'lemon juice': P, 'lime juice': P, 'orange juice': P, 'pickle juice': T,
    'jalapeno juice': T,
    # noodles/pasta over their modifiers
    'egg noodles': G, 'rice noodles': G, 'macaroni pasta': G,
    # sauces vs the vegetable
    'bbq sauce': C, 'soy sauce': C, 'hot sauce': C, 'brown sugar': G,
    'tomato paste': T, 'tomato puree': T, 'canned tomato': T, 'chopped tomato': T,
    'sundried tomato': T, 'cherry tomato': P,
    # bakery over "wrap"/"bun"
    'tortilla wrap': B, 'brioche bun': B, 'burger bun': B, 'corn tortilla': B,
    # chilled deli
    'turkey bacon': D, 'parmigiano reggiano': D, 'cream cheese': D,
    'cottage cheese': D, 'cheddar cheese': D, 'feta cheese': D,
    # oils and sprays
    'olive oil': C, 'sesame oil': C, 'avocado oil': C, 'vegetable oil': C,
    'cooking spray': C, 'oil spray': C,
    # seeds
    'sesame seeds': S, 'chia seeds': G, 'pumpkin seeds': G,
    # egg white is a product, not a colour
    'egg white': 'Dairy & chilled', 'egg yolk': 'Dairy & chilled',
    'chocolate chip': 'Dry goods', 'cacao nib': 'Dry goods',
    'vanilla extract': 'Dry goods', 'baking soda': 'Dry goods',
    'all spice': 'Spices & seasoning', 'chinese spice': 'Spices & seasoning',
    'mint leave': 'Produce', 'fresh mint': 'Produce',
    # water is not bought
    'pasta water': None, 'boiled water': None, 'boiling water': None, 'water': None,
    # RULINGS (user, 2026-08-19)
    # Brine from a jar you are already buying — not a separate purchase,
    # same class as water.
    'jalapeno juice': None, 'kimchi juice': None, 'pickle juice': None,
    # An assembly back-reference: card 251 lists "3 Kebabs (per Wrap)" in
    # its Wrap section, beside flatbread and lettuce. You made them.
    'kebab': None,
    # Consistent with lemon/lime/orange: you buy the fruit, and one item
    # does not reopen the Drinks section argued against earlier.
    'pineapple juice': 'Produce',
    # Its own aisle in a real shop, but two items do not earn a section.
    # Other is where honest uncertainty goes.
    'instant coffee': 'Other', 'coffee shot': 'Other', 'coffee': 'Other',
}

# ── Head nouns: the last word, checked second ─────────────────────────
HEADS = {
    # Produce
    'onion': P, 'garlic': P, 'tomato': P, 'carrot': P, 'lettuce': P, 'cucumber': P,
    'avocado': P, 'lemon': P, 'lime': P, 'cabbage': P, 'coriander': P, 'cilantro': P,
    'parsley': P, 'ginger': P, 'spinach': P, 'potato': P, 'broccoli': P, 'mushroom': P,
    'courgette': P, 'zucchini': P, 'aubergine': P, 'eggplant': P, 'chilli': P,
    'jalapeno': P, 'banana': P, 'strawberry': P, 'mango': P, 'apple': P, 'kiwi': P,
    'blueberry': P, 'raspberry': P, 'pineapple': P, 'watermelon': P, 'celery': P,
    'leek': P, 'pea': P, 'sprout': P, 'shallot': P, 'scallion': P, 'peel': P, 'zest': P,
    'salad': P, 'veg': P, 'vegetable': P, 'herb': P, 'lettuce': P,
    # Bakery
    'bun': B, 'bread': B, 'wrap': B, 'tortilla': B, 'baguette': B, 'naan': B,
    'pitta': B, 'roll': B, 'bagel': B, 'crumpet': B,
    # Meat & fish
    'chicken': M, 'breast': M, 'thigh': M, 'beef': M, 'steak': M, 'mince': M,
    'salmon': M, 'shrimp': M, 'prawn': M, 'tuna': M, 'turkey': M, 'lamb': M,
    'pork': M, 'bacon': M, 'sausage': M, 'chorizo': M, 'fillet': M, 'wing': M,
    'sirloin': M, 'kofta': M, 'cod': M, 'haddock': M,
    # Dairy & chilled
    'cheese': D, 'yogurt': D, 'yoghurt': D, 'milk': D, 'butter': D, 'egg': D,
    'cream': D, 'mozzarella': D, 'parmesan': D, 'reggiano': D, 'halloumi': D,
    'feta': D, 'ricotta': D, 'mascarpone': D, 'quark': D, 'skyr': D,
    # Tins & jars
    'bean': T, 'lentil': T, 'chickpea': T, 'passata': T, 'olive': T, 'gherkin': T,
    'pickle': T, 'sweetcorn': T,
    # Dry goods
    'rice': G, 'pasta': G, 'noodles': G, 'noodle': G, 'macaroni': G, 'spaghetti': G,
    'penne': G, 'fusilli': G, 'linguine': G, 'flour': G, 'cornflour': G, 'oat': G,
    'oats': G, 'sugar': G, 'cornflake': G, 'breadcrumb': G, 'panko': G, 'quinoa': G,
    'couscous': G, 'stock': G, 'gelatine': G, 'yeast': G,
    # Sauces, oils & condiments
    'sauce': C, 'oil': C, 'honey': C, 'vinegar': C, 'mayo': C, 'mayonnaise': C,
    'sriracha': C, 'ketchup': C, 'mustard': C, 'paste': C, 'syrup': C, 'jam': C,
    'marinade': C, 'dressing': C, 'salsa': C, 'pesto': C, 'tahini': C, 'hummus': C,
    'gochujang': C, 'harissa': C, 'spray': C, 'relish': C, 'chutney': C,
    # Spices & seasoning
    'salt': S, 'pepper': S, 'paprika': S, 'cumin': S, 'oregano': S, 'turmeric': S,
    'flakes': S, 'herbs': S, 'basil': S, 'thyme': S, 'rosemary': S, 'sage': S,
    'cinnamon': S, 'nutmeg': S, 'cardamom': S, 'masala': S, 'seasoning': S,
    'seeds': S, 'powder': S, 'granule': S, 'bay': S, 'anise': S, 'dill': S,
    'chives': S, 'allspice': S, 'mix': S, 'sumac': S, 'stevia': S,
    'zaatar': S, 'sazon': S, 'adobo': S, 'harissa': S,
    # nuts, dried fruit and baking — found in the unplaced bucket
    'nut': G, 'peanut': G, 'walnut': G, 'almond': G, 'cashew': G, 'pecan': G,
    'pistachio': G, 'raisin': G, 'date': G, 'sultana': G, 'extract': G,
    'soda': G, 'chip': G, 'nib': G, 'granola': G, 'cereal': G, 'honeycomb': G,
    'chocolate': G, 'cocoa': G, 'protein': G, 'gelatin': G, 'sweetener': G,
    # cheeses by name
    'cheddar': D, 'gouda': D, 'brie': D, 'emmental': D, 'gruyere': D,
    'creme': D, 'skimmed': D,
    # more produce
    'mint': P, 'basil': P, 'rocket': P, 'kale': P, 'beetroot': P, 'radish': P,
    'squash': P, 'pumpkin': P, 'corn': P, 'sweetcorn': P, 'peach': P, 'pear': P,
    'grape': P, 'melon': P, 'cherry': P, 'plum': P, 'fig': P, 'leave': P,
    # fermented / chilled jars
    'kimchi': T, 'sauerkraut': T, 'flatbread': B, 'crouton': B,
    # heads found in the unplaced bucket, second pass
    'leaf': P, 'leave': P, 'chunk': P, 'asparagus': P, 'glove': P, 'clove': P,
    'floret': P, 'stalk': P, 'wedge': P, 'half': P,
    'can': T, 'jar': T, 'broth': G, 'cake': G, 'wafer': G, 'crisp': G,
    'stock': G, 'noodle': G, 'crumb': G, 'bar': G, 'shot': 'Other',
}

FROZEN = re.compile(r'\bfrozen\b')


def classify(name):
    """-> (section, rule, matched_term). section None means 'do not buy'."""
    words = name.split()
    if not words:
        return 'Other', 'empty', ''
    if FROZEN.search(name):
        return F, 'frozen', 'frozen'
    for term in sorted(COMPOUNDS, key=len, reverse=True):
        if re.search(rf'\b{re.escape(term)}\b', name):
            return COMPOUNDS[term], 'compound', term
    head = words[-1]
    if head in HEADS:
        return HEADS[head], 'head', head
    # A head we do not know, but an earlier word we do — reported as
    # low confidence rather than used, because the head is the thing.
    for w in reversed(words[:-1]):
        if w in HEADS:
            return 'Other', 'unknown-head', f'{head} (knew "{w}")'
    return 'Other', 'unmatched', head


def main():
    counts = json.load(io.open(SRC, encoding='utf-8'))['counts']
    placed, rules = defaultdict(list), Counter()
    lowconf, unmatched, skipped = [], [], []

    for name, n in counts.items():
        section, rule, term = classify(name)
        rules[rule] += 1
        if section is None:
            skipped.append((name, n))
            continue
        placed[section].append(name)
        if rule == 'unknown-head':
            lowconf.append((name, n, term))
        elif rule == 'unmatched':
            unmatched.append((name, n))

    json.dump({'order': SECTION_ORDER,
               'collapsed': sorted(COLLAPSED_BY_DEFAULT),
               'hideWhenEmpty': sorted(HIDDEN_WHEN_EMPTY),
               'sections': {s: sorted(placed.get(s, [])) for s in SECTION_ORDER},
               'notBought': sorted(n for n, _ in skipped)},
              io.open(OUT, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    _guard.assert_clean(io.open(OUT, encoding='utf-8').read(), OUT)

    with io.open(REPORT, 'w', encoding='utf-8') as f:
        def w(s=''):
            print(s); f.write(s + '\n')
        w(f'SECTION MAP — {len(counts)} items')
        for s in SECTION_ORDER:
            w(f'  {s:28} {len(placed.get(s, [])):4}')
        w(f'  {"(not bought)":28} {len(skipped):4}')
        w()
        w(f'by rule: ' + ', '.join(f'{k}={v}' for k, v in rules.most_common()))
        w()
        w(f'### UNPLACED — landed in Other, shown on the list, never guessed ({len(unmatched)})')
        for n, c in sorted(unmatched, key=lambda x: -x[1]):
            w(f'  {c:4}  {n}')
        w()
        w(f'### LEAST CONFIDENT — head word unknown, an earlier word was known ({len(lowconf)})')
        for n, c, t in sorted(lowconf, key=lambda x: -x[1]):
            w(f'  {c:4}  {n}   head={t}')
    print(f'\nwrote {OUT} and {REPORT}')


if __name__ == '__main__':
    main()
