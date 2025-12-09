# UMenu v2: Quick Start Guide

## ⚡ 5-Minute Setup (With Fallback Mode)

If you don't have MealMe API key yet, the system works with **keyword-based taste parsing** and Google Places/Yelp. Full menu integration comes once you get the MealMe key.

### Step 1: Install & Configure (2 min)

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your keys (Google Places + Yelp at minimum)
nano .env  # or your preferred editor
```

Minimal `.env`:
```
PORT=5000
GOOGLEPLACESAPIKEY=your_google_key
YELPAPIKEY=your_yelp_key
USE_MEALME_API=false
USE_LOCAL_GEMMA=false
```

### Step 2: Start Backend (1 min)

```bash
node updated-server.js
```

You should see:
```
🍽️  UMenu Backend v2 running on http://localhost:5000

📋 Available endpoints:
  POST   /api/restaurants/search-by-taste  (NEW)
  POST   /api/restaurants/search
  ...
```

### Step 3: Open Frontend (1 min)

```bash
# In another terminal
npx serve .
# or
python3 -m http.server 8000
```

Open `http://localhost:3000` (or your server's URL) in browser and open `updated-index.html`

### Step 4: Try It! (1 min)

1. Type in search box: **"spicy vegetarian tacos"**
2. Click **"Search & Get Location"**
3. Allow location access
4. See restaurants and AI-parsed taste attributes

---

## 🎯 Test Scenarios

### Test 1: Keyword Fallback (No APIs needed)

```
Input: "spicy tacos"

Expected Output:
- Parse detected: cuisine=mexican, heat=spicy, foodType=tacos
- Shows nearby restaurants (from Google Places)
- No meal details (MealMe disabled)
```

### Test 2: With MealMe (Full Experience)

1. Get MealMe key: https://www.mealme.ai (24-hour approval)
2. Add to `.env`: `MEALME_API_KEY=your_key`
3. Set `USE_MEALME_API=true`
4. Restart server
5. Search again

```
Input: "vegetarian noodles with low sodium"

Expected Output:
- Parse detected: diet=vegetarian, health=low-sodium, foodType=noodles
- Shows restaurants (MealMe API)
- For each restaurant:
  - Lists actual menu items
  - Shows price, dietary labels, allergen info
  - Scores meals by relevance
  - Filters out high-sodium items
```

### Test 3: Allergen Filtering

```
Input: "fish dishes"
Selected filters: No Shellfish, No Dairy

Expected:
- MealMe returns all fish dishes
- System filters out any with shellfish/dairy
- Only safe meals display
```

---

## 📋 What You Get

### Frontend Features

✨ **Natural Language Search**
- Type how you talk: "craving spicy food"
- Works with adjectives, cuisines, dietary needs

🎯 **Quick Filters**
- Toggle allergies: No Peanuts, No Dairy
- Toggle diets: 🌱 Vegan, 🥬 Vegetarian, 🐟 Pescetarian

🍴 **Meal Cards**
- Restaurant name, rating, address
- Match score (e.g., "92% Match")
- Curated meal options per restaurant

🔖 **Match Reasons**
- Why each meal matches: "Matches cuisine preference", "Vegetarian option"

⭐ **Save & Navigate**
- Save favorites
- Open Google Maps directions

### Backend Features

🧠 **Taste Parsing**
- Extracts: cuisines, heat level, dietary needs, health goals, food types
- Uses keywords by default (Gemma optional)

🔍 **Smart Filtering**
- Filters by: allergies (excluded), dietary restrictions (required)
- Scores meals by relevance

🏪 **Restaurant Discovery**
- Searches via Google Places (default)
- Or MealMe API (when enabled)
- Shows: name, rating, address, menu items

📍 **Location-Based**
- Uses browser geolocation
- Configurable search radius (1-50 miles)

---

## 🎓 Understanding the Flow

