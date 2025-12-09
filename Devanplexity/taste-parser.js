/**
 * taste-parser.js
 * 
 * Parses natural language food preferences using either:
 * 1. Local Gemma 3.4B (via Ollama) - more accurate
 * 2. Keyword matching fallback - works without ML setup
 * 
 * Returns structured taste attributes for filtering
 */

const axios = require('axios');

// Fallback keyword databases for when Gemma is not available
const CUISINE_KEYWORDS = {
  italian: ['pizza', 'pasta', 'risotto', 'gelato', 'italian'],
  mexican: ['tacos', 'burrito', 'enchilada', 'mexican', 'salsa', 'quesadilla'],
  asian: ['noodle', 'ramen', 'pho', 'pad thai', 'curry', 'stir fry', 'sushi', 'asian'],
  indian: ['curry', 'tikka', 'naan', 'biryani', 'indian', 'dosa'],
  japanese: ['sushi', 'ramen', 'tempura', 'teriyaki', 'japanese'],
  thai: ['pad thai', 'thai', 'curry', 'coconut', 'lemongrass'],
  american: ['burger', 'bbq', 'fried', 'steak', 'wings', 'american'],
  mediterranean: ['greek', 'falafel', 'hummus', 'olive', 'mediterranean'],
  french: ['french', 'coq au vin', 'duck', 'bourguignon'],
};

const HEAT_KEYWORDS = {
  spicy: ['spicy', 'hot', 'fiery', 'jalapeño', 'habanero', 'sriracha', 'chili'],
  mild: ['mild', 'light', 'gentle', 'not spicy', 'family friendly'],
  medium: ['medium', 'some heat', 'moderately spicy'],
};

const DIETARY_KEYWORDS = {
  vegan: ['vegan', 'no meat', 'no animal', 'plant based'],
  vegetarian: ['vegetarian', 'no meat', 'meatless'],
  pescetarian: ['pescetarian', 'fish ok', 'seafood ok'],
  keto: ['keto', 'low carb', 'protein heavy'],
  paleo: ['paleo', 'primal'],
  glutenfree: ['gluten free', 'gluten-free', 'gf', 'celiac'],
  halal: ['halal'],
  kosher: ['kosher'],
};

const HEALTH_GOALS_KEYWORDS = {
  'heart-healthy': ['heart healthy', 'low sodium', 'low fat', 'cardiac', 'healthy heart'],
  'low-sodium': ['low sodium', 'no salt', 'salt free'],
  'weight-loss': ['light', 'healthy', 'low calorie', 'diet', 'weight loss'],
  'muscle-building': ['protein', 'high protein', 'muscle', 'strength', 'bodybuilding'],
  'diabetes-friendly': ['diabetes', 'low sugar', 'no sugar', 'sugar free'],
};

const FOOD_TYPE_KEYWORDS = {
  tacos: ['tacos', 'taco'],
  noodles: ['noodle', 'noodles', 'ramen', 'pho', 'pad thai'],
  pizza: ['pizza', 'pie'],
  burger: ['burger', 'burgers', 'beef'],
  fish: ['fish', 'seafood', 'salmon', 'tuna', 'halibut'],
  chicken: ['chicken', 'poultry'],
  steak: ['steak', 'beef', 'meat'],
  salad: ['salad', 'greens', 'vegetables'],
  soup: ['soup', 'broth', 'chowder'],
  sandwich: ['sandwich', 'sub', 'wrap'],
};

const PREP_KEYWORDS = {
  grilled: ['grilled', 'charred'],
  fried: ['fried', 'deep fried', 'crispy'],
  baked: ['baked', 'roasted'],
  raw: ['raw', 'fresh'],
  steamed: ['steamed', 'boiled'],
};

/**
 * Use local Gemma 3.4B model via Ollama for parsing
 * Falls back to keyword matching if unavailable
 */
