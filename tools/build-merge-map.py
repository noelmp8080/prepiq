# PrepIQ — collapse ingredient lines into shopping items.
#
# TWO JOBS
#   1. One line per thing you buy, merged ACROSS sub-recipe sections.
#      Card 11 needs "1 Tsp Salt & Pepper" under both Chicken and Creamy
#      Green Sauce; you buy salt once. The section tags stay in the data
#      so a later screen can show which sub-recipe wants what — merging
#      is a VIEW over the lines, never a loss of them.
#   2. Merge spelling and descriptor variants: parsley / fresh parsley,
#      carrot / carrots, coriander / cilantro.
#
# THE DANGEROUS MERGE IS A MODIFIER, NOT A PLURAL
# "carrot" and "carrots" are one product. "paprika" and "smoked paprika"
# are two, and merging them puts the wrong jar in the basket. Both look
# identical to a similarity score — one name contains the other — so
# similarity cannot be the rule.
#
# Instead the EXTRA WORDS decide, against two explicit lists:
#
#   SAFE_DESCRIPTORS   words that describe the same product
#                      (raw, fresh, whole, large, chopped)
#   PRODUCT_MODIFIERS  words that make it a different product
#                      (smoked, dark, light, powder, dried, ground)
#
# A pair merges only when every extra word is SAFE. A pair is kept apart
# when any extra word is a PRODUCT_MODIFIER. Anything else — extra words
# in neither list — is REPORTED FOR REVIEW rather than guessed, because
# that is exactly where a wrong merge would hide.

import json, io, re, sys, unicodedata
sys.path.insert(0, __import__('os').path.dirname(__file__))
import _guard
from collections import Counter, defaultdict

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

SRC    = 'tools/extracted/ingredients-split.json'
OUT    = 'tools/extracted/shopping-catalog.json'
REPORT = 'tools/extracted/merge-report.txt'

UNIT = (r'(?:g|kg|oz|lb|ml|l|tsp|tbsp|cups?|cloves?|cans?|tins?|slices?|'
        r'pieces?|servings?|handfuls?|scoops?|pinch(?:es)?|splash(?:es)?|dash(?:es)?)')

SAFE_DESCRIPTORS = {
    'raw', 'fresh', 'whole', 'large', 'medium', 'small', 'extra', 'good',
    'big', 'chopped', 'sliced', 'cubed', 'diced', 'grated', 'crushed',
    'finely', 'thinly', 'roughly', 'cut', 'trimmed', 'peeled', 'boneless',
    'skinless', 'uncooked', 'cooked', 'your', 'choice', 'any', 'optional',
}

PRODUCT_MODIFIERS = {
    # Change which product you buy off the shelf.
    'smoked', 'dark', 'light', 'low', 'reduced', 'fat', 'free', 'skimmed',
    'powder', 'powdered', 'dried', 'ground', 'paste', 'sauce', 'oil',
    'juice', 'zest', 'seeds', 'flakes', 'sodium', 'sugar', 'wholemeal',
    'brown', 'white', 'red', 'green', 'yellow', 'black', 'sweet', 'sour',
    'salted', 'unsalted', 'double', 'single', 'heavy', 'greek', 'plain',
    'self', 'raising', 'gluten', 'vegan', 'minced',
}

# Spelling and naming variants that are the same product.
SYNONYMS = {
    'cilantro': 'coriander',
    'chili': 'chilli',
    'chile': 'chilli',
    'scallion': 'green onion',
    'spring onion': 'green onion',
    'corn flour': 'cornflour',
    'cornstarch': 'cornflour',
    'corn starch': 'cornflour',
    'aubergine': 'eggplant',
    'courgette': 'zucchini',
    'capsicum': 'bell pepper',
}

