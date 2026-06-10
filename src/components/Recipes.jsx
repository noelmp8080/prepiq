import { useState } from 'react'
import { Search, Heart } from 'lucide-react'
import { recipes, filterRecipes } from '../data/recipes'
import { useAppStore } from '../store/useAppStore'
import RecipeSheet from './RecipeSheet'

const FILTERS = [
  { label:'All',          value:'all' },
  { label:"Jalal's",      value:'jalal' },
  { label:'Meal Prep',    value:'mealprep' },
  { label:'High Protein', value:'high-protein' },
  { label:'Under 500',    value:'under-500' },
  { label:'Low Fat',      value:'low-fat' },
  { label:'Chicken',      value:'chicken' },
  { label:'Pasta',        value:'pasta' },
  { label:'Rice Bowls',   value:'rice-bowls' },
  { label:'Seafood',      value:'seafood' },
  { label:'Favorites',    value:'favorites' },
]

const FOOD_IMGS = [
  'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=400&q=75',
  'https://images.unsplash.com/photo-1547592180-85f173990554?w=400&q=75',
  'https://images.unsplash.com/photo-1473093295043-cdd812d0e601?w=400&q=75',
  'https://images.unsplash.com/photo-1598515214211-89d3c73ae83b?w=400&q=75',
  'https://images.unsplash.com/photo-1544025162-d76694265947?w=400&q=75',
  'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&q=75',
  'https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=400&q=75',
  'https://images.unsplash.com/photo-1543339308-43e59d6b73a6?w=400&q=75',
]

function getImg(id) {
  return FOOD_IMGS[(id - 1) % FOOD_IMGS.length]
}

