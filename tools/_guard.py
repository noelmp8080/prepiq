# Control-character guard for the catalog pipeline.
#
# WHY THIS EXISTS — three times, same bug.
#
# A regex written as '\b...' inside a NON-raw Python string is not a word
# boundary. Python resolves \b to U+0008 BACKSPACE before the regex
# engine ever sees it, so the pattern silently matches nothing. It does
# not raise, it does not warn, and the file looks correct in every editor
# because a backspace renders as nothing at all.
#
# It has happened three times in this project:
#   1. /\bcardMoved\b/  in a test  -> matched nothing, test passed vacuously
#   2. a second occurrence in the same pass
#   3. ROLE_PREFIX in build-merge-map.py -> 82 pseudo-ingredients survived
#      ("garnish fresh parsley" as an item distinct from "fresh parsley")
#
# Every time, the failure mode was the same and the worst available: a
# pattern that silently matches nothing. Nothing downstream errors; the
# output is simply, quietly, wrong. Case 3 was found only by chasing an
# unrelated oddity in a report.
#
# So: no generated file — source or data — may contain a control
# character, and the check fails loudly rather than warning.

import io
import re
import sys

# Everything in C0 except the three that are legitimately text, plus DEL,
# plus the Unicode replacement char and zero-width characters, which are
# the same class of invisible corruption.
# WRITTEN AS ESCAPES, NEVER AS LITERALS. This file has to name the
# characters it forbids, and pasting them in would make it fail its own
# check — which it did, on the first run. Escapes keep the guard clean
# and mean the file can be scanned by itself.
FORBIDDEN = re.compile(
    '[\\x00-\\x08\\x0b\\x0c\\x0e-\\x1f\\x7f'
    '\\ufffd\\u200b\\u200c\\u200d\\ufeff]'
)

NAMES = {
    '\x00': 'NUL', '\x07': 'BEL', '\x08': 'BACKSPACE (\\b in a non-raw string)',
    '\x0b': 'VTAB', '\x0c': 'FORMFEED', '\x1b': 'ESC', '\x7f': 'DEL',
    '\ufffd': 'U+FFFD REPLACEMENT (a decode went wrong)',
    '\u200b': 'ZERO WIDTH SPACE',
    '\u200c': 'ZERO WIDTH NON-JOINER',
    '\u200d': 'ZERO WIDTH JOINER',
    '\ufeff': 'BOM / ZWNBSP',
}


def find(text, label='<text>'):
    """Return a list of (line, col, char, name) for every forbidden char."""
    hits = []
    for lineno, line in enumerate(text.splitlines(), 1):
        for m in FORBIDDEN.finditer(line):
            ch = m.group()
            hits.append((lineno, m.start() + 1, ch,
                         NAMES.get(ch, f'U+{ord(ch):04X}')))
    return hits


def assert_clean(text, label):
    """Raise if `text` carries a control character. Loud, never a warning."""
    hits = find(text, label)
    if not hits:
        return text
    print(f'CONTROL CHARACTERS IN {label}:', file=sys.stderr)
    for lineno, col, ch, name in hits:
        print(f'  line {lineno} col {col}: {name}', file=sys.stderr)
    raise SystemExit(
        f'{label}: {len(hits)} control character(s). '
        'A \\b in a non-raw string becomes a backspace and the pattern '
        'silently matches nothing — fix the source, do not suppress this.'
    )


def write_text(path, text):
    assert_clean(text, path)
    io.open(path, 'w', encoding='utf-8').write(text)


def write_json(path, obj, **kw):
    import json
    kw.setdefault('indent', 1)
    kw.setdefault('ensure_ascii', False)
    write_text(path, json.dumps(obj, **kw))


def check_sources(paths):
    """Scan the pipeline's own source files. The backspace landed in a
       TOOL, not in its output, so checking only output would have missed
       every one of the three occurrences."""
    bad = 0
    for p in paths:
        try:
            text = io.open(p, encoding='utf-8').read()
        except OSError as e:
            print(f'  cannot read {p}: {e}', file=sys.stderr)
            bad += 1
            continue
        hits = find(text, p)
        if hits:
            bad += 1
            print(f'CONTROL CHARACTERS IN {p}:', file=sys.stderr)
            for lineno, col, ch, name in hits:
                print(f'  line {lineno} col {col}: {name}', file=sys.stderr)
    return bad


if __name__ == '__main__':
    targets = sys.argv[1:] or [
        'tools/_guard.py',
        'tools/extract-ingredients.py',
        'tools/split-compounds.py',
        'tools/build-merge-map.py',
        'tools/extracted/ingredients.json',
        'tools/extracted/ingredients-split.json',
        'tools/extracted/shopping-catalog.json',
        'tools/extracted/compound-report.txt',
        'tools/extracted/merge-report.txt',
    ]
    n = check_sources(targets)
    if n:
        raise SystemExit(f'{n} file(s) contain control characters')
    print(f'clean: {len(targets)} files, no control characters')