# ── Typos in the cookbooks ────────────────────────────────────────────
# THE BOOK IS WRONG AND WE RECORD THAT, rather than pretending the source
# is clean. Left of the arrow is what the book prints; right is what the
# ingredient actually is. Fixing these in the extractor would hide the
# fact that the source has errors, and the next extraction would silently
# reintroduce them.
#
# check_typos_still_apply() asserts every entry is still present in the
# extraction. If a cookbook update fixes one, this FAILS rather than
# quietly doing nothing — a stale correction is how a map rots.
SOURCE_TYPOS = {
    'sweecorn': 'sweetcorn',      # jalal, card 28
    'peaut':    'peanut',         # jalal, card 96  "Peaut or Almond Butter"
    'gaprika':  'paprika',        # mealprep, card 258
    'oill':     'oil',            # mealprep, cards 298 and 340  "Olive Oill"
    # Mid-word splits the PDF itself produced — only two in 4,587
    # lines, so a named pair rather than a positional heuristic.
    'chu':      '',               # jalal card 113  "Pineapple Chu nks"
    'nks':      'chunks',
    'choppe':   'chopped',        # jalal card 234  "1 Small Carrot, Choppe"
}

# Head words the "or" rule trusts as real foods. Deliberately small — it
# only has to break ties, not classify.
KNOWN_HEADS = {
    'oat', 'oats', 'rice', 'pasta', 'noodle', 'noodles', 'onion', 'pepper',
    'cheese', 'milk', 'yogurt', 'butter', 'oil', 'sauce', 'chicken', 'beef',
    'tomato', 'potato', 'wrap', 'bun', 'bread', 'tortilla', 'egg', 'flour',
    'sugar', 'salt', 'garlic', 'lemon', 'lime', 'water', 'cream', 'spray',
}

PLURAL_KEEP = {'herbs', 'flakes', 'seeds', 'oats', 'greens', 'chives', 'noodles'}

# Words that genuinely introduce a preparation, so a comma before one is
# safely removable. Same principle as the split gate: a vocabulary, not
# punctuation.
PREP_WORDS = ('chopped|cubed|sliced|diced|grated|crushed|minced|finely|thinly|'
              'roughly|cut|trimmed|peeled|juiced|butterflied|halved|quartered|'
              'shredded|drained|rinsed|deseeded|de-seeded|separated|beaten|'
              'melted|softened|room|at room|to taste|optional|for |trim|fat|de seeded|de-seeded|oil drained|butterfly cut|thin strips|juiced')

# ── Explicit rulings (user, 2026-08-19) ───────────────────────────────
# RENAME rather than guard: "pepper" and "bell pepper" are a spice and a
# vegetable one word apart, and every similarity rule in this file sees
# them as the same thing. Removing the collision beats defending it.
# ── THE TEST FOR AN AMBIGUOUS PAIR (user ruling, 2026-08-19) ─────────
#
#   Would buying the wrong one ruin the meal?
#
# That question decides every merge this file cannot decide by rule, and
# it is the principle rather than the precedent. Worked both ways:
#
#   cream cheese vs cottage cheese      YES — different foods, different
#                                       parts of the chiller. Stay apart.
#   fat free vs low fat greek yogurt    NO — the same food at two fat
#                                       contents, same shelf, one tub
#                                       serves both recipes. Merge.
#
# It is not "how similar are the names" — cheddar and cottage cheese are
# textually closer than fat-free and low-fat yogurt. It is what happens
# in the kitchen when you picked up the other one.

RENAME = {
    'pepper': 'black pepper',

    # ── Names too long for a 375px row, shortened rather than reordered.
    # Moving modifiers into brackets makes them LONGER: "reduced sugar
    # sweet chilli sauce" (32) becomes "chilli sauce (reduced sugar
    # sweet)" (34). So the modifiers are dropped from the row, not
    # relocated — they survive on the expanded chip, via the raw
    # quantity lines, which is where "which exact product" belongs. You
    # scan an aisle for the food and read the label once holding it.
    'reduced sugar sweet chilli sauce': 'sweet chilli sauce',
    'fat free evaporated milk':         'evaporated milk',
    'high protein low calorie wrap':    'low calorie wrap',
    'thin crust lebanese flatbread':    'lebanese flatbread',
    'nando s medium peri marinade':     'peri peri marinade',
    # Both fat contents of one tub — merged under the test above.
    'fat free vanilla greek yogurt':    'vanilla greek yogurt',
    'low fat vanilla greek yogurt':     'vanilla greek yogurt',

    # word-order duplicates of one product
    'freshly squeezed orange juice':    'orange juice',
    'orange juice freshly squeezed':    'orange juice',
    'green onion green onion white':    'green onion',
}

