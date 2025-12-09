/**
 * updated-server.js - UMENU v2 Backend with Taste-Based Search
 * 
 * Key changes:
 * - POST /api/restaurants/search-by-taste (NEW)
 * - Integrates MealMe API
 * - Uses Gemma/keyword parsing for taste queries
 * - Curates meals based on preferences
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

// Database
const connectDB = require('./db');
const User = require('./models/User');
const Restaurant = require('./models/Restaurant');
const Favorite = require('./models/Favorite');

// New services
const { parseTasteQuery, scoreMealAgainstTaste } = require('./taste-parser');
const MealMeService = require('./mealme-service');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Connect to database
connectDB();

// Initialize MealMe service
const mealmeApiKey = process.env.MEALME_API_KEY;
const mealmeService = mealmeApiKey ? new MealMeService(mealmeApiKey) : null;

// ============ HEALTH CHECK ============
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    database: 'connected',
    apis: {
      googleplaces: !!process.env.GOOGLEPLACESAPIKEY,
      yelp: !!process.env.YELPAPIKEY,
      perplexity: !!process.env.PERPLEXITYAPIKEY,
      mealme: !!process.env.MEALME_API_KEY,
    },
  });
});

// ============ USER ENDPOINTS ============
app.post('/api/users/create', async (req, res) => {
  try {
    const { userId, email } = req.body;
    let user = await User.findOne({ userId });
    if (!user) {
      user = new User({ userId, email });
      await user.save();
    }
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users/preferences', async (req, res) => {
  try {
    const { userId, preferences } = req.body;
    const user = await User.findOneAndUpdate(
      { userId },
      { preferences, updatedAt: new Date() },
      { new: true, upsert: true }
    );
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users/location', async (req, res) => {
  try {
    const { userId, latitude, longitude, searchRadius } = req.body;
    const user = await User.findOneAndUpdate(
      { userId },
      {
        location: { latitude, longitude },
        searchRadius: searchRadius || 25,
        updatedAt: new Date(),
      },
      { new: true, upsert: true }
    );
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/users/:userId', async (req, res) => {
  try {
    const user = await User.findOne({ userId: req.params.userId });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ NEW: TASTE-BASED SEARCH ============
/**
 * POST /api/restaurants/search-by-taste
 * 
 * Search restaurants and curate meals based on taste preference query
 * 
 * Request body:
 * {
 *   tasteQuery: "spicy vegetarian tacos",
 *   latitude: 37.7749,
 *   longitude: -122.4194,
 *   radius: 5,
 *   userId: "user123",  // Optional, for user preferences
 *   allergies: ["peanuts"],
 *   dietaryRestrictions: ["vegetarian"]
 * }
 * 
 * Response:
 * {
 *   success: true,
 *   tasteAttributes: {...parsed taste},
 *   restaurants: [
 *     {
 *       id, name, address, rating,
 *       matchScore: 85,
 *       meals: [
 *         { id, name, price, score, matchReasons }
 *       ]
 *     }
 *   ]
 * }
 */
