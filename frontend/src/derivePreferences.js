/**
 * Barebones "model" that infers structured preferences from free text.
 * Replace with an LLM or API later.
 */
const DIETARY = [
  ['vegan', 'vegan'],
  ['vegetarian', 'vegetarian'],
  ['gluten', 'gluten-free'],
  ['celiac', 'gluten-free'],
  ['nut', 'nut allergy'],
  ['peanut', 'peanut allergy'],
  ['dairy', 'dairy-free'],
  ['lactose', 'lactose intolerant'],
  ['halal', 'halal'],
  ['kosher', 'kosher'],
  ['shellfish', 'no shellfish'],
  ['pescatar', 'pescatarian'],
]

const CUISINES = [
  ['italian', 'Italian'],
  ['mexican', 'Mexican'],
  ['thai', 'Thai'],
  ['sushi', 'Japanese / sushi'],
  ['japanese', 'Japanese'],
  ['indian', 'Indian'],
  ['chinese', 'Chinese'],
  ['korean', 'Korean'],
  ['vietnamese', 'Vietnamese'],
  ['mediterranean', 'Mediterranean'],
  ['american', 'American'],
  ['bbq', 'BBQ'],
  ['french', 'French'],
  ['filipino', 'Filipino'],
  ['burmese', 'Burmese'],
  ['ethiopian', 'Ethiopian'],
  ['vegan', 'Vegetarian'],
  ['vegetarian', 'Vegetarian'],
  ['bakery', 'Bakeries'],
  ['bakeries', 'Bakeries'],
  ['pastry', 'Bakeries'],
  ['dessert', 'Desserts'],
  ['ice cream', 'Desserts'],
  ['boba', 'Desserts'],
  ['bubble tea', 'Desserts'],
  ['coffee', 'Coffee & Tea'],
  ['cafe', 'Coffee & Tea'],
]

export function derivePreferencesFromText(raw) {
  const text = (raw || '').toLowerCase()
  const dietary = new Set()
  for (const [needle, label] of DIETARY) {
    if (text.includes(needle)) dietary.add(label)
  }

  const cuisines = new Set()
  for (const [needle, label] of CUISINES) {
    if (text.includes(needle)) cuisines.add(label)
  }

  let budgetMin = null
  let budgetMax = null
  if (/\$\s*15|\b15\s*bucks|\bcheap\b|\baffordable\b/.test(text)) {
    budgetMax = 15
  }
  if (/\$\s*30|\b30\s*bucks|\bmoderate\b/.test(text)) {
    budgetMax = 30
  }
  if (/\$\s*50|\bexpensive\b|\bfine dining\b|\bsplurge\b/.test(text)) {
    budgetMin = 40
    budgetMax = 100
  }
  if (/\$\s*20\s*-\s*\$?\s*40|20\s*to\s*40/.test(text)) {
    budgetMin = 20
    budgetMax = 40
  }

  let maxDistanceMiles = null
  if (/\bwalk(ing)?\b|\bwalking distance\b|\b5\s*min\b/.test(text)) {
    maxDistanceMiles = 0.5
  } else if (/\b1\s*mi(le)?\b|\bone mile\b/.test(text)) {
    maxDistanceMiles = 1
  } else if (/\b5\s*mi/.test(text)) {
    maxDistanceMiles = 5
  } else if (/\bnearby\b|\bclose\b|\bnot far\b/.test(text)) {
    maxDistanceMiles = 3
  }

  return {
    dietary_restrictions: [...dietary],
    cuisine_preferences: [...cuisines],
    budget_min: budgetMin,
    budget_max: budgetMax,
    max_distance_miles: maxDistanceMiles,
    confidence_note:
      text.trim().length < 10
        ? 'Try a few more details for better guesses.'
        : null,
  }
}