# KEPT SEPARATE BY RULING (user, 2026-08-19). Not enforced by code —
# they are separate because no rule merges them — but recorded so a
# later change cannot quietly fold them together:
#
#   cheeses      low fat cheese / cheddar / cream / cottage
#   pasta shapes uncooked macaroni / penne / linguine / fusilli
#   hot sauces   buffalo / gochujang / habanero
#
# Four cheeses sharing a stem are four purchases. Buying cheddar when
# the recipe wanted cream cheese is precisely the failure a merged list
# would cause, and it would look correct on the screen.

# Merges ruled in by hand. A bulb and a jar are different purchases, so
# `garlic clove` folds into `garlic` while `minced garlic` stays its own
# item.
FORCE_MERGE = {
    # RICE CONVERSION NOTES. The book prints "120g uncooked (approx 300g
    # cooked)" as a yield conversion, not a second product. You buy one
    # bag; the cooked weight is information about it.
    'uncooked basmati rice g cooked': 'uncooked basmati rice',
    'uncooked basmati rice approx g cooked': 'uncooked basmati rice',
    'uncooked basmati rice approx g cooked rice': 'uncooked basmati rice',
    'uncooked basmati rice g cooked rice': 'uncooked basmati rice',
    'uncooked white rice g cooked': 'uncooked white rice',
    'uncooked white rice g cooked rice': 'uncooked white rice',
    'cooked rice per serving': 'cooked rice',
    'cooked jasmine rice per serving': 'cooked jasmine rice',
    'cooked white rice per serving': 'cooked white rice',
    'green onion and sesame seeds': 'green onion sesame seeds',
    'avocado oil cooking spray': 'avocado oil spray',

    'garlic clove': 'garlic',
    'minced garlic clove': 'minced garlic',
    'garlic clove minced': 'minced garlic',
    'salt to taste': 'salt',
    'sprinkle of salt': 'salt',
    'heaping tsp paprika': 'paprika',
    'olive oil for cooking': 'olive oil',
    'or tsp chilli flakes': 'chilli flakes',
    'lime juiced': 'lime juice',
    'whole lime juiced': 'lime juice',
    'egg beaten in one bowl': 'egg',
    'cornflour mixed with ml water': 'cornflour',
    'crushed cornflake per burger': 'crushed cornflake',
    'low calorie wrap': 'low calorie tortilla wrap',
    'uncooked basmati rice cooked weight g per serving': 'uncooked basmati rice',
    'uncooked macaroni pasta g cooked': 'uncooked macaroni pasta',
    'thinly cut cabbage': 'cabbage',
    'red cabbage': 'red cabbage',
}


def depluralise(w):
    if w in PLURAL_KEEP or len(w) <= 3:
        return w
    if w.endswith('ies'):
        return w[:-3] + 'y'
    if w.endswith('oes'):
        return w[:-2]
    if w.endswith('s') and not w.endswith('ss'):
        return w[:-1]
    return w


# ROLE PREFIXES. "Garnish Fresh Parsley" is parsley — you buy it, and
# the leading word says what it is FOR, not what it is. Left in the name
# it produced 82 distinct pseudo-items across 101 lines ("garnish fresh
# parsley" as a thing separate from "fresh parsley"). Named explicitly
# rather than matched as "any leading verb", so it cannot grow teeth and
# start eating ingredients whose name happens to begin with one.
# ACTION PREFIXES. "Add 240g Cooked Egg Noodles" is egg noodles; the
# verb says when to put them in, not what to buy. Eight such lines name
# an ingredient that appears NOWHERE else in their recipe, so dropping
# them for looking like instructions would lose real food. Stripped, not
# dropped — the same treatment as a role prefix, for the same reason.
ACTION_PREFIX = re.compile(
    r'^(?:or\s+serve\s+with|season|sprinkle|drizzle|coat|rub|dust|toss|add|use)\b'
    r'(?:\s+(?:both\s+)?(?:sides?|again|generously|lightly|evenly|well))*'
    r'\s*(?:with|to\s+taste|in)?\s*(?:a\s+)?(?:pinch|handful|dash)?'
    r'\s*(?:of\s+)?\s*[:,]?\s*', re.I)

