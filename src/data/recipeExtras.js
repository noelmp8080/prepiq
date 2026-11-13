// PrepIQ — cookbook content the extraction did not carry.
//
// Intro lines, cook's notes, ingredient groups, with-sauce macros, serving
// ideas and the storage guide. EVERY STRING HERE IS FROM THE BOOKS, read
// off the page (docs/design/recipe-content). Nothing is written to fill a
// gap: a recipe with no entry here simply shows none of these parts.
//
// Only some recipes are filled in so far. The rest arrive as they are read
// from the PDFs; the screens already know how to show them.

/* ── Batch proteins (Meal Prep Cookbook pp.237–273) ───────────────────
 * The cook-once-eat-all-week section. 374–384 are the section in page
 * order; 217 is the Garlic Herb Cajun Chicken from the same section,
 * carried over from the older catalog with its original id. */
export const BATCH_IDS = new Set([217, 374, 375, 376, 377, 378, 379, 380, 381, 382, 383, 384])

/* Per-recipe content, by catalog id.
 *
 *   intro       the line printed under the title
 *   servings    when the extraction lost the book's number
 *   groups      the book's ingredient groups, used instead of the
 *               extracted list where that list came out damaged
 *   steps       [{ title?, text }] — only where the extracted steps are
 *               damaged; otherwise the extracted steps are used
 *   notes       the tip box / cooking notes
 *   withSauce   per-serving macros with the recipe's sauce
 *   serveWith   { meals: [], sauces: [] }
 */
export const recipeExtras = {
  2: {
    intro: 'Truly one of the best combos, the perfect balance of sweet, savoury and spicy! Also another great way to add variety to your weekly meal preps!',
    notes: [
      'Make sure you TURN OFF the heat before adding honey and BBQ sauce.',
      'You can freeze these meals and reheat in a pan or microwave.',
      'Keep in the fridge for up to 4 days.',
    ],
  },

  144: {
    intro: 'Tastes absolutely incredible for how easy this is to make, packed with 56g of protein!',
    servings: 5,
    groups: [
      { title: 'Korean BBQ Beef', items: [
        '1000g (35oz) Raw 5% Minced/Ground Beef', '65g (2.2oz) Light Soy Sauce',
        '20g (1oz) Dark Soy Sauce', '1.5 Tbsp Garlic Paste', '1 Tbsp Ginger Paste',
        '60g (2.1oz) Gochujang Paste', '30g (1.1oz) Honey', '50g (1.7oz) Oyster Sauce',
        '30g (1.1oz) Rice Vinegar', '2 Tbsp Sesame Seeds',
        '20g (1oz) Light Butter (for cooking)', '100g (3.5oz) White Onion, finely chopped',
        '50g (1.7oz) Green Onion, chopped',
      ] },
      { title: 'Creamy Gochujang Sauce', items: [
        '200g (7.1oz) Fat Free/Low Fat Yogurt', '20g (1oz) Gochujang Paste',
        '15-20g (1oz) Honey', 'Milk/Evaporated Milk for desired consistency',
      ] },
      { title: 'Long Grain Rice', items: [
        '250g (8.8oz) Uncooked Jasmine or Basmati Rice', '2 Tbsp Sesame Seeds',
      ] },
      { title: 'Crunchy Cucumber Salad', items: [
        '400g (14.1oz) Cucumber, thinly sliced', '300g (10.6oz) Carrots, grated',
        '250g (8.8oz) Red Onion, thinly sliced', '100g (3.5oz) Green Onion, chopped',
        '25g (1oz) Light Soy Sauce', '20g (1oz) Rice Vinegar', '25g (1oz) Sriracha',
        '1 Tsp Garlic Powder', '2 Tbsp Sesame Seeds',
      ] },
    ],
  },

  374: {
    intro: 'Sweet, smoky and slightly spicy chicken with a rich umami glaze. Perfect with rice, crunchy slaw, and a drizzle of creamy gochujang sauce for a balanced, flavour-packed bowl.',
    withSauce: { cal: 339, protein: 42, carbs: 14, fat: 13 },
    groups: [
      { title: 'Korean BBQ Chicken Marinade', items: [
        '1500g (53oz / 3.3lbs) Raw Chicken Thighs, boneless skinless',
        '2.5 Tsp Black Pepper', '40g (1.4oz / 3 Tbsp) Garlic Paste',
        '40g (1.4oz / 2 Tbsp) Ginger Paste', '65g (2.3oz / 4 Tbsp) Gochujang Paste',
        '50g (1.8oz / 2.5 Tbsp) Sriracha', '50g (1.8oz / 3 Tbsp) Light Soy Sauce',
        '35g (1.3oz / 5 Tbsp) Sesame Seeds',
      ] },
      { title: 'Gochujang Spicy Sauce', items: [
        '80g (2.8oz) Light Mayo', '200g (7oz) Any Yogurt',
        '15g (1 Tbsp / 0.5oz) Gochujang Paste', '15g (3 Tsp) Rice Vinegar', '25g (1oz) Honey',
      ] },
    ],
    steps: [
      { title: 'Marinate the chicken', text: 'Trim any excess fat from your boneless chicken thighs, then place them in a large mixing bowl. Add black pepper, garlic paste, ginger paste, gochujang, sriracha, sesame seeds, and light soy sauce. Mix thoroughly until the chicken is fully coated and the colour deepens. Set aside to marinate for at least 1 hour, or overnight for more intense flavour.' },
      { title: 'Cook the chicken', text: 'When ready to cook, spread the marinated chicken thighs evenly in a single layer on a lined sheet pan. Oven bake or air fry at 200°C / 400°F for 16-18 minutes, until the chicken is cooked through, juicy, and has a light golden char on the edges.' },
      { title: 'Rest the chicken', text: 'Let the chicken thighs rest for 3-4 minutes, then leave them whole for storage. Make sure to pack all the resting juices from the sheet pan together with the chicken when storing.' },
      { title: 'Store for the week', text: 'Allow the chicken to cool completely, then store the whole pieces in airtight glass containers and refrigerate for the week. Slice or cube the chicken only when serving to maintain maximum tenderness and juiciness. ENJOY!' },
    ],
    serveWith: {
      meals: [
        'Korean rice bowls with cucumber slaw, pickled carrots and spring onions',
        'Tortilla wraps or Korean inspired tacos with shredded lettuce and slaw',
        'Lettuce wraps with rice and a spoon of gochujang sauce',
      ],
      sauces: [
        'Gochujang spicy sauce (included in the recipe)',
        'Sesame soy drizzle',
        'Kimchi or pickled vegetables for contrast',
      ],
    },
  },
}