export default function Recipes() {
  const { favorites, toggleFavorite } = useAppStore()
  const [query,          setQuery]          = useState('')
  const [filter,         setFilter]         = useState('all')
  const [page,           setPage]           = useState(1)
  const [selectedRecipe, setSelectedRecipe] = useState(null)
  const PER_PAGE = 20

  const filtered = filterRecipes(recipes, { query, filter, favorites })
  const visible  = filtered.slice(0, page * PER_PAGE)
  const hasMore  = visible.length < filtered.length

  const sourceLabel = r => r.source === 'jalal' ? "Jalal's" : 'Meal Prep'
  const sourceColor = r => r.source === 'jalal' ? '#7B6EF5' : '#0DC8A0'

  return (
    <div style={{ paddingBottom:'88px' }}>
      {/* Header */}
      <div style={{ background:'linear-gradient(160deg,#1A1044 0%,#2D1B8C 60%,#4F3FD4 100%)', padding:'28px 20px 24px' }}>
        <p style={{ textAlign:'center', display:'block', fontSize:'36px', fontWeight:800, letterSpacing:'-.04em', lineHeight:1, padding:'12px 0 8px', fontFamily:'Plus Jakarta Sans, sans-serif', margin:0 }}>
          <span style={{ color:'#fff' }}>Prep</span><span style={{ color:'#C4B5FD' }}>IQ</span>
        </p>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'16px' }}>
          <div>
            <h1 style={{ fontSize:'26px', fontWeight:800, color:'#fff', letterSpacing:'-.04em', marginBottom:'2px' }}>Recipes</h1>
            <p style={{ fontSize:'12px', color:'rgba(255,255,255,0.5)', fontWeight:500 }}>
              {filtered.length} recipe{filtered.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'10px', background:'rgba(255,255,255,0.12)', border:'1px solid rgba(255,255,255,0.15)', borderRadius:'28px', padding:'10px 16px' }}>
          <Search size={17} strokeWidth={2} color='rgba(255,255,255,0.5)' />
          <input
            value={query}
            onChange={e => { setQuery(e.target.value); setPage(1) }}
            placeholder="Search 220 recipes..."
            style={{ flex:1, background:'none', border:'none', outline:'none', fontSize:'14px', color:'#fff', fontFamily:'Plus Jakarta Sans, sans-serif' }}
          />
        </div>
      </div>

      {/* Filter chips */}
      <div style={{ padding:'14px 16px 0', overflowX:'auto', display:'flex', gap:'8px', WebkitOverflowScrolling:'touch' }}>
        {FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => { setFilter(f.value); setPage(1) }}
            style={{
              flexShrink:0, padding:'7px 14px', borderRadius:'20px', border:'none', cursor:'pointer',
              fontSize:'12px', fontWeight:700, fontFamily:'Plus Jakarta Sans, sans-serif',
              background: filter === f.value ? '#4F3FD4' : 'var(--card)',
              color:       filter === f.value ? '#fff'    : 'var(--ink3)',
              boxShadow:   filter === f.value ? '0 2px 12px rgba(79,63,212,0.35)' : '0 1px 4px rgba(0,0,0,0.06)',
              transition:'all .15s',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Recipe grid */}
      <div style={{ padding:'16px 16px 0', display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' }}>
        {visible.map(recipe => (
          <div
            key={recipe.id}
            onClick={() => setSelectedRecipe(recipe)}
            style={{ background:'var(--card)', borderRadius:'18px', overflow:'hidden', boxShadow:'0 2px 10px rgba(79,63,212,0.07)', cursor:'pointer' }}
          >
            <div style={{ position:'relative' }}>
              <img
                src={getImg(recipe.id)}
                alt={recipe.name}
                style={{ width:'100%', height:'110px', objectFit:'cover', display:'block' }}
                loading="lazy"
              />
              <button
                onClick={e => { e.stopPropagation(); toggleFavorite(recipe.id) }}
                style={{ position:'absolute', top:'8px', right:'8px', background:'rgba(255,255,255,0.9)', border:'none', borderRadius:'50%', width:'30px', height:'30px', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}
              >
                <Heart size={14} strokeWidth={2} color={favorites.has(recipe.id) ? '#FF5C5C' : '#B4ADCA'} fill={favorites.has(recipe.id) ? '#FF5C5C' : 'none'} />
              </button>
              <span style={{ position:'absolute', bottom:'8px', left:'8px', background:sourceColor(recipe), color:'#fff', fontSize:'9px', fontWeight:700, padding:'3px 7px', borderRadius:'6px', letterSpacing:'.06em' }}>
                {sourceLabel(recipe)}
              </span>
            </div>
            <div style={{ padding:'10px 11px 12px' }}>
              <p style={{ fontSize:'12px', fontWeight:700, color:'var(--ink)', letterSpacing:'-.01em', lineHeight:1.35, marginBottom:'7px' }}>{recipe.name}</p>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <span style={{ fontSize:'15px', fontWeight:800, color:'#4F3FD4', letterSpacing:'-.03em' }}>{recipe.cal}</span>
                <span style={{ fontSize:'9px', color:'var(--ink4)', fontWeight:600 }}>cal</span>
              </div>
              <div style={{ display:'flex', gap:'5px', marginTop:'5px' }}>
                {[
                  { l:'P', v:recipe.protein, c:'#4F3FD4' },
                  { l:'C', v:recipe.carbs,   c:'#0DC8A0' },
                  { l:'F', v:recipe.fat,     c:'#F5A623' },
                ].map(m => (
                  <span key={m.l} style={{ fontSize:'9px', color:'var(--ink3)', fontWeight:600 }}>
                    <span style={{ color:m.c }}>{m.v}g</span> {m.l}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {hasMore && (
        <div style={{ padding:'20px 16px' }}>
          <button
            onClick={() => setPage(p => p + 1)}
            style={{ width:'100%', padding:'14px', background:'var(--card)', border:'1.5px solid rgba(79,63,212,0.2)', borderRadius:'16px', fontSize:'13px', fontWeight:700, color:'#4F3FD4', cursor:'pointer', fontFamily:'Plus Jakarta Sans, sans-serif' }}
          >
            Load more · {filtered.length - visible.length} remaining
          </button>
        </div>
      )}
      {!hasMore && filtered.length > 0 && (
        <p style={{ textAlign:'center', padding:'20px', fontSize:'12px', color:'var(--ink4)', fontWeight:500 }}>
          All {filtered.length} recipes shown
        </p>
      )}
      {filtered.length === 0 && (
        <div style={{ textAlign:'center', padding:'40px 20px' }}>
          <p style={{ fontSize:'14px', color:'var(--ink3)', fontWeight:500 }}>No recipes match your search</p>
        </div>
      )}

      {selectedRecipe && (
        <RecipeSheet
          recipe={selectedRecipe}
          onClose={() => setSelectedRecipe(null)}
        />
      )}
    </div>
  )
}