app.post('/api/restaurants/search-by-taste', async (req, res) => {
  const {
    tasteQuery,
    latitude,
    longitude,
    radius = 5,
    userId,
    allergies = [],
    dietaryRestrictions = [],
  } = req.body;

  if (!latitude || !longitude || !tasteQuery) {
    return res.status(400).json({
      error: 'Missing required fields: latitude, longitude, tasteQuery',
    });
  }

  try {
    // Step 1: Parse the taste query
    console.log(`[API] Parsing taste query: "${tasteQuery}"`);
    const tasteAttributes = await parseTasteQuery(tasteQuery);
    console.log('[API] Parsed attributes:', tasteAttributes);

    // Step 2: Search for restaurants
    let restaurants = [];

    // Try MealMe first (if available)
    if (mealmeService && process.env.USE_MEALME_API === 'true') {
      console.log('[API] Searching MealMe for restaurants');
      try {
        restaurants = await mealmeService.searchRestaurants(
          latitude,
          longitude,
          radius,
          tasteQuery // Pass query for relevance
        );
        console.log(`[API] Found ${restaurants.length} restaurants from MealMe`);
      } catch (mealmeErr) {
        console.warn('[API] MealMe search failed, falling back to Google/Yelp');
      }
    }

    // Fallback to Google Places + Yelp
    if (restaurants.length === 0) {
      console.log('[API] Falling back to Google Places + Yelp');
      restaurants = await fetchRestaurantsFromGoogleYelp(
        latitude,
        longitude,
        radius
      );
    }

    // Step 3: Get menus and curate meals for each restaurant
    const restaurantsWithMeals = await Promise.all(
      restaurants.slice(0, 10).map(async (restaurant) => {
        let meals = [];
        let matchScore = 0;

        // Get menus from MealMe if available
        if (
          mealmeService &&
          process.env.USE_MEALME_API === 'true' &&
          restaurant.quoteIds &&
          restaurant.quoteIds.length > 0
        ) {
          try {
            console.log(`[API] Fetching menu for ${restaurant.name}`);
            const menuItems = await mealmeService.getMenuItems(
              restaurant.quoteIds[0]
            );

            // Filter by user preferences
            const filtered = mealmeService.filterItemsByPreferences(
              menuItems,
              allergies,
              dietaryRestrictions
            );

            // Score and rank meals
            meals = filtered
              .map((item) => ({
                id: item.id,
                name: item.name,
                description: item.description,
                price: item.price,
                category: item.category,
                image: item.image,
                allergens: item.allergens,
                dietary_labels: item.dietary_labels,
                score: scoreMealAgainstTaste(item, tasteAttributes, {
                  allergies,
                  dietaryRestrictions,
                }),
                matchReasons: generateMatchReasons(
                  item,
                  tasteAttributes
                ),
              }))
              .sort((a, b) => b.score - a.score)
              .slice(0, 5); // Top 5 meals per restaurant
          } catch (menuErr) {
            console.warn(
              `[API] Failed to get menu for ${restaurant.name}:`,
              menuErr.message
            );
          }
        }

        // Calculate restaurant match score based on taste
        matchScore = calculateRestaurantMatchScore(
          restaurant,
          tasteAttributes,
          meals
        );

        return {
          ...restaurant,
          matchScore,
          meals,
        };
      })
    );

    // Step 4: Sort by match score and filter
    const topRestaurants = restaurantsWithMeals
      .filter((r) => r.matchScore > 0 || r.meals.length > 0)
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 10);

    res.json({
      success: true,
      count: topRestaurants.length,
      tasteAttributes,
      restaurants: topRestaurants,
    });
  } catch (error) {
    console.error('[API] Search error:', error.message);
    res.status(500).json({
      error: error.message,
    });
  }
});

/**
 * Helper: Calculate how well a restaurant matches the taste query
 */
function calculateRestaurantMatchScore(restaurant, tasteAttributes, meals) {
  let score = 0;

  const restaurantText =
    `${restaurant.name} ${(restaurant.dietaryOptions || []).join(' ')}`.toLowerCase();

  // Points for cuisine match
  if (tasteAttributes.cuisines.length > 0) {
    tasteAttributes.cuisines.forEach((cuisine) => {
      if (restaurantText.includes(cuisine)) score += 30;
    });
  }

  // Points for meals that match
  if (meals.length > 0) {
    const topMealScore = meals[0].score;
    score += Math.min(topMealScore / 10, 40); // Up to 40 points from top meal
  }

  // Points for dietary options
  if (tasteAttributes.dietary.length > 0) {
    tasteAttributes.dietary.forEach((diet) => {
      if (restaurantText.includes(diet)) score += 20;
    });
  }

  // Slight boost for rating
  if (restaurant.rating && restaurant.rating > 4) {
    score += 10;
  }

  return Math.round(score);
}

