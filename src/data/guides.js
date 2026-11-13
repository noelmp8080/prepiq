/* The Meal Prep Cookbook's pages that are not recipes.
 *
 * Transcribed from The Meal Prep Cookbook V5: pp.10–13 (tips), pp.14–15
 * (master grocery list), pp.237–239 (batch-cooking intro) and pp.274–275
 * (storage guide). The wording is the book's; only the layout is ours —
 * headings, lists and the reheating rows are set the way the page sets
 * them. Nothing is summarised or added. Spelling (flavour, colour) and
 * temperatures are as printed.
 *
 * Block types, rendered by GuidesSheet:
 *   { p }                          a paragraph
 *   { h, items: [string] }         a heading and a list
 *   { h, groups: [{ name, items }] } a heading with named sub-lists
 *   { h, note?, methods: [{ name, heat?, items }] }  reheating
 *   { h?, p?, tips: [{ title, text?, items?, after? }] }  titled tips
 *   { facts: [{ v, l }] }          the two numbers on the storage page
 */

export const GUIDES = [
  {
    id: 'storage',
    title: 'Storage, freezing & reheating',
    sub: 'For every batch protein',
    pages: 'pp.274–275',
    blocks: [
      { facts: [{ v: '4-5 days', l: 'FRIDGE' }, { v: '2-3 months', l: 'FREEZER' }] },
      { p: 'This master guide applies to every protein recipe in this section - including chicken thighs, chicken breast, and ground/minced beef.' },
      { p: 'The goal: keep your proteins juicy, tender, and flavourful all week.' },
      {
        h: 'How to keep proteins juicy all week',
        items: [
          'Do not slice chicken until serving.',
          'Always include leftover juices/glaze with chicken.',
          'Store in shallow containers for faster cooling.',
          'Avoid overcooking - reheating always reduces moisture slightly.',
          'Air fryer is the best tool to revive texture.',
          'Only reheat the portion you plan to eat - avoid reheating multiple times.',
        ],
      },
      {
        h: 'Storage - fridge (4-5 days)',
        groups: [
          {
            name: 'Chicken (Whole Thighs or Cubed Thigh Meat)',
            items: [
              'Allow chicken to cool completely before storing.',
              'Store whole thighs whenever possible - this preserves juiciness better than sliced or cubed chicken.',
              'Add sheet pan juices, glaze, or cooking sauce to the container for moisture and flavour (do not over-saturate).',
              'Store in airtight glass containers for maximum freshness.',
            ],
          },
          {
            name: 'Ground / Minced Beef',
            items: [
              'Allow beef to cool fully before storing.',
              'Store in shallow airtight containers to prevent moisture buildup.',
              'Store all sauces separately.',
              'Seasoned or tomato-based beef will continue to develop flavour over 24 hours - this is normal and enhances taste.',
            ],
          },
        ],
      },
      {
        h: 'Freezing (up to 2-3 months)',
        groups: [
          {
            name: 'Chicken',
            items: [
              'Freeze cooked chicken whole for best texture.',
              'Add a small amount of glaze/sauce to prevent drying (avoid flooding the container).',
              'Freeze in airtight containers or freezer bags.',
              'Defrost overnight in the fridge before reheating.',
            ],
          },
          {
            name: 'Ground / Minced Beef',
            items: [
              'Freeze in flat portions (bags or thin containers) for faster thawing.',
              'Add just enough pan juices to prevent dryness.',
              'Do not freeze yogurt based, mayo-based, or citrus-heavy sauces - store those fresh only.',
            ],
          },
        ],
      },
      {
        h: 'Reheating - chicken (best methods)',
        note: 'Aim to heat through while keeping the chicken juicy, with optional crisp edges.',
        methods: [
          { name: 'Air Fryer (Best Overall)', heat: '190°C / 375°F', items: ['Whole thighs: 5-7 minutes', 'Cubed chicken: 4-5 minutes'] },
          { name: 'Oven', heat: '180°C / 350°F', items: ['8-10 minutes (cover with foil for juiciness)', 'Uncover for final 1-2 minutes for crisp edges'] },
          { name: 'Pan Method', heat: 'Medium heat', items: ['Add 1-2 tbsp water, broth, or sauce', 'Cover to steam, uncover to re-caramelise'] },
          { name: 'Microwave (Fastest)', heat: '30-45 seconds', items: ['Add a splash of liquid and cover', 'For crisp recipes, finish 1-2 minutes in air fryer'] },
        ],
      },
      {
        h: 'Reheating - ground beef',
        methods: [
          { name: 'Pan (Best Method)', heat: 'Medium heat', items: ['Add 1-2 tbsp water or broth', 'Stir 2-4 minutes until hot and revived'] },
          { name: 'Microwave', items: ['30-60 seconds depending on portion', 'Add a splash of water or lime juice', 'Cover to prevent drying'] },
          { name: 'Oven', heat: '180°C / 350°F', items: ['6-8 minutes', 'Add moisture before heating'] },
        ],
      },
    ],
  },

  {
    id: 'tips',
    title: 'Best tips & practices',
    sub: '13 tips for meal prepping',
    pages: 'pp.10–13',
    blocks: [
      { p: 'Learning how to meal prep effectively will change the way you plan your meals throughout your weeks. Saves you a lot of time, makes eating healthy and sticking to it so much easier/sustainable especially when you have delicious tasty meals stocked up in your fridge/freezer.' },
      {
        tips: [
          { title: 'Reheating Meals with a Side Salad', text: 'If your meal prep includes a side salad, always store it in a separate container. This keeps the greens fresh and crisp. If stored together, simply remove the salad before reheating the main components. Reheat the rest of the meal in a microwave or pan, then serve the salad cold as intended.' },
          { title: 'Scaling Up for Larger Batches', text: 'Want to prep more meals at once? Just double or triple the ingredients in any of my recipes. This can give you 8–12 meals ready to go for the week. I recommend keeping 3 meals in the fridge and storing the rest in the freezer to maintain freshness.' },
          { title: 'How to Re-Crisp Air-Fried Potatoes', text: 'Air-fried potatoes can lose their crispiness after refrigeration — but they’re easy to revive. Pop them back in the air fryer at 210°C / 420°F for 3–4 minutes. This restores their texture and gives them that just-cooked crunch. Avoid microwaving if you want to keep them crispy.' },
          { title: 'Freezing Your Meal Preps', text: 'Nearly all of my meal prep recipes are freezer-friendly! The only exception is fresh side salads or raw veg — keep those in the fridge and only freeze the cooked components. Store meals in airtight containers and label with the date for best results.' },
          { title: 'Planning with Two Recipes Per Week', text: 'Making two different meal preps per week adds variety and keeps you from getting bored of eating the same thing daily. Each prep lasts 5–7 days in the fridge, but I recommend freezing a few portions early in the week so they stay fresh for later days.' },
          {
            title: 'How to Defrost & Reheat Frozen Meals',
            text: 'To defrost, just take your meal out of the freezer the night before and let it thaw in the fridge. When ready to reheat:',
            items: ['Pan method: Heat on low for 5–6 minutes', 'Oven/Air fryer: Reheat at 180–190°C for 5–6 minutes'],
            after: 'Add a splash of water if needed to loosen sauces or rehydrate rice.',
          },
          { title: 'Storing Sauces and Salads Separately', text: 'For meals that include a sauce or side salad, store those in separate containers or sauce bottles. This keeps everything fresh and makes reheating much easier. Only add the sauce or salad right before eating so the textures and flavors stay on point.' },
          { title: 'How to Portion Your Meal Preps', text: 'The easiest way to evenly portion your meal prep is by using a digital food scale. Start by dividing the carb portion (rice, pasta, or potatoes), then move on to the protein (chicken, beef, etc.). Don’t stress about making every meal exactly the same — what matters most is that your total weekly calories stay within your target.' },
          { title: 'How to Get the Perfect Sear on Chicken or Steak Bites', text: 'Start by preheating your pan on medium heat for 2 minutes before adding anything. Once hot, increase the heat slightly, then add your oil or butter. Place the chicken or beef in the pan and don’t overcrowd it. Sear for 3–4 minutes on the first side, then flip and cook for another 2–3 minutes. This method guarantees that golden-brown crust and juicy meat.' },
          { title: 'Adding Extra Veg to Your Meal Preps', text: 'To increase volume and make meals more filling, I always suggest adding your favorite veggies when it’s time to eat. Roasted broccoli, fresh salads, or steamed greens work great alongside any of my meal prep recipes. Not only does it boost nutrition, but it helps keep you full for longer.' },
          { title: 'What Properly Marinated Meat Should Look Like', text: 'Here’s my rule of thumb: after adding your spices and mixing, if the color of your chicken or beef hasn’t deepened, it’s not seasoned enough. Add more until you see that rich, bold color throughout. This ensures maximum flavor once it’s cooked.' },
          {
            title: 'Why I Use Grams (g) as My Main Form of Measurement',
            text: 'When it comes to meal prepping and cooking with precision, I prefer to use grams (g) as the standard unit of measurement. Why? The reason is simple: grams give you a much more accurate and consistent way to measure ingredients. Unlike cups or tablespoons, which can vary in volume depending on how ingredients are packed or even the brand you use, grams are always the same.',
            after: 'For example, 100 grams of chicken breast will always weigh the same, no matter the size of the breast or the way it’s cut. This consistency is key when you’re trying to hit specific macro or calorie goals, especially for fitness-focused meal plans. Using grams ensures that you’re tracking your food intake more accurately, which is vital for those working on weight loss, muscle gain, or any other specific nutritional goals. Additionally, grams help with portion control, ensuring you don’t overestimate or underestimate the amounts you’re consuming. It also simplifies scaling recipes, so you can easily adjust them depending on how many servings you need.',
          },
          {
            title: 'How to Track Macros & Calories for These Meals',
            text: 'Tracking your macros (proteins, carbs, fats) and calories is a great way to make sure your meals align with your fitness or nutrition goals. Here’s a simple approach to keep things organized and accurate:',
            items: [
              'Start with a Food Scale: For precision, always weigh your ingredients. Use a digital scale for the most accurate readings in grams. If you don’t have a scale, most food packaging will have nutritional information based on weight (such as per 100g or per serving).',
              'Use a Reliable App or Calculator: There are several apps like MyFitnessPal, Cronometer, or Carb Manager, where you can log your meals and track calories and macros. These apps allow you to input your meals by scanning barcodes or manually entering ingredients. They provide detailed breakdowns of the nutritional content per item and will help you keep track of your daily intake.',
              'Calculate Your Needs: Before you start tracking, it’s important to know how many calories and what macro ratio (protein, carbs, fats) you should aim for each day. This will vary depending on whether you’re trying to lose weight, gain muscle, or maintain your current weight. There are plenty of online calculators available that can help you determine these numbers based on factors like age, weight, activity level, and goals.',
              'Adjust Serving Sizes for Your Goals: Each recipe in this cookbook has the nutrition information based on the specific serving size. However, you might want to adjust the serving size depending on your goals. If you’re eating less or more than the standard portion, be sure to adjust the calories and macros accordingly.',
              'Consistency is Key: The most important tip when tracking your macros and calories is to be consistent. Track every meal, even snacks, and ensure you’re measuring everything to maintain accuracy. Over time, you’ll get better at estimating portions, but in the beginning, it’s best to be as precise as possible.',
            ],
            after: 'Tracking your macros and calories can feel overwhelming at first, but with a little practice, it becomes second nature. Plus, it will give you a much clearer understanding of what you’re putting into your body and how it’s helping you reach your goals.',
          },
        ],
      },
    ],
  },

  {
    id: 'batch',
    title: 'Batch cooking your proteins',
    sub: 'How the batch section works',
    pages: 'pp.237–239',
    blocks: [
      { p: 'Batch cooking your proteins is one of the most effective ways to save time, stay consistent, and eliminate stress during the week. Having a delicious, well seasoned source of chicken or beef ready in your fridge is a TRUE game changer. With just one cooking session, you instantly create a foundation for countless meals.' },
      {
        h: 'Once your proteins are cooked, you can mix and match them with',
        items: [
          'Rice or flavoured rice bowls',
          'Wraps, burritos, sandwiches',
          'Pasta dishes',
          'Potatoes in any form',
          'Fresh salads or slaws',
          'Any of my low calorie sauces',
          'Roasted or air fried vegetables',
        ],
      },
      { p: 'This approach gives you endless variety while dramatically reducing daily cooking time. On busy days, all you need to do is reheat your chicken or beef, assemble your sides, and your meal is ready in minutes - fast, convenient, and consistently delicious.' },
      {
        h: 'This section will guide you through',
        items: [
          'The best marinades for meal prep',
          'Reheating techniques that maintain texture',
          'How to cook proteins for maximum juiciness',
          'How to keep your protein tender and flavourful all week',
          'How to store them properly for freshness',
        ],
      },
      { p: 'The Goal is Simple: Make meal prep effortless, enjoyable, and packed with flavour - without ever dealing with bland, dry chicken again.' },
      {
        h: 'Why batch cooking proteins works so well (the science behind it)',
        p: 'Batch cooking isn’t just convenient - there are real food science reasons why pre cooked, marinated proteins taste better, stay juicier, and reheat beautifully.',
        tips: [
          {
            title: '1. Marinades get stronger over time',
            text: 'Salt, acids (lemon, vinegar), yogurt, and spices break down muscle fibres gently, allowing the seasoning to:',
            items: ['Penetrate deeper', 'Distribute evenly', 'Improve tenderness'],
            after: 'Your protein often tastes better on day 2 or 3 than immediately after cooking.',
          },
          {
            title: '2. Resting and chilling improve juiciness',
            text: 'After cooking, proteins release moisture. As they cool:',
            items: ['Fibres relax', 'Juices redistribute', 'Structure stabilises'],
            after: 'This makes pre cooked proteins less likely to dry out when reheated.',
          },
          {
            title: '3. Proper storage protects texture',
            text: 'Airtight storage slows moisture loss, limits oxidation, and prevents rubbery surfaces. This keeps your protein tender, juicy, and flavourful the entire week.',
          },
          {
            title: '4. Reheating works better with pre stabilised proteins',
            text: 'Once chilled, protein reheats more gently and evenly. This leads to:',
            items: ['Minimal juice loss', 'Soft, tender texture', 'The ability to re-crisp in an air fryer or pan'],
            after: 'This is why well-stored meal prep chicken often tastes better than poorly stored leftovers.',
          },
          {
            title: '5. Flavour compounds continue to develop',
            text: 'Spices like paprika, cumin, coriander, chilli, garlic, and herbs naturally deepen over time, giving your protein:',
            items: ['Richer flavour', 'Greater complexity', 'A more satisfying taste each day'],
          },
        ],
      },
    ],
  },

  {
    id: 'grocery',
    title: 'Master grocery list',
    sub: 'Ranked by frequency',
    pages: 'pp.14–15',
    blocks: [
      {
        h: 'By aisle, most used first',
        groups: [
          { name: 'Meats', items: ['Chicken Breast', 'Topside / Top Sirloin Beef', 'Chicken Thighs (Boneless & Skinless)', '95% Lean Ground Beef', 'Shrimp', 'Salmon'] },
          { name: 'Dairy', items: ['Reduced Fat Butter', 'Cream Cheese', '50% Fat Cream Cheese', '1% Milk', 'Skimmed Milk', 'Cottage Cheese', 'Parmesan Cheese', 'Low Fat Cheddar Cheese', 'Feta Cheese', 'Mozzarella Cheese'] },
          { name: 'Produce', items: ['White Onion', 'Garlic Cloves / Minced Garlic / Garlic Paste', 'White Potatoes', 'Tomato', 'Fresh Parsley', 'Green Onion / Scallion / Spring Onion', 'Lemon', 'Bell Pepper', 'Red Onion', 'Cucumber', 'Coriander / Cilantro', 'Carrot', 'Lime', 'Ginger Paste', 'Cherry Tomatoes'] },
          { name: 'Spices & Seasonings', items: ['Salt (Himalayan / Sea Salt)', 'Paprika', 'Garlic Powder', 'Black Pepper', 'Smoked Paprika', 'Chilli Flakes', 'Cumin', 'Onion Powder', 'Dried Parsley Flakes', 'Dried Basil', 'Chilli Powder', 'Garam Masala', 'Thyme', 'Sumac', 'Chipotle Chilli Flakes', 'Korean Red Pepper Flakes'] },
          { name: 'Pantry', items: ['Honey', 'Dark Soy Sauce', 'Light Soy Sauce', 'Low / Reduced Sugar Ketchup', 'Basmati Rice', 'Rice Vinegar', 'Chipotle Paste', 'Oyster Sauce', 'Gochujang Paste', 'Black Beans', 'Mustard', 'Chilli Garlic Paste', 'Tamarind Paste', 'Jasmine Rice', 'Sugar Free BBQ Sauce'] },
          { name: 'Noodles & Pasta', items: ['Macaroni Pasta', 'Penne', 'Linguine', 'Rice Noodles', 'Spaghetti', 'Fettuccine', 'Egg Noodles'] },
          { name: 'Other', items: ['Sesame Seeds', 'Cashew Nuts', 'Baking Soda', 'Baking Powder', 'Olive Oil', 'Peanut Butter (Without Palm Oil)', 'Plain Flour'] },
        ],
      },
    ],
  },
]

export const guideById = Object.fromEntries(GUIDES.map(g => [g.id, g]))
