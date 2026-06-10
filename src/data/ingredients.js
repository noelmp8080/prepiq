export function getIngredients(recipe) {
  const name = recipe.name.toLowerCase()
  const ingredients = []

  // Protein base
  if (name.includes('chicken')) {
    ingredients.push({ item: 'Chicken breast', amount: '700g (25oz)', category: 'protein' })
  } else if (name.includes('steak') || name.includes('beef') || name.includes('bulgogi')) {
    ingredients.push({ item: 'Beef steak, cubed', amount: '600g (21oz)', category: 'protein' })
  } else if (name.includes('salmon')) {
    ingredients.push({ item: 'Salmon fillet', amount: '600g (21oz)', category: 'protein' })
  } else if (name.includes('shrimp') || name.includes('prawn')) {
    ingredients.push({ item: 'Large shrimp, peeled', amount: '500g (18oz)', category: 'protein' })
  } else if (name.includes('tuna')) {
    ingredients.push({ item: 'Tuna steak or canned tuna', amount: '400g (14oz)', category: 'protein' })
  } else if (name.includes('turkey')) {
    ingredients.push({ item: 'Ground turkey', amount: '600g (21oz)', category: 'protein' })
  } else if (name.includes('lamb') || name.includes('kofta')) {
    ingredients.push({ item: 'Ground lamb', amount: '600g (21oz)', category: 'protein' })
  } else if (name.includes('pork')) {
    ingredients.push({ item: 'Pork tenderloin', amount: '600g (21oz)', category: 'protein' })
  } else {
    ingredients.push({ item: 'Chicken breast', amount: '700g (25oz)', category: 'protein' })
  }

  // Carb base
  if (name.includes('pasta') || name.includes('mac') || name.includes('noodle') || name.includes('spaghetti') || name.includes('carbonara') || name.includes('alfredo') || name.includes('pesto') || name.includes('bolognese') || name.includes('ragu') || name.includes('stroganoff')) {
    ingredients.push({ item: 'Pasta (penne or macaroni)', amount: '300g (10.5oz) dry', category: 'carbs' })
  } else if (name.includes('rice') || name.includes('bowl') || name.includes('biryani') || name.includes('fried rice') || name.includes('burrito bowl')) {
    ingredients.push({ item: 'Basmati or jasmine rice', amount: '300g (10.5oz) dry', category: 'carbs' })
  } else if (name.includes('wrap') || name.includes('burrito') || name.includes('fajita')) {
    ingredients.push({ item: 'Low calorie tortilla wraps', amount: '4 large', category: 'carbs' })
  } else if (name.includes('burger') || name.includes('sandwich') || name.includes('sub')) {
    ingredients.push({ item: 'Brioche burger buns', amount: '4 buns', category: 'carbs' })
  } else if (name.includes('potato') || name.includes('chips')) {
    ingredients.push({ item: 'Potatoes, cubed', amount: '800g (28oz)', category: 'carbs' })
  } else if (name.includes('taco')) {
    ingredients.push({ item: 'Small corn or flour tortillas', amount: '8 tortillas', category: 'carbs' })
  } else if (name.includes('pizza')) {
    ingredients.push({ item: 'Pizza dough or flatbread', amount: '2 bases', category: 'carbs' })
  } else if (name.includes('naan')) {
    ingredients.push({ item: 'Garlic naan bread', amount: '4 pieces', category: 'carbs' })
  } else if (name.includes('gnocchi')) {
    ingredients.push({ item: 'Potato gnocchi', amount: '500g (18oz)', category: 'carbs' })
  } else {
    ingredients.push({ item: 'Cooked rice or pasta', amount: '300g (10.5oz)', category: 'carbs' })
  }

  // Aromatics — always included
  ingredients.push({ item: 'Garlic cloves, minced', amount: '4 cloves', category: 'aromatics' })
  ingredients.push({ item: 'Olive oil', amount: '2 tsp', category: 'aromatics' })

  // Sauce / flavour profile
  if (name.includes('honey') && name.includes('garlic')) {
    ingredients.push({ item: 'Honey', amount: '3 tbsp', category: 'sauce' })
    ingredients.push({ item: 'Low sodium soy sauce', amount: '2 tbsp', category: 'sauce' })
    ingredients.push({ item: 'Butter', amount: '1 tbsp', category: 'sauce' })
  } else if (name.includes('peri peri') || name.includes('peri-peri')) {
    ingredients.push({ item: "Nando's Peri Peri sauce", amount: '80g (3oz)', category: 'sauce' })
    ingredients.push({ item: 'Smoked paprika', amount: '1 tsp', category: 'sauce' })
  } else if (name.includes('bbq') || name.includes('smoky')) {
    ingredients.push({ item: 'BBQ sauce, reduced sugar', amount: '4 tbsp', category: 'sauce' })
    ingredients.push({ item: 'Smoked paprika', amount: '1 tsp', category: 'sauce' })
  } else if (name.includes('teriyaki')) {
    ingredients.push({ item: 'Teriyaki sauce', amount: '4 tbsp', category: 'sauce' })
    ingredients.push({ item: 'Sesame oil', amount: '1 tsp', category: 'sauce' })
    ingredients.push({ item: 'Sesame seeds', amount: '1 tbsp', category: 'sauce' })
  } else if (name.includes('tikka') || name.includes('curry') || name.includes('masala')) {
    ingredients.push({ item: 'Tikka masala paste', amount: '3 tbsp', category: 'sauce' })
    ingredients.push({ item: 'Low fat coconut milk', amount: '200ml (7oz)', category: 'sauce' })
    ingredients.push({ item: 'Tomato paste', amount: '2 tbsp', category: 'sauce' })
  } else if (name.includes('buffalo')) {
    ingredients.push({ item: 'Buffalo hot sauce', amount: '4 tbsp', category: 'sauce' })
    ingredients.push({ item: 'Butter', amount: '1 tbsp', category: 'sauce' })
  } else if (name.includes('chipotle')) {
    ingredients.push({ item: 'Chipotle paste', amount: '2 tbsp', category: 'sauce' })
    ingredients.push({ item: 'Light cream cheese', amount: '100g (3.5oz)', category: 'sauce' })
  } else if (name.includes('creamy') || name.includes('alfredo') || name.includes('carbonara')) {
    ingredients.push({ item: 'Light cream cheese', amount: '160g (5.6oz)', category: 'sauce' })
    ingredients.push({ item: 'Skimmed milk', amount: '250ml (8.8oz)', category: 'sauce' })
    ingredients.push({ item: 'Parmesan cheese, grated', amount: '30g (1oz)', category: 'sauce' })
  } else if (name.includes('korean') || name.includes('gochujang') || name.includes('bulgogi')) {
    ingredients.push({ item: 'Gochujang paste', amount: '2 tbsp', category: 'sauce' })
    ingredients.push({ item: 'Soy sauce', amount: '2 tbsp', category: 'sauce' })
    ingredients.push({ item: 'Sesame oil', amount: '1 tsp', category: 'sauce' })
  } else if (name.includes('sriracha') || name.includes('spicy')) {
    ingredients.push({ item: 'Sriracha sauce', amount: '2 tbsp', category: 'sauce' })
    ingredients.push({ item: 'Honey', amount: '1 tbsp', category: 'sauce' })
  } else if (name.includes('lemon') || name.includes('herb')) {
    ingredients.push({ item: 'Lemon juice', amount: '2 lemons', category: 'sauce' })
    ingredients.push({ item: 'Fresh parsley, chopped', amount: 'handful', category: 'sauce' })
  } else if (name.includes('pesto')) {
    ingredients.push({ item: 'Green pesto', amount: '4 tbsp', category: 'sauce' })
    ingredients.push({ item: 'Cherry tomatoes', amount: '200g (7oz)', category: 'sauce' })
  } else if (name.includes('tuscan') || name.includes('sun-dried')) {
    ingredients.push({ item: 'Sun-dried tomatoes', amount: '60g (2oz)', category: 'sauce' })
    ingredients.push({ item: 'Baby spinach', amount: '100g (3.5oz)', category: 'sauce' })
    ingredients.push({ item: 'Light cream', amount: '150ml (5oz)', category: 'sauce' })
  } else if (name.includes('shawarma') || name.includes('gyro') || name.includes('souvlaki')) {
    ingredients.push({ item: 'Tzatziki sauce', amount: '4 tbsp', category: 'sauce' })
    ingredients.push({ item: 'Cumin', amount: '1 tsp', category: 'sauce' })
    ingredients.push({ item: 'Coriander', amount: '1 tsp', category: 'sauce' })
  } else {
    ingredients.push({ item: 'Low sodium soy sauce', amount: '2 tbsp', category: 'sauce' })
    ingredients.push({ item: 'Black pepper', amount: '1 tsp', category: 'sauce' })
  }

  // Vegetables
  if (name.includes('fajita') || name.includes('stir fry') || name.includes('chow mein')) {
    ingredients.push({ item: 'Bell peppers, mixed', amount: '2 large', category: 'veg' })
    ingredients.push({ item: 'Onion, sliced', amount: '1 large', category: 'veg' })
  } else if (name.includes('salad') || name.includes('greek') || name.includes('mediterranean')) {
    ingredients.push({ item: 'Cherry tomatoes', amount: '200g (7oz)', category: 'veg' })
    ingredients.push({ item: 'Cucumber, diced', amount: '1 medium', category: 'veg' })
    ingredients.push({ item: 'Red onion, sliced', amount: '1 small', category: 'veg' })
  } else if (name.includes('broccoli') || name.includes('beef & broc')) {
    ingredients.push({ item: 'Broccoli florets', amount: '300g (10.5oz)', category: 'veg' })
  } else {
    ingredients.push({ item: 'Spring onions, chopped', amount: '3 stalks', category: 'veg' })
  }

  // Seasoning — always included
  ingredients.push({ item: 'Salt & black pepper', amount: 'to taste', category: 'seasoning' })
  ingredients.push({ item: 'Garlic powder', amount: '1 tsp', category: 'seasoning' })
  ingredients.push({ item: 'Paprika', amount: '1 tsp', category: 'seasoning' })

  // Garnish
  ingredients.push({ item: 'Fresh parsley or spring onion', amount: 'for garnish', category: 'garnish' })

  return ingredients
}