/**
 * Helper: Generate human-readable match reasons for a meal
 */
function generateMatchReasons(meal, tasteAttributes) {
  const reasons = [];
  const itemText = `${meal.name} ${meal.description}`.toLowerCase();

  if (tasteAttributes.cuisines.some((c) => itemText.includes(c))) {
    reasons.push('Matches cuisine preference');
  }
  if (tasteAttributes.foodTypes.some((t) => itemText.includes(t))) {
    reasons.push('Matches food type');
  }
  if (tasteAttributes.ingredients.some((i) => itemText.includes(i))) {
    reasons.push('Contains requested ingredients');
  }
  if (tasteAttributes.prepMethods.some((p) => itemText.includes(p))) {
    reasons.push(`Prepared as requested (${tasteAttributes.prepMethods[0]})`);
  }
  if (meal.dietary_labels && meal.dietary_labels.length > 0) {
    reasons.push(`${meal.dietary_labels.join(', ')} option`);
  }

  return reasons.slice(0, 3); // Top 3 reasons
}

/**
 * Helper: Fetch restaurants from Google Places + Yelp (fallback)
 */
async function fetchRestaurantsFromGoogleYelp(latitude, longitude, radiusMiles) {
  const restaurants = [];
  const radiusMeters = radiusMiles * 1609.34;

  // Google Places
  try {
    if (process.env.GOOGLEPLACESAPIKEY) {
      const googleRes = await axios.get(
        'https://maps.googleapis.com/maps/api/place/nearbysearch/json',
        {
          params: {
            location: `${latitude},${longitude}`,
            radius: radiusMeters,
            type: 'restaurant',
            key: process.env.GOOGLEPLACESAPIKEY,
          },
          timeout: 5000,
        }
      );

      if (googleRes.data.results) {
        googleRes.data.results.forEach((place) => {
          restaurants.push({
            id: place.place_id,
            name: place.name,
            latitude: place.geometry.location.lat,
            longitude: place.geometry.location.lng,
            address: place.vicinity,
            rating: place.rating || 0,
            reviewCount: place.user_ratings_total || 0,
            source: 'googleplaces',
            dietaryOptions: place.types || [],
          });
        });
      }
    }
  } catch (err) {
    console.warn('[API] Google Places error:', err.message);
  }

  // Yelp Fusion
  try {
    if (process.env.YELPAPIKEY) {
      const yelpRes = await axios.get('https://api.yelp.com/v3/businesses/search', {
        params: {
          latitude,
          longitude,
          radius: Math.min(radiusMeters, 40000),
          categories: 'restaurants',
          limit: 20,
          sort_by: 'rating',
        },
        headers: {
          Authorization: `Bearer ${process.env.YELPAPIKEY}`,
        },
        timeout: 5000,
      });

      if (yelpRes.data.businesses) {
        yelpRes.data.businesses.forEach((business) => {
          restaurants.push({
            id: business.id,
            name: business.name,
            latitude: business.coordinates.latitude,
            longitude: business.coordinates.longitude,
            address: business.location.address1,
            rating: business.rating || 0,
            reviewCount: business.review_count || 0,
            source: 'yelp',
            dietaryOptions: (business.categories || []).map((c) => c.title),
            phone: business.phone,
            website: business.url,
          });
        });
      }
    }
  } catch (err) {
    console.warn('[API] Yelp error:', err.message);
  }

  return restaurants;
}

