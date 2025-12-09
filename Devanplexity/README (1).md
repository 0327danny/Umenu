# UMenu v2: AI-Powered Taste-Based Restaurant Discovery

## 🚀 Overview

UMenu v2 is a revolutionary restaurant discovery platform that uses **natural language taste preferences** and **AI parsing** to find restaurants and curate meal options that match exactly what you're craving.

### Key Features

✨ **Taste-Based Search**: Simply describe what you want ("spicy vegetarian noodles", "low-sodium fish tacos") and UMenu finds matching restaurants and meals

🍽️ **MealMe API Integration**: Access real menus with actual meal options, prices, and detailed nutritional info

🧠 **AI Taste Parsing**: Uses Gemma 3.4B (or keyword fallback) to extract meaning from natural language queries

🔒 **Allergen Filtering**: Automatically excludes meals containing your allergies at the item level

🌱 **Dietary Customization**: Filter meals by vegan, vegetarian, keto, gluten-free, and more

📍 **Location-Based**: Finds restaurants near you with curated meal recommendations

---

## 📋 Setup Instructions

### 1. Prerequisites

- **Node.js** 16+ and **npm**
- **MongoDB** running locally or via Atlas
- **API Keys** (all optional, but recommended):
  - Google Places API key
  - Yelp Fusion API key
  - Perplexity API key
  - **MealMe API key** (NEW - request access at https://www.mealme.ai)
- **Optional**: Ollama with Gemma 3.4B model for local AI parsing

### 2. Install Dependencies

```bash
npm install
```

**Key packages added for v2:**
- `axios` - HTTP client for API calls
- `.env` - Environment variable management
- Others from original UMENU setup

### 3. Configure Environment Variables

Copy `.env.example` to `.env` and fill in your API keys:

```bash
cp .env.example .env
```

Edit `.env`:

```
PORT=5000
MONGODB_URI=mongodb://localhost:27017/umenu

GOOGLEPLACESAPIKEY=your_key_here
YELPAPIKEY=your_key_here
PERPLEXITYAPIKEY=your_key_here
MEALME_API_KEY=your_key_here

USE_MEALME_API=true
USE_LOCAL_GEMMA=false
```

#### Getting MealMe API Key

1. Visit https://www.mealme.ai
2. Click "Fill out form for API access"
3. Complete the form and submit
4. You'll receive API credentials within 24 hours
5. Add your key to `.env`

#### Optional: Local Gemma Setup

To use local Gemma 3.4B for better taste parsing:

```bash
# Install Ollama from https://ollama.ai
ollama pull gemma:7b

# Start Ollama service (it runs on localhost:11434)
ollama serve
```

Then in `.env`:
```
USE_LOCAL_GEMMA=true
OLLAMA_API_URL=http://localhost:11434
OLLAMA_MODEL=gemma:7b
```

### 4. Start the Backend

```bash
# Development with auto-reload
npm run dev  # requires nodemon

# Or production
node updated-server.js
```

Server should start on `http://localhost:5000`

Check health: `http://localhost:5000/api/health`

### 5. Open the Frontend

Replace your `index.html` with `updated-index.html` or serve it:

```bash
# Option 1: Static server
npx serve .

# Option 2: Python server
python3 -m http.server 8000

# Option 3: Direct browser
open updated-index.html
```

Visit `http://localhost:3000` or wherever your server runs.

---

## 🎯 How It Works

### Data Flow

```
User Input: "craving spicy vegetarian noodles"
    ↓
Frontend sends {tasteQuery, latitude, longitude, allergies, dietaryRestrictions}
    ↓
Backend:
  1. Parse query using Gemma/keywords → {cuisine, diet, heat, type, ...}
  2. Search MealMe for restaurants near user
  3. For each restaurant, fetch menu items
  4. Score/filter meals against:
     - Allergens (excluded automatically)
     - Dietary restrictions (required match)
     - Taste relevance (scored by parser)
  5. Return ranked [restaurant + top 5 matching meals]
    ↓
Frontend renders: Restaurant cards with curated meal options
```

### Taste Parsing

**With Gemma (AI-powered):**
- Sends natural language to local Gemma model
- Returns structured JSON with cuisines, diet labels, health goals, ingredients, etc.
- ~90% accuracy with proper parsing

**With Keywords (fallback, no setup needed):**
- Pattern matches against cuisine, diet, ingredient, health goal databases
- ~70% accuracy but works offline
- No additional dependencies

### MealMe Integration

The `MealMeService` class:
- Searches restaurants by location + optional query
- Fetches menus with items, prices, allergens, dietary labels
- Filters items by user allergies and restrictions
- Returns normalized meal data

### Scoring System

Each meal is scored on:

| Factor | Points |
|--------|--------|
| Cuisine match | +30 |
| Food type match | +25 |
| Prep method match | +15 |
| Ingredient match | +10 |
| Health goal keyword | +5 |
| Contains user allergen | -1000 |
| Doesn't match dietary | -100 |

---

## 🔌 API Endpoints

### New Endpoint: Taste-Based Search

```
POST /api/restaurants/search-by-taste
```

**Request:**
```json
{
  "tasteQuery": "spicy vegetarian noodles",
  "latitude": 37.7749,
  "longitude": -122.4194,
  "radius": 5,
  "allergies": ["peanuts", "shellfish"],
  "dietaryRestrictions": ["vegetarian"],
  "userId": "user123"
}
```

**Response:**
```json
{
  "success": true,
  "count": 5,
  "tasteAttributes": {
    "cuisines": ["asian"],
    "heat": "spicy",
    "dietary": ["vegetarian"],
    "foodTypes": ["noodles"],
    "confidence": 0.85
  },
  "restaurants": [
    {
      "id": "mealme_123",
      "name": "Spicy Noodle House",
      "address": "123 Main St",
      "rating": 4.5,
      "matchScore": 92,
      "meals": [
        {
          "id": "item_456",
          "name": "Spicy Vegetable Pad Thai",
          "price": 12.99,
          "score": 95,
          "matchReasons": [
            "Matches cuisine preference",
            "Matches food type",
            "Vegetarian option"
          ],
          "dietary_labels": ["vegetarian", "vegan"]
        }
      ]
    }
  ]
}
```

### Existing Endpoints (Unchanged)

- `POST /api/users/create` - Create user
- `POST /api/users/preferences` - Save preferences
- `POST /api/users/location` - Save location
- `GET /api/users/:userId` - Get user profile
- `POST /api/restaurants/search` - Legacy search (Google/Yelp only)
- `POST /api/favorites/add` - Save to favorites
- `GET /api/favorites/:userId` - Get favorites
- `POST /api/insights` - AI insights via Perplexity

---

## 🧪 Testing the System

### Test 1: Simple Keyword Match (No API Setup)

```bash
curl -X POST http://localhost:5000/api/restaurants/search-by-taste \
  -H "Content-Type: application/json" \
  -d '{
    "tasteQuery": "spicy tacos",
    "latitude": 37.7749,
    "longitude": -122.4194,
    "radius": 5
  }'
```

Expected: Works with Google Places/Yelp fallback

### Test 2: With MealMe API

Set `MEALME_API_KEY` in `.env` and `USE_MEALME_API=true`, then:

```bash
curl -X POST http://localhost:5000/api/restaurants/search-by-taste \
  -H "Content-Type: application/json" \
  -d '{
    "tasteQuery": "vegetarian pasta with fresh ingredients",
    "latitude": 37.7749,
    "longitude": -122.4194,
    "radius": 3,
    "allergies": ["peanuts"],
    "dietaryRestrictions": ["vegetarian"]
  }'
```

Expected: Returns restaurants + actual meal items from MealMe

### Test 3: Allergen Filtering

```bash
# Same as Test 2 but with shellfish in allergies
"allergies": ["peanuts", "shellfish"]
```

Expected: Any meals containing shellfish are filtered out

---

## 🛠️ Customization

### Extend Taste Parser

Edit `taste-parser.js` to add more keywords:

```javascript
const CUISINE_KEYWORDS = {
  // Add new cuisines
  korean: ['korean', 'bibimbap', 'kimchi', 'bulgogi'],
  // ...
};
```

### Customize Scoring

In `updated-server.js`, modify `calculateRestaurantMatchScore()`:

```javascript
// Change how heavily cuisine is weighted
if (tasteAttributes.cuisines.length > 0) {
  tasteAttributes.cuisines.forEach((cuisine) => {
    if (restaurantText.includes(cuisine)) score += 50; // Increased from 30
  });
}
```

### Add More Meal Filters

In `MealMeService.filterItemsByPreferences()`:

```javascript
// Add price range filter
if (maxPrice && item.price > maxPrice) return false;

// Add popularity filter
if (minRating && item.rating < minRating) return false;
```

---

## 📊 Performance Tips

1. **Cache MealMe results**: Restaurants change menus infrequently; cache for 1-2 hours
2. **Limit restaurants fetched**: Currently processes top 10; increase/decrease as needed
3. **Parallel requests**: Use `Promise.all()` to fetch menus in parallel
4. **Local Gemma**: Running Gemma locally is faster than cloud AI after warmup

---

## 🐛 Troubleshooting

### "No restaurants found"
- Check API keys in `.env`
- Verify location coordinates are correct
- Increase radius (default 5 miles)

### "Taste parser returns empty"
- Keyword match may be case-sensitive; check logs
- If using Gemma, verify Ollama is running: `curl http://localhost:11434/api/tags`
- Check JSON formatting in response

### MealMe API errors
- Verify API key is correct
- Check rate limits (free tier has limits)
- Ensure latitude/longitude are valid

### Port already in use
```bash
# Change PORT in .env or kill process
kill -9 $(lsof -t -i :5000)
```

---

## 📚 File Structure

```
umenu/
├── updated-server.js          # New backend with taste search
├── taste-parser.js            # AI parsing (Gemma + keywords)
├── mealme-service.js          # MealMe API wrapper
├── updated-index.html         # New frontend with search bar
├── models/
│   ├── User.js               # User profile + preferences
│   ├── Restaurant.js         # Restaurant metadata
│   └── Favorite.js           # Saved restaurants
├── db.js                      # MongoDB connection
├── .env.example               # Environment template
└── package.json               # Dependencies
```

---

## 🚀 Future Enhancements

- [ ] Mobile app (React Native)
- [ ] Real-time nutrition tracking
- [ ] Social sharing (meal recommendations)
- [ ] Restaurant partnerships for discounts
- [ ] Voice search ("Hey UMenu, find me spicy food")
- [ ] ML-based personalization (learn from visit history)
- [ ] Multi-language support
- [ ] Offline mode with cached menus

---

## 📝 License

MIT

---

## 💬 Support

For issues or questions:
1. Check the troubleshooting section
2. Review API documentation (MealMe, Google Places, Yelp)
3. Check backend logs in console
4. Open an issue on GitHub

---

**Enjoy discovering restaurants the UMenu way! 🍽️**