async function parseWithGemma(tasteQuery) {
  const ollamaUrl = process.env.OLLAMA_API_URL || 'http://localhost:11434';
  const model = process.env.OLLAMA_MODEL || 'gemma:7b';

  const prompt = `Parse this food taste preference into structured attributes. Return JSON only, no explanations.

Input: "${tasteQuery}"

Return ONLY a JSON object (no markdown, no backticks) with these fields:
{
  "cuisines": ["cuisine1", "cuisine2"],
  "heat": "mild|medium|spicy|none",
  "dietary": ["vegan", "vegetarian", "pescetarian", "keto", "paleo", "glutenfree", "halal", "kosher"],
  "healthGoals": ["heart-healthy", "low-sodium", "weight-loss", "muscle-building", "diabetes-friendly"],
  "foodTypes": ["tacos", "noodles", "pizza", "burger", "fish", "chicken", "steak", "salad", "soup", "sandwich"],
  "prepMethods": ["grilled", "fried", "baked", "raw", "steamed"],
  "ingredients": ["ingredient1", "ingredient2"],
  "restrictions": ["no dairy", "no gluten", "no nuts"],
  "confidence": 0.95
}`;

  try {
    const response = await axios.post(`${ollamaUrl}/api/generate`, {
      model,
      prompt,
      stream: false,
    });

    // Extract JSON from response
    const responseText = response.data.response;
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (err) {
    console.warn('Gemma parsing failed, falling back to keywords:', err.message);
  }

  return null;
}

/**
 * Keyword-based fallback parser (no ML required)
 */
function parseWithKeywords(tasteQuery) {
  const query = tasteQuery.toLowerCase();
  
  const result = {
    cuisines: [],
    heat: 'none',
    dietary: [],
    healthGoals: [],
    foodTypes: [],
    prepMethods: [],
    ingredients: [],
    restrictions: [],
    confidence: 0.5,
  };

  // Cuisine detection
  for (const [cuisine, keywords] of Object.entries(CUISINE_KEYWORDS)) {
    if (keywords.some(kw => query.includes(kw))) {
      result.cuisines.push(cuisine);
    }
  }

  // Heat level
  for (const [level, keywords] of Object.entries(HEAT_KEYWORDS)) {
    if (keywords.some(kw => query.includes(kw))) {
      result.heat = level;
      break;
    }
  }

  // Dietary preferences
  for (const [diet, keywords] of Object.entries(DIETARY_KEYWORDS)) {
    if (keywords.some(kw => query.includes(kw))) {
      result.dietary.push(diet);
    }
  }

  // Health goals
  for (const [goal, keywords] of Object.entries(HEALTH_GOALS_KEYWORDS)) {
    if (keywords.some(kw => query.includes(kw))) {
      result.healthGoals.push(goal);
    }
  }

  // Food types
  for (const [type, keywords] of Object.entries(FOOD_TYPE_KEYWORDS)) {
    if (keywords.some(kw => query.includes(kw))) {
      result.foodTypes.push(type);
    }
  }

  // Prep methods
  for (const [method, keywords] of Object.entries(PREP_KEYWORDS)) {
    if (keywords.some(kw => query.includes(kw))) {
      result.prepMethods.push(method);
    }
  }

  // Extract potential ingredients (words not in other categories)
  const words = query.split(/\s+/);
  const allKeywords = Object.values(CUISINE_KEYWORDS)
    .concat(Object.values(HEAT_KEYWORDS))
    .concat(Object.values(DIETARY_KEYWORDS))
    .concat(Object.values(HEALTH_GOALS_KEYWORDS))
    .concat(Object.values(FOOD_TYPE_KEYWORDS))
    .concat(Object.values(PREP_KEYWORDS))
    .flat();

  result.ingredients = words.filter(
    w => w.length > 2 && !allKeywords.includes(w) && w !== 'and' && w !== 'with'
  );

  return result;
}

/**
 * Main entry point: parse taste query
 * Uses Gemma if available, falls back to keywords
 */
async function parseTasteQuery(tasteQuery) {
  if (!tasteQuery || tasteQuery.trim().length === 0) {
    return {
      cuisines: [],
      heat: 'none',
      dietary: [],
      healthGoals: [],
      foodTypes: [],
      prepMethods: [],
      ingredients: [],
      restrictions: [],
      confidence: 0,
    };
  }

  // Try Gemma first if enabled
  if (process.env.USE_LOCAL_GEMMA === 'true') {
    const gemmaResult = await parseWithGemma(tasteQuery);
    if (gemmaResult) {
      return gemmaResult;
    }
  }

  // Fall back to keyword matching
  return parseWithKeywords(tasteQuery);
}

/**
 * Score a meal item against parsed taste attributes
 * Higher score = better match
 */
function scoreMealAgainstTaste(mealItem, tasteAttributes, userPreferences = {}) {
  let score = 0;
  const { name = '', description = '', ingredients = [], categories = [] } = mealItem;
  const itemText = `${name} ${description} ${ingredients.join(' ')}`.toLowerCase();

  // Score based on cuisines (high weight)
  if (tasteAttributes.cuisines.length > 0) {
    tasteAttributes.cuisines.forEach(cuisine => {
      if (itemText.includes(cuisine)) score += 30;
    });
  }

  // Score based on food types (high weight)
  if (tasteAttributes.foodTypes.length > 0) {
    tasteAttributes.foodTypes.forEach(type => {
      if (itemText.includes(type)) score += 25;
    });
  }

  // Score based on prep methods
  if (tasteAttributes.prepMethods.length > 0) {
    tasteAttributes.prepMethods.forEach(prep => {
      if (itemText.includes(prep)) score += 15;
    });
  }

  // Score based on ingredients
  if (tasteAttributes.ingredients.length > 0) {
    tasteAttributes.ingredients.forEach(ingredient => {
      if (itemText.includes(ingredient)) score += 10;
    });
  }

  // Boost for health goals keyword matches
  if (tasteAttributes.healthGoals.length > 0) {
    if (itemText.includes('low fat') || itemText.includes('healthy')) score += 5;
    if (itemText.includes('high protein')) score += 5;
    if (itemText.includes('low sodium')) score += 5;
  }

  // Check allergens (penalty if allergen found)
  if (userPreferences.allergies && userPreferences.allergies.length > 0) {
    const allergenText = itemText;
    userPreferences.allergies.forEach(allergen => {
      if (allergenText.includes(allergen.toLowerCase())) {
        score -= 1000; // Strong penalty - basically filter out
      }
    });
  }

  // Check dietary restrictions (penalty if not met)
  if (userPreferences.dietaryRestrictions && userPreferences.dietaryRestrictions.length > 0) {
    const hasDietary = userPreferences.dietaryRestrictions.some(
      d => itemText.includes(d.toLowerCase())
    );
    if (userPreferences.dietaryRestrictions.length > 0 && !hasDietary) {
      score -= 100; // Penalty if doesn't match stated dietary restrictions
    }
  }

  return Math.max(0, score);
}

module.exports = {
  parseTasteQuery,
  scoreMealAgainstTaste,
  parseWithGemma,
  parseWithKeywords,
};