ROLE_PREFIX = re.compile(
    r'^(?:to\s+)?(?:garnish(?:\s+with)?|serve(?:\s+with)?|to\s+serve|'
    r'topping|top\s+with|for\s+(?:cooking|garnish|serving|frying)|'
    r'optional[: ]|extra)[:\s]*', re.I)


def shopping_name(s):
    t = s
    t = re.sub(r'^[A-Z][A-Za-z /&-]{2,24}:\s*', '', t)     # section label
    # Leading parenthetical first: "(Optional) Drizzle of Sriracha" put a
    # bracket at position 0, so the action prefix never matched and the
    # line stayed prose.
    t = re.sub(r'^\s*\([^)]*\)\s*', '', t)
    t = ACTION_PREFIX.sub('', t)                           # add/use/season/sprinkle
    t = ROLE_PREFIX.sub('', t)                             # garnish/serve-with
    # A trailing role reads like part of the name otherwise:
    # "Drizzle of Sriracha when serving" is sriracha.
    t = re.sub(r'\s+(?:when|for)\s+(?:serving|plating|garnish|serve)\s*$', '', t, flags=re.I)
    # NESTED PARENTHESES. "Cooked Basmati Rice (120g (4.1oz) Per Serve)"
    # — a single pass matches the INNER pair and leaves "Per Serve"
    # stranded in the name. Peeled repeatedly until stable.
    for _ in range(4):
        u = re.sub(r'\([^()]*\)', ' ', t)
        if u == t:
            break
        t = u
    t = re.sub(r'\([^)]*\)?', ' ', t)                     # any unclosed remainder

    # A SECOND SENTENCE GLUED ONTO AN INGREDIENT. The book runs a cooking
    # note straight on from the item: "25g Dark Soy Sauce Oven bake or air
    # fry for 19-22 mins". Only ever strips a TAIL and only at a named
    # starter, so the worst case is a truncated note — it cannot consume
    # the ingredient at the head of the line.
    t = re.sub(r'\s+(?:Note|Oven\s+bake|Air\s+fry|Marinate|Should\s+come|'
               r'Blend\s+till|Whisk|Mix\s+till|Leave\s+(?:it|them|to)|'
               r'Let\s+(?:it|them)|Store\s+(?:it|them|this)|Distribute|'
               r'Bring\s+to|Cook\s+(?:until|till|for))\b.*$', '', t, flags=re.I)
    # trailing purpose clauses
    # Notes appended to a finished ingredient: "fresh preferred",
    # "firm preferably", "extra for sauce", "to garnish". Tail-only.
    t = re.sub(r'\s+(?:fresh|firm|room\s+temperature)\s+(?:preferred|preferably)\s*$', '', t, flags=re.I)
    t = re.sub(r'\s+extra\s+for\s+\w+\s*$', '', t, flags=re.I)
    t = re.sub(r'\s+to\s+garnish\s*$', '', t, flags=re.I)
    # "Raw Chicken Thighs, skinless fat trimmed" — the tail starts with
    # 'skinless', which is a SAFE_DESCRIPTOR rather than a preparation
    # word, so the comma rule did not fire and 'skinless fat' rode into
    # the name.
    t = re.sub(r'\s+skinless\s+fat(?:\s+trimmed)?\s*$', '', t, flags=re.I)
    t = re.sub(r'^room\s+temperature\s+', '', t, flags=re.I)
    t = re.sub(r'^generou?s?\s+amount\s+of\s+', '', t, flags=re.I)
    t = re.sub(r'\s+for\s+(?:cooking|the\s+end|garnish|serving|frying|later|desired\s+\w+|best\s+\w+)\s*$',
               '', t, flags=re.I)
    # LEADING QUANTITY, UNIT, AND "or <second quantity>".
    #
    # "1 Tbsp or 15g Honey" states one ingredient two ways. Stripping the
    # first quantity leaves "or 15g Honey", which no later rule touched
    # because the alternation handler needs something BEFORE the "or" —
    # so the item was called "or g honey". Peeled in a loop instead, so a
    # second or third restatement is handled the same way.
    for _ in range(4):
        before = t
        t = re.sub(r'^[\s\d./½¼¾⅓⅔⅛-]*', '', t)
        t = re.sub(rf'^\s*{UNIT}\b\.?\s*', '', t, flags=re.I)
        t = re.sub(r'^(of|each)\s+', '', t, flags=re.I)
        t = re.sub(r'^(?:a\s+few|a\s+couple(?:\s+of)?|a\s+little)\s+', '', t, flags=re.I)
        t = re.sub(r'^(?:a\s+)?(?:good|big|large|small|generous)?\s*(?:handful|pinch|splash|dash|sprinkle|squeeze|drizzle)(?:\s+of)?\s+', '', t, flags=re.I)
        t = re.sub(r'^or\s+', '', t, flags=re.I)
        if t == before:
            break
    # PREPARATION TAIL — only when the tail actually IS a preparation.
    # Cutting at the first comma assumes what follows is "chopped". On
    # "Red, Green and Yellow Bell Pepper, Finely Chopped" it assumed
    # wrong and produced an ingredient called "red". So the tail is
    # removed only when it starts with a known preparation word, and
    # trailing clauses are peeled one at a time.
    while True:
        m = re.search(rf',\s*({PREP_WORDS})\b[^,]*$', t, re.I)
        if not m:
            break
        t = t[:m.start()]

    # PREPARATION BELONGS TO THE RECIPE, NOT THE PURCHASE.
    #
    # The book writes "Chicken Breast Cut Into Strips" with no comma, so
    # the rule above never fired and the shopping list carried chicken
    # breast four times under four preparations. You buy it once and cube
    # some of it. Same failure as listing recipes instead of ingredients,
    # one layer down.
    #
    # Only TRAILING preparations are stripped. A leading one is part of
    # the product name — "minced garlic" is a jar, not a preparation of a
    # bulb, and that distinction is a ruling this must not undo.
    #
    # The preparation is not lost: the full text stays on every line in
    # ingredients-split.json, exactly as the section tags do, so a recipe
    # view can still say "cut into strips".
    # TRAILING PORTION AND MEASURE WORDS. "light cheese slice", "chicken
    # piece", "raw chicken breast inch", "light mayo g per burger" — the
    # book states how it is portioned, which is not what you buy. Found
    # by the section map: every one of these had an unknown head word,
    # because the head was a unit rather than a food.
    t = re.sub(r'\s+(?:g\s+)?per\s+\w+\s*$', '', t, flags=re.I)
    for _ in range(3):
        t = re.sub(r'\s+(?:slices?|pieces?|parts?|inch|cubes?|servings?|serve|'
                   r'portions?|fillets?|halves|excess\s+fat|fat|de\s+seeded|'
                   r'green\s+part|filling)\s*$', '', t, flags=re.I)
    # "cut into" NEVER introduces something you buy, so it runs to the
    # end of the line rather than matching a fixed shape. The anchored
    # version needed the phrase to be last and was defeated by "Cut Into
    # Thin Strips Cut Diagonally" and "Cut Into 2 Thinner Cutlets".
    t = re.sub(r'\s+cut\s+in(?:to)?\b.*$', '', t, flags=re.I)
    t = re.sub(
        r'\s+(?:(?:\d+\s*)?inch\s+cubed|cubed|'
        r'sliced|chopped|minced|grated|crushed|diced|halved|quartered|'
        r'shredded|julienned|butterflied|trimmed|peeled|drained|rinsed|'
        r'blended|warmed|melted|softened|toasted|fat)\s*$',
        '', t, flags=re.I)

    # ALTERNATIVES — the head noun is not always on the left.
    # "Red or White Onion" is one onion, described two ways; cutting at
    # " or " kept "Red" and threw the noun away. If everything before
    # the "or" is a modifier, the noun must be on the right, so the
    # right-hand alternative is the one that survives.
    # NOT ATTEMPTED: rewriting "&" into "or" so one rule handles both.
    # "Red & White Onion" is one onion, but "Light & Dark Soy Sauce" is
    # one bottle of a light/dark blend — identical shape, opposite
    # meaning. A rewrite that fixed the first turned the second into
    # "dark soy sauce", losing the product the recipe names. The
    # vocabulary gate protects the soy sauce and nothing distinguishes
    # the onion from it, so "medium red white onion" stays as a known
    # defect rather than being fixed at the cost of a real ingredient.
    # A SLASH IS AN ALTERNATION TOO. "Uncooked White Rice/620g cooked
    # weight" and "Lasagna Sheets / 390g Cooked Lasagna Sheets" state
    # one ingredient twice. Normalised to the "or" shape so one rule
    # handles both, and only when a quantity follows the slash — a bare
    # slash like "Coriander/Cilantro" is a synonym, not an alternation.
    t = re.sub(r'\s*/\s*(?=[\d≈]|approx)', ' or ', t, flags=re.I)
    # A slash between two WORDS is an alternation too, and taking the
    # first form is wrong exactly when the head noun sits on the right:
    # "Light/Fat Free Evaporated Milk" became "light". Converted to the
    # "or" shape so the head-noun test below decides — the same rule that
    # already keeps "Red or White Onion" from becoming "red".
    t = re.sub(r'\s*/\s*(?=[A-Za-z])', ' or ', t)
    m = re.search(r'^(?P<a>.+?)\s+or\s+(?P<b>.+)$', t, re.I)
    if m:
        left = [w for w in re.sub(r'[^a-z ]', ' ', m.group('a').lower()).split()]
        head_on_left = any(w not in PRODUCT_MODIFIERS and w not in SAFE_DESCRIPTORS
                           for w in left)
        # "Old Fashioned or Rolled Oats" is oats. Neither "old" nor
        # "fashioned" is a listed modifier, so the modifier test said
        # the head was on the left and produced an item called "old
        # fashioned". When only ONE side ends in a word we recognise
        # as a food, that side is the ingredient regardless.
        la, lb = m.group('a').split(), m.group('b').split()
        ka = bool(la) and la[-1].lower().rstrip('s') in KNOWN_HEADS
        kb = bool(lb) and lb[-1].lower().rstrip('s') in KNOWN_HEADS
        if ka != kb:
            t = m.group('a') if ka else m.group('b')
        else:
            t = m.group('a') if head_on_left else m.group('b')
    # ACCENTS ARE DATA. Stripping non-ASCII turned "Jalapenos" (the
    # book spells it with an n-tilde) into "jalape os" — two words,
    # neither a food. Folded to ASCII first so the letter survives as
    # a letter. This was nearly recorded as a cookbook typo; it was
    # ours.
    t = unicodedata.normalize('NFKD', t)
    t = ''.join(c for c in t if not unicodedata.combining(c))
    t = re.sub(r'[^a-z ]', ' ', t.lower())
    words = [SOURCE_TYPOS.get(w, w) for w in t.split() if w]
    words = [depluralise(w) for w in words]
    t = ' '.join(words)
    for a, b in SYNONYMS.items():
        t = re.sub(rf'\b{re.escape(a)}\b', b, t)
    # Synonym substitution can DOUBLE a word. The book writes
    # "Coriander/Cilantro"; both halves map to coriander, and the result
    # is "coriander coriander" — a name that then competes with the real
    # one and splits its count across two entries.
    t = re.sub(r'\b(\w+)(\s+\1\b)+', r'\1', t)
    # "juice of lemon" -> "lemon juice"
    m = re.match(r'^(juice|zest) of (.+)$', t)
    if m:
        t = f'{m.group(2)} {m.group(1)}'
    t = ' '.join(t.split())
    return RENAME.get(t, t)