// ============ RESTAURANT SEARCH (Legacy) ============
app.post('/api/restaurants/search', async (req, res) => {
  const { latitude, longitude, radius } = req.body;

  if (!latitude || !longitude || !radius) {
    return res.status(400).json({
      error: 'Missing coordinates or radius',
    });
  }

  try {
    const restaurants = await fetchRestaurantsFromGoogleYelp(
      latitude,
      longitude,
      radius
    );

    res.json({
      success: true,
      count: restaurants.length,
      data: restaurants,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ FAVORITES ============
app.post('/api/favorites/add', async (req, res) => {
  try {
    const { userId, externalId, restaurantName, source, latitude, longitude, rating, address } =
      req.body;

    if (!userId || !externalId || !restaurantName) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const favorite = new Favorite({
      userId,
      externalId,
      restaurantName,
      source: source || 'googleplaces',
      latitude,
      longitude,
      rating,
      address,
    });

    await favorite.save();
    res.json({
      success: true,
      favorite,
      message: 'Added to favorites',
    });
  } catch (err) {
    if (err.code === 11000) {
      res.json({ success: true, message: 'Already in favorites' });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

app.get('/api/favorites/:userId', async (req, res) => {
  try {
    const favorites = await Favorite.find({ userId: req.params.userId })
      .sort({ savedAt: -1 })
      .lean();

    res.json({
      success: true,
      count: favorites.length,
      favorites,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/favorites/check/:userId/:externalId', async (req, res) => {
  try {
    const favorite = await Favorite.findOne({
      userId: req.params.userId,
      externalId: req.params.externalId,
    });

    res.json({
      success: true,
      isFavorite: !!favorite,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/favorites/:favoriteId', async (req, res) => {
  try {
    const result = await Favorite.findByIdAndDelete(req.params.favoriteId);
    if (!result) {
      return res.status(404).json({ error: 'Favorite not found' });
    }
    res.json({ success: true, message: 'Favorite removed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/favorites/user/:userId/external/:externalId', async (req, res) => {
  try {
    const result = await Favorite.findOneAndDelete({
      userId: req.params.userId,
      externalId: req.params.externalId,
    });
    if (!result) {
      return res.status(404).json({ error: 'Favorite not found' });
    }
    res.json({ success: true, message: 'Favorite removed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/favorites/:favoriteId/mark-visited', async (req, res) => {
  try {
    const favorite = await Favorite.findByIdAndUpdate(
      req.params.favoriteId,
      {
        visited: true,
        visitedDate: new Date(),
      },
      { new: true }
    );
    if (!favorite) {
      return res.status(404).json({ error: 'Favorite not found' });
    }
    res.json({ success: true, favorite });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ AI INSIGHTS ============
app.post('/api/insights', async (req, res) => {
  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: 'Missing prompt' });
  }

  try {
    if (!process.env.PERPLEXITYAPIKEY) {
      return res.status(400).json({ error: 'Perplexity API key not configured' });
    }

    const response = await axios.post(
      'https://api.perplexity.ai/openai',
      {
        model: 'pplx-70b-online',
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: 500,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.PERPLEXITYAPIKEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );

    res.json({
      success: true,
      content: response.data.choices[0].message.content,
    });
  } catch (err) {
    console.error('[API] Perplexity error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============ ERROR HANDLING ============
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
  });
});

// ============ START SERVER ============
app.listen(PORT, () => {
  console.log(`\n🍽️  UMenu Backend v2 running on http://localhost:${PORT}`);
  console.log('\n📋 Available endpoints:');
  console.log('  POST   /api/users/create');
  console.log('  POST   /api/users/preferences');
  console.log('  POST   /api/users/location');
  console.log('  GET    /api/users/:userId');
  console.log('  POST   /api/restaurants/search-by-taste  (NEW)');
  console.log('  POST   /api/restaurants/search');
  console.log('  POST   /api/favorites/add');
  console.log('  GET    /api/favorites/:userId');
  console.log('  DELETE /api/favorites/:favoriteId');
  console.log('  POST   /api/insights');
  console.log('\n🔧 Configuration:');
  console.log(`  MealMe API: ${process.env.USE_MEALME_API === 'true' ? '✓ Enabled' : '✗ Disabled'}`);
  console.log(
    `  Gemma/Ollama: ${
      process.env.USE_LOCAL_GEMMA === 'true' ? '✓ Enabled' : '✗ Using keyword fallback'
    }`
  );
  console.log('\n');
});

module.exports = app;