```
User types: "vegetarian indian curry, no nuts"
                          ↓
         Frontend extracts + sends to backend
                          ↓
         Backend parses with keyword matching:
         {
           cuisines: ['indian'],
           dietary: ['vegetarian'],
           foodTypes: ['curry'],
           ingredients: [],
           heat: 'none',
           restrictions: ['no nuts']
         }
                          ↓
         Search restaurants via Google/MealMe
                          ↓
         For each restaurant, fetch menu items
                          ↓
         Filter items:
         - Remove items with nuts ✓
         - Keep only vegetarian items ✓
         - Score by Indian + curry match
                          ↓
         Sort by score and return top 5 meals
                          ↓
         Frontend displays restaurant + meals
```

---

## 🔧 Customization

### Change Search Radius

In `updated-index.html`, line ~365:
```javascript
searchRadius: 5,  // Change to 10, 15, etc.
```

### Change Result Limit

In `updated-server.js`, around line 180:
```javascript
.slice(0, 10)  // Change to 20 for more restaurants
```

### Add More Allergies/Diets

In `updated-index.html`, around line 120:
```html
<div class="pref-tag" onclick="togglePreference(this, 'allergies')">
  No Sesame  <!-- Add this -->
</div>
```

Then in `taste-parser.js`, add to keyword database:
```javascript
const DIETARY_KEYWORDS = {
  // ...existing...
  sesame: ['sesame', 'tahini', 'hummus'],
};
```

---

## 🚨 Common Issues & Fixes

| Issue | Fix |
|-------|-----|
| "No restaurants found" | Check API keys, increase radius, verify location |
| Taste parser returns empty | Check console for errors; try simpler query like "tacos" |
| MealMe errors 401 | Verify API key is correct; check if account is active |
| Port 5000 in use | Change PORT in .env or kill process: `lsof -t -i :5000 \| xargs kill -9` |
| CORS errors | Ensure backend is running on localhost:5000 |
| Location not detected | Grant browser permission; check geolocation settings |

---

## 📊 Architecture at a Glance

```
Frontend (updated-index.html)
    ↓ sends {tasteQuery, location, filters}
    ↓
Backend (updated-server.js)
    ├─ Taste Parser (taste-parser.js)
    │   └─ Extracts meaning from natural language
    ├─ MealMe Service (mealme-service.js)
    │   └─ Fetches restaurants + menus
    └─ Response Builder
        └─ Scores + ranks meals
    ↓ returns {restaurants, meals, scores}
    ↓
Frontend renders results
```

---

## 🎬 Demo Queries to Try

1. **"I want spicy food"** → Detects heat level, shows all cuisines
2. **"Vegetarian pasta with fresh ingredients"** → Detects diet + ingredients
3. **"Low sodium fish"** → Detects health goal + protein type
4. **"Mexican food, no beans"** → Detects cuisine + restrictions
5. **"Gluten free pizza"** → Detects dietary + food type

---

## 🚀 Next Steps

1. **Get MealMe Key** (optional but recommended)
   - Visit https://www.mealme.ai
   - Submit form, get key in 24 hours
   - Add to `.env`, set `USE_MEALME_API=true`
   - Restart server for full menu integration

2. **Set Up Gemma** (optional, improves parsing)
   - Install Ollama: https://ollama.ai
   - Run: `ollama pull gemma:7b`
   - Start: `ollama serve`
   - Set `USE_LOCAL_GEMMA=true` in `.env`

3. **Deploy to Production**
   - Use the backend as Express API
   - Serve frontend on a static host (Vercel, Netlify)
   - Update API_BASE in frontend to production URL

---

## 💡 Pro Tips

✅ **Specific > Generic**
- Good: "spicy pad thai"
- Bad: "food"

✅ **Use Full Descriptions**
- Good: "vegetarian, low fat, gluten-free pizza"
- Bad: "pizza"

✅ **Allergens Guaranteed**
- Set allergens to be 100% safe from filtering
- Don't rely on restaurant to notice

✅ **Match Score = Quality**
- Scores 80-100 = excellent match
- Scores 50-80 = decent options
- <50 = try different query

---

## 📞 Need Help?

1. **Check README.md** - Comprehensive docs
2. **Review Console Logs** - Frontend (browser) and backend (terminal)
3. **Test with cURL** - Verify API directly
4. **Check API Status** - `curl http://localhost:5000/api/health`

---

**Happy discovering! 🍽️**
