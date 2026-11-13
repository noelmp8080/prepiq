# Prompt for Claude Design: PrepIQ recipe content

Paste everything below the line into Claude Design. Attach these two files with it so it matches the current look:

- `docs/design/paper-and-ink/paper-and-ink-light.png`
- `docs/design/paper-and-ink/paper-and-ink-dark.png`

---

Design mockups for PrepIQ, a phone-first meal-prep app. I want to bring in information from the two cookbooks the app is built on that the app doesn't show yet. Show me how it would look before anything gets built.

## The app today

PrepIQ has five tabs in a floating capsule nav: Today, Plan, Recipes, Grocery, Track. It holds 260 recipes from two cookbooks, *Jalal's Cookbook* and *The Meal Prep Cookbook*. Tapping a recipe anywhere in the app opens one **recipe sheet**, a bottom sheet with:

1. A header with a 56px photo, the recipe name, and a small meta line like `JALAL'S · 4 SERV`, plus a heart and a close button.
2. A four-cell macro strip: KCAL (in red), PROTEIN, CARBS, FAT.
3. INGREDIENTS: one line per ingredient with a small red dot, written exactly as the book prints it.
4. INSTRUCTIONS: numbered steps, with the number in red (`01`, `02`...).
5. A footer that stays put: ADD TO A DAY (seven day chips, tap to add) and an "I ATE THIS TODAY" outline button.

**Look: "Paper and ink"** (match the attached screenshots exactly):

- **Colours:** warm paper ground `#F6F4EF`, panels `#FFFDF8`, ink `#17171A` for type and every filled control, and one red `#B3261E` used only for emphasis and progress, never as a button fill. Hairlines are `#E7E3DA`.
- **Dark theme:** paper and ink swap (ground `#141416`, panel `#1E1E21`, text `#F2EFE8`), and the red lifts to `#FF8A7E`.
- **Type:** Inter for reading. Space Grotesk for titles, numbers and small capital labels (11–12px, letter-spaced, uppercase).
- **Shapes and spacing:** flat (no gradients, no shadows except the sheet and the nav). Round: 20px cards and pill buttons and chips. 18px phone gutter, 44px minimum tap targets.

## What to add

Everything below is real content printed in the books. **Nothing may be invented:** if a recipe has no tip, no video or no yield, that part simply doesn't appear. There must be no empty boxes and no placeholder text.

1. **Intro line.** Every recipe has one or two sentences under its title (258 of 260). For example: "Truly one of the best combos, the perfect balance of sweet, savoury and spicy!"
2. **What it makes.** Recipes give a serving count, a non-serving yield ("Makes 4 Burgers", "3 Wraps", "12–15 Strips"), or nothing at all. The meta line should say whichever the book gives.
3. **Ingredients in groups.** Most recipes split their ingredients into named parts, for example "Korean BBQ Beef / Creamy Gochujang Sauce / Long Grain Rice / Crunchy Cucumber Salad". Show those group headings so you can see which ingredients go into which part. Some recipes have 4 groups and around 28 lines, so this must stay easy to scan in a shop.
4. **Cook's notes.** Jalal's recipes have a tip box (56 recipes), for example "Make sure you TURN OFF the heat before adding honey and BBQ sauce." Meal Prep recipes have "Important Cooking Notes" (87 recipes, usually 3–5 short notes, each tied to a step). Show these as one consistent "Cook's notes" block. Decide whether notes sit after the steps or attached to the step they belong to, and show your choice.
5. **Watch it made.** Most recipes link to a short video on YouTube, TikTok and Instagram (usually all three). Show three small labelled buttons. They open the video outside the app.
6. **Batch proteins.** 17 recipes are "batch proteins": cook a big tray of chicken or beef once and use it all week (for example Korean BBQ Chicken, makes 8). These need:
   - **Macros with and without sauce.** Korean BBQ Chicken is 286 kcal / 39P / 9C / 10F without sauce and 339 / 42 / 14 / 13 with sauce. Use a small two-way switch on the macro strip, defaulting to "Without sauce".
   - **Titled steps.** Each step has a title, like "Marinate the chicken", "Cook the chicken", "Rest the chicken" and "Store for the week".
   - **"Serve it with".** Short bullet lists of meal ideas ("Korean rice bowls with cucumber slaw…") and sauce pairings ("Sesame soy drizzle", "Kimchi or pickled vegetables").
   - **A way to find them.** Add a "BATCH" filter chip on the Recipes screen.
7. **Guides.** *The Meal Prep Cookbook* has general pages that aren't recipes. They need a home without adding a sixth tab:
   - **Best Tips & Practices** (13 short tips): reheating with a side salad, scaling up, re-crisping air-fried potatoes at 210°C for 3–4 min, freezing, two recipes a week, defrosting and reheating, storing sauces separately, portioning, getting a good sear, extra veg, marinating, why grams, tracking macros.
   - **Storage, Freezing & Reheating:** fridge 4–5 days, freezer 2–3 months, and reheating times by method (air fryer, oven, pan, microwave) for chicken and for beef.
   - **Batch cooking intro:** how the batch-protein section works.
   - **Master grocery list:** the most-used ingredients by aisle.

   Suggest where the guides live. My starting idea is an entry card at the top of the Recipes screen that opens a Guides sheet. The storage guide should also be reachable from every batch-protein recipe.

## Screens I want to see

Show each as a phone frame (390 × 844) in light, plus the recipe sheet in dark:

1. **Recipe sheet, Jalal recipe:** Honey BBQ Chicken Mac & Cheese. 511 kcal, 50P / 50C / 10F, 4 servings. It has an intro, one ingredient group, 5 steps, a tip box and three video links.
2. **Recipe sheet, Meal Prep recipe:** Korean BBQ Beef Bowls. 557 kcal, 56P / 66C / 8F, 5 servings. It has 4 ingredient groups and 6 steps.
3. **Recipe sheet, batch protein:** Korean BBQ Chicken, with the sauce switch, titled steps, "Serve it with" and a link to the storage guide.
4. **Recipes screen:** the Guides entry and the new BATCH chip, in the existing list style.
5. **Guides sheet:** the list of four guides, with "Storage, Freezing & Reheating" opened.

## Constraints

- The recipe sheet keeps its order (header, macros, ingredients, steps) and its fixed footer. New parts slot in without pushing the ingredients far down. The intro sits in the header area; notes, video and "serve it with" sit after the steps.
- Keep it calm. These are additions to a tool used while cooking, not a magazine. No hero images, no new colours, no icons beyond simple line icons.
- Video buttons are text labels ("YouTube", "TikTok", "Instagram"), not brand logos.
- If anything is unclear, make a sensible choice and note it beside the frame. Don't ask me first.
