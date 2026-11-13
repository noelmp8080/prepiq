# Recipe content — everything the recipe sheet shows beyond name and macros.
#
#   py -3 tools/extract-recipe-content.py
#
# Reads the two cookbooks in source-pdfs/ and writes src/data/recipeContent.json,
# keyed by card id. Every string in it is printed in the books; nothing is
# composed. A field the book does not print for a recipe is left out.
#
#   intro     the one or two sentences under the title
#   makes     what the recipe makes, as printed ("4 SERVINGS", "3 WRAPS")
#   groups    ingredients in the book's named parts — taken from
#             tools/extracted/ingredients.json, the extraction the grocery list
#             already uses (checked line-for-line: 4,545 lines vs 4,543 bullets)
#   steps     [{title?, text}] — titles only where the book prints one
#   notes     Jalal's tip box, or Meal Prep's "Important Cooking Notes"
#   videos    {youtube, tiktok, instagram} — the page's own links
#   batch     true for the 17 batch proteins (Meal Prep pp.240-273)
#   withSauce [kcal, protein, carbs, fat] when the book prints a with-sauce row
#   serve     meal ideas ("Best ways to serve and pair this protein")
#   sauces    sauce pairings ("Sauce pairing suggestions")
#
# Which PDF page belongs to which card comes from ingredients.json (card id ->
# book + page), so this never matches recipes by name.

import fitz, json, re, io, sys
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

PDF = {
    'jalal': "source-pdfs/Jalal's Cookbook V3.pdf",
    'mealprep': 'source-pdfs/The Meal Prep Cookbook V5.pdf',
}
WHITE = {'ffffff', 'f2f2f2'}
# Meal Prep pages that are not recipes: front matter and tips (1-15), the
# batch-cooking intro (236-239) and the storage guide + back cover (274-277).
NONREC = set(range(1, 16)) | {236, 237, 238, 239, 274, 275, 276, 277}


def clean(s):
    s = re.sub(r'\s+', ' ', s or '').strip()
    s = re.sub(r'\s*»+\s*(Continue)?\s*$', '', s)       # "»» » Continue" page-turn marks
    return s.replace('»', '').strip()


def spans_of(page):
    out = []
    for b in page.get_text('dict')['blocks']:
        if b['type'] != 0:
            continue
        for ln in b['lines']:
            for s in ln['spans']:
                if s['text'].strip():
                    out.append((s['font'], round(s['size'], 1), '%06x' % s['color'],
                                round(s['bbox'][0], 1), round(s['bbox'][1], 1), s['text'], round(s['bbox'][2], 1)))
    return out


def links_of(page):
    return [l.get('uri') for l in page.get_links() if l.get('uri')]


LETTERSPACED = re.compile(r'^(?:[A-Z&():]{1,2} ){3,}')


