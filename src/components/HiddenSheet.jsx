import Sheet, { SheetHeader } from './Sheet'

/* ── WHAT YOU SAID YOU NEVER NEED ─────────────────────────────────────
 *
 * Hiding a row is the one action on this screen that removes something
 * with no trace left on the list — so it needs somewhere to be undone,
 * or it is a one-way door. This is that somewhere, and it is a sheet
 * rather than a screen because it is a short list you visit rarely.
 *
 * SCOPED OR WHOLE. The header's count opens it with everything hidden;
 * a group's "2 hidden" line opens it with just that recipe's, which is
 * why `items` is a prop rather than read from the store here. The
 * restore action is the same either way — there is one hidden set.
 *
 * HIDDEN, never "excluded". The other set on this screen is day-scoped
 * and transient and the two must not read as the same thing; see
 * DEVIATIONS §22.
 */

const MONO = { fontFamily: 'var(--pq-mono)' }

export default function HiddenSheet({
  open, onClose, items = [], title = 'Hidden items',
  onRestore, onRestoreAll,
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <SheetHeader onClose={onClose}>
        <div style={{
          fontSize: 'var(--pq-size-meal)', fontWeight: 700, color: 'var(--pq-text)',
        }}>{title}</div>
        <div style={{
          ...MONO, fontSize: 'var(--pq-size-eyebrow)', color: 'var(--pq-text-3)',
          letterSpacing: 'var(--pq-track-label)', marginTop: 2,
        }}>{items.length} ITEM{items.length === 1 ? '' : 'S'}</div>
      </SheetHeader>

      {/* `flex: 1, minHeight: 0` — matching RecipeSheet, Settings and
          Plan, which all carry this pair. This sheet was written
          without it.

          HONEST ABOUT WHAT IT FIXES: not the reported bug. I assumed it
          was — a flex item's automatic minimum size is its content, so
          a column child that cannot shrink overflows the panel instead
          of scrolling — and then reverted it to watch the 20-item test
          fail. It did not. `min-height: auto` only resolves to the
          content size when the item's `overflow` is `visible`, and this
          div sets `overflow-y: auto`, so its automatic minimum was
          already 0 and it already scrolled.

          Kept anyway, for one reason: four sheets that differ in a
          detail like this invite the next reader to work out which one
          is right. It is now the same pair in all four. */}
      <div data-sheet-scroll style={{
        flex: 1, minHeight: 0,
        overflowY: 'auto', overscrollBehavior: 'contain',
        padding: '4px var(--pq-gutter) 20px',
      }}>
        {items.length === 0 ? (
          <p style={{
            ...MONO, fontSize: 12, color: 'var(--pq-text-muted)',
            padding: '18px 0', margin: 0,
          }}>NOTHING IS HIDDEN</p>
        ) : items.map(item => (
          <div key={item.itemId} data-hidden-row style={{
            display: 'flex', alignItems: 'center', gap: 12,
            borderBottom: '1px solid var(--pq-rule-row)',
          }}>
            <span style={{
              flex: 1, minWidth: 0, padding: '14px 0',
              fontSize: 'var(--pq-size-row)', fontWeight: 500, color: 'var(--pq-text)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{item.name}</span>
            <button
              onClick={() => onRestore?.(item.itemId)}
              aria-label={`Show ${item.name} again`}
              style={{
                flexShrink: 0, minHeight: 'var(--pq-tap-min)', padding: '0 14px',
                borderRadius: 'var(--pq-r-button)', border: '1px solid var(--pq-rule-soft)',
                background: 'transparent', cursor: 'pointer', color: 'var(--pq-text-2)',
                ...MONO, fontSize: 11, fontWeight: 600,
                letterSpacing: 'var(--pq-track-chip)',
              }}>SHOW AGAIN</button>
          </div>
        ))}

        {/* Only when it would do something, and only on the whole list:
            offering "show all" inside one recipe's view would restore
            items that recipe never mentioned. */}
        {onRestoreAll && items.length > 1 && (
          <button
            onClick={onRestoreAll}
            style={{
              width: '100%', minHeight: 'var(--pq-tap-min)', marginTop: 18,
              borderRadius: 'var(--pq-r-button)', background: 'transparent',
              border: '1px solid var(--pq-rule-soft)', cursor: 'pointer',
              color: 'var(--pq-text-muted)',
              ...MONO, fontSize: 12, fontWeight: 500,
              letterSpacing: 'var(--pq-track-chip)',
            }}>SHOW ALL AGAIN</button>
        )}
      </div>
    </Sheet>
  )
}