/* ── Meal prep guides (Meal Prep Cookbook) ────────────────────────────
 * Only sections read in full are listed. A guide shown half-transcribed
 * would read as the whole of what the book says. */
export const storageGuide = {
  id: 'storage',
  title: 'Storage, freezing & reheating',
  subtitle: 'For every batch protein · pp.274–275',
  facts: [
    { value: '4–5 days', label: 'FRIDGE' },
    { value: '2–3 months', label: 'FREEZER' },
  ],
  lists: [
    { title: 'KEEP PROTEINS JUICY ALL WEEK', items: [
      "Don't slice chicken until serving.",
      'Always include leftover juices or glaze with the chicken.',
      'Store in shallow containers so it cools faster.',
      'Only reheat the portion you plan to eat.',
    ] },
    { title: 'FREEZING', items: [
      "Freeze cooked chicken whole, with a little glaze so it doesn't dry out.",
      'Freeze ground beef in flat portions so it thaws faster.',
      "Don't freeze yogurt, mayo or citrus-heavy sauces. Keep those fresh.",
      'Defrost overnight in the fridge before reheating.',
    ] },
  ],
  tables: [
    { title: 'REHEATING CHICKEN', rows: [
      { method: 'Air fryer', best: true, heat: '190°C / 375°F', time: '5–7 min whole · 4–5 min cubed' },
      { method: 'Oven', heat: '180°C / 350°F', time: '8–10 min, foil on' },
      { method: 'Pan', heat: 'Medium', time: '1–2 tbsp water, cover' },
      { method: 'Microwave', heat: '—', time: '30–45 sec, covered' },
    ] },
    { title: 'REHEATING GROUND BEEF', rows: [
      { method: 'Pan', best: true, heat: 'Medium', time: '2–4 min, splash of water' },
      { method: 'Microwave', heat: '—', time: '30–60 sec, covered' },
      { method: 'Oven', heat: '180°C / 350°F', time: '6–8 min' },
    ] },
  ],
}

export const batchGuide = {
  id: 'batch',
  title: 'Batch cooking your proteins',
  subtitle: 'How the batch section works · pp.237–239',
  lists: [
    { items: [
      'Cook a big tray of chicken or beef once, keep it in the fridge, and build different meals from it all week.',
      `${BATCH_IDS.size} batch recipes, each marked BATCH in Recipes.`,
    ] },
  ],
}

export const guides = [storageGuide, batchGuide]