def geometry_words(page, span_text):
    """Word breaks of a letter-spaced line, read from glyph x-gaps.
    (Same method as tools/fix-spaced-labels.py.)"""
    target = re.sub(r'\s+', '', span_text)
    for block in page.get_text('rawdict')['blocks']:
        for line in block.get('lines', []):
            for span in line['spans']:
                vis = [c for c in span['chars'] if not c['c'].isspace()]
                if ''.join(c['c'] for c in vis) != target or len(vis) < 2:
                    continue
                gaps = [vis[i + 1]['bbox'][0] - vis[i]['bbox'][2] for i in range(len(vis) - 1)]
                small = sorted(gaps)[len(gaps) // 2]
                out = vis[0]['c']
                for i, g in enumerate(gaps):
                    if g > small + max(1.2, small * 0.9):
                        out += ' '
                    out += vis[i + 1]['c']
                return out
    return None


# ── Jalal's Cookbook: one recipe per page ─────────────────────────────

def parse_jalal(doc):
    out = {}
    for pi in range(4, 148):
        page = doc[pi]
        S = spans_of(page)
        r = {'page': pi + 1, 'links': links_of(page), 'steps': [], 'tips': []}
        i_ing = next((i for i, s in enumerate(S) if s[1] == 16.0 and s[5].strip().startswith('Ingredients')), None)
        i_how = next((i for i, s in enumerate(S) if s[1] == 16.0 and s[5].strip().startswith('How to make')), None)
        y_ing = S[i_ing][4] if i_ing is not None else 9999
        desc = ' '.join(s[5] for s in S if s[0].startswith('DMSans-Light') and s[2] in WHITE and s[4] < y_ing)
        if not clean(desc):
            desc = ' '.join(s[5] for i, s in enumerate(S)
                            if s[0].startswith('DMSans-Light') and s[1] == 12.0 and (i_ing is None or i < i_ing))
        r['desc'] = clean(desc)
        r['servings'] = clean(' '.join(s[5] for s in S if s[1] == 12.0 and s[0].startswith('DMSans-9ptRegular')
                                       and abs(s[4] - y_ing) < 12))
        # tip box text (white on black) can sit anywhere below the macros
        for i in range((i_ing or 0) + 1, len(S)):
            if S[i][2] in WHITE and 'TAP ICONS' not in S[i][5] and 'Return to Table' not in S[i][5]:
                r['tips'].append(S[i][5])
        if i_how is not None:
            stp = None
            for i in range(i_how + 1, len(S)):
                f, sz, c, x, y, t, x1 = S[i]
                if 'TAP ICONS' in t or 'Return to Table' in t or c in WHITE:
                    continue
                if re.match(r'^\s*\d+\.\s*$', t) or re.match(r'^\s*\d+\.\t', t):
                    stp = [re.sub(r'^\s*\d+\.\s*', '', t)]
                    r['steps'].append(stp)
                    continue
                if stp is not None:
                    stp.append(t)
            r['steps'] = [join_lines(x) for x in r['steps']]
        r['tips'] = clean(' '.join(r['tips']))
        out[pi + 1] = r
    return out


def flow(parts):
    """Join (page, y, x0, x1, text) spans into one paragraph. A new printed
    line gets a space. On the same line, spans are joined with a space only
    where there is a visible gap: the book splits single words across runs
    ("l" + "ined") and also sets words in bold mid-line ("extra" + "tikka")."""
    s, last = '', None
    for p, y, x0, x1, t in parts:
        if last is not None and not s.endswith((' ', '-')) and not t.startswith(' '):
            lp, ly, lx1 = last
            if p != lp or abs(y - ly) >= 2 or x0 - lx1 > 0.8:
                s += ' '
        s += t
        last = (p, y, x1)
    return prose(s)


def prose(s):
    s = clean(s)
    return re.sub(r'\s+([.,;:!?])(?=\s|$)', r'\1', s)       # "butter ." -> "butter."


def join_lines(parts):
    """Join the spans of one paragraph. A span that ends a printed line has no
    trailing space, so a bare join would glue "the" + "chicken" together —
    unless the line broke on a hyphen."""
    s = ''
    for p in parts:
        if not s or s.endswith((' ', '-', '–', '/')) or p.startswith(' '):
            s += p
        else:
            s += ' ' + p
    return prose(s)


# ── The Meal Prep Cookbook: cover page + one or more content pages ────

def parse_mealprep(doc):
    out = {}
    cur = None
    for pi in range(doc.page_count):
        n = pi + 1
        if n in NONREC:
            cur = None
            continue
        page = doc[pi]
        S = spans_of(page)
        full = ' '.join(s[5] for s in S)
        mnum = re.search(r'Recipe\s*#\s*(\d+)', full)
        if mnum and 'Nutritional Facts' in full:
            cur = {'page': n, 'batch': n >= 240, 'links': links_of(page), 'steps': [], 'notes': [],
                   'serve': [], 'sauce': [], 'servings': ''}
            cur['makes'] = clean(' '.join(t for f, sz, c, x, y, t, x1 in S
                                          if f.startswith('Bricolage') and re.search(r'PER SERVING|Macros Per Serving', t, re.I)))
            cur['variants'] = [clean(t) for f, sz, c, x, y, t, x1 in S if f.startswith('Bricolage') and re.search(r'Sauce', t)]
            nums = [(y, x, clean(t)) for f, sz, c, x, y, t, x1 in S
                    if sz == 14.0 and f.startswith('DMSans-9ptRegular') and re.search(r'\d', t)]
            cur['macros_raw'] = [t for y, x, t in sorted(nums)]
            cur['desc'] = clean(' '.join(t for f, sz, c, x, y, t, x1 in S
                                         if sz == 12.0 and f.startswith('DMSans-9ptRegular') and c == '141414'))
            out[n] = cur
            continue
        if cur is None:
            continue
        cur['links'] += [l for l in links_of(page) if l not in cur['links']]
        # a section carries on across a page turn until the next heading
        mode = cur.get('_mode')
        stp = cur['steps'][-1] if mode == 'ins' and cur['steps'] else None
        for f, sz, c, x, y, t, x1 in S:
            ct = clean(t)
            if ct == 'THE MEAL PREP COOK BOOK' or 'Return to Table' in t or (re.match(r'^\d+$', ct) and y > 790):
                continue
            if f.startswith('DMSans18pt-SemiBold') and sz >= 15:
                if ct.startswith('INGREDIENTS'):
                    mode = 'ing'
                    cur['servings'] = ct
                elif ct.startswith('INSTRUCTIONS'):
                    mode = 'ins'
                elif ct.startswith('IMPORTANT'):
                    mode = 'notes'
                elif ct.startswith('BEST WAYS'):
                    mode = 'serve'
                elif ct.startswith('SAUCE PAIRING'):
                    mode = 'sauce'
                else:
                    mode = None
                stp = None
                continue
            if mode == 'ins':
                if f.startswith('Wingdings'):
                    continue
                raw = t.strip()
                if re.match(r'^S\s*T\s*E\s*P', raw):
                    label = raw
                    if LETTERSPACED.match(label + ' '):
                        label = geometry_words(page, raw) or label
                    m = re.match(r'^S\s*T\s*E\s*P\s*\d+\s*:?\s*(.*)$', label)
                    stp = {'title': clean(m.group(1)) if m else '', 'parts': []}
                    cur['steps'].append(stp)
                    continue
                if re.match(r'^F\s*I\s*N\s*A\s*L\s*S\s*T\s*E\s*P\s*:?$', raw):
                    stp = {'title': '', 'parts': []}          # "FINAL STEP" (p.69)
                    cur['steps'].append(stp)
                    continue
                if not ct or ct.replace('»', '').strip() in ('', 'Continue'):
                    continue
                if stp is None:
                    continue
                if LETTERSPACED.match(raw + ' ') and not stp['parts']:
                    # a letter-spaced sub-title under the step label, e.g.
                    # "( K E E P W H O L E F O R S TO R AG E )"
                    sub = clean(geometry_words(page, raw) or raw)
                    stp['title'] = clean(stp['title'] + ' ' + sub)
                    continue
                stp['parts'].append((pi, y, x, x1, t.replace('»', '')))
            elif mode == 'notes':
                if f.startswith('Wingdings'):
                    cur['notes'].append([])
                    continue
                if not cur['notes']:
                    cur['notes'].append([])
                cur['notes'][-1].append((pi, y, x, x1, t))
            elif mode == 'serve' and not f.startswith('Wingdings'):
                cur['serve'].append(ct)
            elif mode == 'sauce' and not f.startswith('Wingdings'):
                cur['sauce'].append(ct)
        cur['_mode'] = mode
    for r in out.values():
        r['steps'] = [{'title': s['title'], 'text': flow(s['parts'])} for s in r['steps']]
        r['notes'] = [flow(n) for n in r['notes']]
    return out


# ── Shaping ───────────────────────────────────────────────────────────

def dash_list(lines):
    """'– item' lines (the dash sometimes on its own line) -> items. The lead-in
    sentence before the first dash is dropped; the sheet's own label says it."""
    items, cur = [], None
    for ln in lines:
        m = re.match(r'^[–—-]\s*(.*)$', ln)
        if m:
            cur = [m.group(1)]
            items.append(cur)
        elif cur is not None:
            cur.append(ln)
    return [clean(' '.join(x)) for x in items if clean(' '.join(x))]


def video_links(links):
    v = {}
    for u in links:
        k = ('youtube' if re.search(r'youtu\.?be', u) else
             'tiktok' if 'tiktok.com' in u else
             'instagram' if 'instagram.com' in u else None)
        if k and k not in v:
            v[k] = u
    return v


def jalal_makes(s):
    s = clean(s).strip('() ').strip()
    s = re.sub(r'\s+\)', ')', s)
    if not s:
        return None
    m = re.match(r'^(\d+(?:\s*[-–]\s*\d+)?)\s+Servings?$', s, re.I)
    if m:
        n = re.sub(r'\s+', '', m.group(1))
        return f'{n} SERVING' + ('' if n == '1' else 'S')
    s = re.sub(r'^for\s+', '', s, flags=re.I)
    s = re.sub(r'(\d)\s*-\s*(\d)', r'\1-\2', s)
    return 'MAKES ' + s.upper()


def mealprep_makes(r):
    for src in (r['servings'], r['makes']):
        m = re.search(r'(\d+)\s*SERVINGS|SERVES\s*(\d+)|MAKES\s*(\d+)|\((\d+)\s*TOTAL\)', src or '', re.I)
        if m:
            n = next(g for g in m.groups() if g)
            return f'{n} SERVINGS'
    return None


def sentences(s):
    return [clean(x) for x in re.split(r'(?<=[.!?])\s+(?=[A-Z])', s) if clean(x)]


def num(s):
    return float(re.sub(r'[^\d.]', '', s))


def main():
    root = Path(__file__).resolve().parent.parent
    ing = json.loads((root / 'tools/extracted/ingredients.json').read_text(encoding='utf-8'))
    cards = {int(m.group(1)): [float(m.group(i)) for i in range(2, 6)] for m in re.finditer(
        r'id:(\d+), name:"[^"]*", cal:([\d.]+), protein:([\d.]+), carbs:([\d.]+), fat:([\d.]+)',
        (root / 'src/data/recipes.js').read_text(encoding='utf-8'))}

    docs = {k: fitz.open(str(root / v)) for k, v in PDF.items()}
    J = parse_jalal(docs['jalal'])
    M = parse_mealprep(docs['mealprep'])

    content, warn = {}, []
    for sid, e in sorted(ing.items(), key=lambda kv: int(kv[0])):
        cid = int(sid)
        if cid not in cards:
            warn.append(f'id {cid} is in ingredients.json but has no card')
            continue
        book = e['book']
        r = J.get(e['page'] + 1) if book == 'jalal' else M.get(e['page'])
        if r is None:
            warn.append(f'id {cid}: no parsed page for {book} {e["page"]}')
            continue
        c = {}
        if r['desc']:
            c['intro'] = r['desc']
        makes = jalal_makes(r['servings']) if book == 'jalal' else mealprep_makes(r)
        if makes:
            c['makes'] = makes

        groups = []
        for it in e['ingredients']:
            name = clean(it.get('section') or '') or None
            text = clean(it['text'])
            if not text:
                continue
            if groups and name == 'Continue':
                # the "»» » Continue" page-turn mark, read as a heading
                name = groups[-1]['name']
            elif groups and name and name[0].islower():
                # the tail of the previous line, read as a heading
                # ("…to keep mostly the crisp" / "well")
                groups[-1]['items'][-1] += ' ' + name
                name = groups[-1]['name']
            if not groups or groups[-1]['name'] != name:
                groups.append({'name': name, 'items': []})
            groups[-1]['items'].append(text)
        c['groups'] = groups

        if book == 'jalal':
            c['steps'] = [{'text': s} for s in r['steps'] if s]
            if r['tips']:
                c['notes'] = sentences(r['tips'])
        else:
            c['steps'] = [({'title': s['title'], 'text': s['text']} if s['title'] else {'text': s['text']})
                          for s in r['steps'] if s['text']]
            notes = [clean(n) for n in r['notes'] if clean(n)]
            if notes:
                c['notes'] = notes

        v = video_links(r['links'])
        if v:
            c['videos'] = v

        if book == 'mealprep' and r['batch']:
            c['batch'] = True
            raw = r['macros_raw']
            if len(raw) == 8 and [x.lower() for x in r['variants']] == ['without sauce', 'with sauce']:
                base, sauce = [num(x) for x in raw[:4]], [num(x) for x in raw[4:]]
                if base != cards[cid]:
                    warn.append(f'id {cid}: card macros {cards[cid]} != book without-sauce row {base}')
                else:
                    c['withSauce'] = [int(x) if x == int(x) else x for x in sauce]
            serve, sauces = dash_list(r['serve']), dash_list(r['sauce'])
            if serve:
                c['serve'] = serve
            if sauces:
                c['sauces'] = sauces

        if not c['steps']:
            warn.append(f'id {cid}: no steps parsed')
        content[str(cid)] = c

    missing = sorted(set(cards) - {int(k) for k in content})
    if missing:
        warn.append(f'cards with no content: {missing}')

    out = root / 'src/data/recipeContent.json'
    out.write_text(json.dumps(content, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')

    n = len(content)
    cnt = lambda k: sum(1 for c in content.values() if k in c)
    print(f'wrote {out.relative_to(root)}: {n} recipes, {out.stat().st_size // 1024} KB')
    for k in ('intro', 'makes', 'notes', 'videos', 'batch', 'withSauce', 'serve', 'sauces'):
        print(f'  {k:10s} {cnt(k)}')
    print(f'  grouped    {sum(1 for c in content.values() if any(g["name"] for g in c["groups"]))}')
    print(f'  titled     {sum(1 for c in content.values() if any("title" in s for s in c["steps"]))}')
    for w in warn:
        print('WARN', w)


if __name__ == '__main__':
    main()