def classify(short, long):
    """How do two names differ? -> ('merge'|'separate'|'review', extras)"""
    a, b = set(short.split()), set(long.split())
    if not a < b:
        return None, set()
    extras = b - a
    if extras & PRODUCT_MODIFIERS:
        return 'separate', extras
    if extras <= SAFE_DESCRIPTORS:
        return 'merge', extras
    return 'review', extras


def check_typos_still_apply(S):
    """A typo map that no longer matches the source is a lie about the
       source. If a cookbook update fixes one of these, fail loudly so it
       gets removed, rather than sitting here correcting nothing."""
    blob = ' '.join(i['text'] for v in S.values() for i in v['ingredients']).lower()
    stale = [k for k in SOURCE_TYPOS if k not in blob]
    if stale:
        raise SystemExit(
            'SOURCE_TYPOS is stale — the book no longer prints: '
            + ', '.join(repr(k) for k in stale)
            + '. Remove these entries; a correction that corrects nothing '
              'hides the next real typo.')
    return len(SOURCE_TYPOS)


def main():
    S = json.load(io.open(SRC, encoding='utf-8'))
    n_typos = check_typos_still_apply(S)
    counts = Counter()
    for v in S.values():
        for i in v['ingredients']:
            n = shopping_name(i['text'])
            if len(n) > 1:
                counts[n] += 1

    names = sorted(counts, key=lambda n: (-counts[n], n))
    merged_into, decisions = dict(FORCE_MERGE), []
    for i, short in enumerate(names):
        for long in names:
            if long == short or long in merged_into:
                continue
            verdict, extras = classify(short, long)
            if verdict is None:
                continue
            decisions.append((verdict, short, long, extras, counts[short], counts[long]))
            if verdict == 'merge':
                merged_into[long] = short

    # Resolve chains so nothing points at something that itself merged.
    def root(n, seen=None):
        seen = seen or set()
        while n in merged_into and n not in seen:
            seen.add(n)
            n = merged_into[n]
        return n

    canonical = {n: root(n) for n in names}
    final = Counter()
    for n, c in counts.items():
        final[canonical[n]] += c

    json.dump({'canonical': canonical,
               'counts': dict(final)},
              io.open(OUT, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)

    merges = [d for d in decisions if d[0] == 'merge']
    seps   = [d for d in decisions if d[0] == 'separate']
    revs   = [d for d in decisions if d[0] == 'review']

    with io.open(REPORT, 'w', encoding='utf-8') as f:
        def w(s=''):
            print(s); f.write(s + '\n')
        w(f'MERGE MAP — {len(counts)} names in, {len(final)} shopping items out')
        w(f'  auto-merged (safe descriptors only) : {len(merges)}')
        w(f'  kept separate (product modifier)    : {len(seps)}')
        w(f'  NEEDS REVIEW (unknown extra words)  : {len(revs)}')
        w()
        # WHICH REVIEW PAIRS ARE WORTH A HUMAN'S TIME.
        # A pair only matters if the longer name actually RECURS — a name
        # appearing once is one line on one recipe, and merging it changes
        # its label, not the shopping list. And a real merge candidate
        # differs by a modifier or two; "season with a pinch of salt"
        # differs from "salt" by five words and is a bad NAME, not a
        # merge decision. Both filters are about attention, not safety:
        # nothing below is merged either way.
        actionable = [d for d in revs if d[5] >= 2 and len(d[3]) <= 2]
        noise = [d for d in revs if d not in actionable]
        w(f'### REVIEW — merging these might be wrong ({len(actionable)} actionable, '
          f'{len(noise)} single-use or long-phrase, listed after)')
        for _, short, long, extras, cs, cl in sorted(actionable, key=lambda d: -(d[4] + d[5])):
            w(f'  {short!r} ({cs})  <-  {long!r} ({cl})   extra: {sorted(extras)}')
        w()
        w('### REVIEW (low priority) — appear once, or differ by 3+ words')
        for _, short, long, extras, cs, cl in sorted(noise, key=lambda d: -(d[4] + d[5]))[:30]:
            w(f'  {short!r} ({cs})  <-  {long!r} ({cl})   extra: {sorted(extras)}')
        w()
        w('### KEPT SEPARATE — the modifier makes it another product')
        for _, short, long, extras, cs, cl in sorted(seps, key=lambda d: -(d[4] + d[5]))[:40]:
            w(f'  {short!r} ({cs})  |  {long!r} ({cl})   modifier: {sorted(extras)}')
        w()
        w('### AUTO-MERGED')
        for _, short, long, extras, cs, cl in sorted(merges, key=lambda d: -(d[4] + d[5]))[:40]:
            w(f'  {long!r} ({cl})  ->  {short!r} ({cs})   dropped: {sorted(extras)}')
    print(f'\nwrote {OUT} and {REPORT}')


if __name__ == '__main__':
    main()
