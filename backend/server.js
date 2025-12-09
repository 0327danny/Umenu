// UMenu Backend Server with Real Restaurant Data
// Integrates Google Places API, Yelp API, Perplexity, and Gemma

const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const axios = require('axios');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Import real restaurant API module
const restaurantsAPI = require('./restaurants-api');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================================
// DATABASE SETUP (SQLite)
// ============================================================================

const db = new sqlite3.Database(process.env.DATABASE_PATH || './umenu.db', (err) => {
  if (err) console.error('Database connection error:', err);
  else console.log('✅ SQLite database connected');
});

// Initialize database tables
const initializeDatabase = () => {
  db.serialize(() => {
    // Users table
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        user_id TEXT PRIMARY KEY,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // User preferences table
    db.run(`
      CREATE TABLE IF NOT EXISTS user_preferences (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        allergies TEXT,
        dietary_restrictions TEXT,
        health_goals TEXT,
        cuisine_preferences TEXT,
        spice_level TEXT DEFAULT 'medium',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(user_id)
      )
    `);

    // Real restaurants cache (from Google Places & Yelp)
    db.run(`
      CREATE TABLE IF NOT EXISTS restaurants_cache (
        id TEXT PRIMARY KEY,
        source TEXT,
        name TEXT NOT NULL,
        cuisine TEXT,
        rating REAL,
        review_count INTEGER,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        address TEXT,
        phone TEXT,
        website TEXT,
        dietary_options TEXT,
        description TEXT,
        image_url TEXT,
        open_now BOOLEAN,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Search history table
    db.run(`
      CREATE TABLE IF NOT EXISTS search_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        location_lat REAL,
        location_lon REAL,
        city TEXT,
        restaurants_found INTEGER,
        results TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(user_id)
      )
    `);

    // Recommendations cache table
    db.run(`
      CREATE TABLE IF NOT EXISTS recommendations_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        restaurant_id TEXT NOT NULL,
        explanation TEXT,
        match_score REAL,
        warnings TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(user_id)
      )
    `);

    console.log('✅ Database tables initialized');
  });
};

initializeDatabase();

// ============================================================================
// API KEYS & CONFIGURATION
// ============================================================================

const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
const PERPLEXITY_API_URL = 'https://api.perplexity.ai/chat/completions';
const RESTAURANT_SOURCE = process.env.RESTAURANT_API_SOURCE || 'combined';
const DEFAULT_RADIUS = parseInt(process.env.DEFAULT_SEARCH_RADIUS) || 25;
const MAX_RESTAURANTS = parseInt(process.env.MAX_RESTAURANTS_PER_SEARCH) || 30;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const getUserId = (req) => {
  return req.headers['x-user-id'] || `user_${Date.now()}`;
};

const queryDb = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

const runDb = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
};

// ============================================================================
// API ENDPOINTS
// ============================================================================

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'UMenu backend is running',
    timestamp: new Date(),
    sources: {
      google_places: !!process.env.GOOGLE_PLACES_API_KEY,
      yelp: !!process.env.YELP_API_KEY,
      perplexity: !!process.env.PERPLEXITY_API_KEY
    }
  });
});

// ============================================================================
// REAL RESTAURANTS ENDPOINT (Google Places + Yelp)
// ============================================================================

app.post('/api/restaurants/real', async (req, res) => {
  try {
    const { latitude, longitude, radius = DEFAULT_RADIUS } = req.body;
    const userId = getUserId(req);

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        error: 'Latitude and longitude are required'
      });
    }

    // Use the restaurants-api router to fetch real data
    // For now, we'll call it directly
    let restaurants = [];

    // Fetch from Google Places
    if (process.env.GOOGLE_PLACES_API_KEY) {
      try {
        const googleResponse = await axios.post('http://localhost:3000/api/restaurants/google', {
          latitude,
          longitude,
          radius
        });
        restaurants = restaurants.concat(googleResponse.data.data || []);
      } catch (err) {
        console.warn('Google Places fetch failed:', err.message);
      }
    }

    // Fetch from Yelp
    if (process.env.YELP_API_KEY) {
      try {
        const yelpResponse = await axios.post('http://localhost:3000/api/restaurants/yelp', {
          latitude,
          longitude,
          radius
        });
        restaurants = restaurants.concat(yelpResponse.data.data || []);
      } catch (err) {
        console.warn('Yelp fetch failed:', err.message);
      }
    }

    // Remove duplicates and sort
    restaurants = deduplicateRestaurants(restaurants);
    restaurants.sort((a, b) => b.rating - a.rating);
    restaurants = restaurants.slice(0, MAX_RESTAURANTS);

    // Cache results
    await runDb(
      `INSERT INTO search_history (user_id, location_lat, location_lon, restaurants_found)
       VALUES (?, ?, ?, ?)`,
      [userId, latitude, longitude, restaurants.length]
    );

    res.json({
      success: true,
      count: restaurants.length,
      data: restaurants,
      radius: radius,
      timestamp: new Date(),
      note: 'Real restaurant data from Google Places & Yelp'
    });
  } catch (error) {
    console.error('Error fetching real restaurants:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch restaurants'
    });
  }
});

// ============================================================================
// USER PREFERENCES
// ============================================================================

app.post('/api/preferences', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { allergies, dietaryRestrictions, healthGoals, cuisinePreferences, spiceLevel } = req.body;

    await runDb('INSERT OR IGNORE INTO users (user_id) VALUES (?)', [userId]);

    await runDb(
      `INSERT INTO user_preferences 
       (user_id, allergies, dietary_restrictions, health_goals, cuisine_preferences, spice_level)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        userId,
        JSON.stringify(allergies || []),
        JSON.stringify(dietaryRestrictions || []),
        JSON.stringify(healthGoals || []),
        JSON.stringify(cuisinePreferences || []),
        spiceLevel || 'medium'
      ]
    );

    res.json({ success: true, message: 'Preferences saved', userId });
  } catch (error) {
    console.error('Error saving preferences:', error);
    res.status(500).json({ error: 'Failed to save preferences' });
  }
});

app.get('/api/preferences', async (req, res) => {
  try {
    const userId = getUserId(req);

    const prefs = await queryDb(
      `SELECT * FROM user_preferences WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );

    if (prefs.length === 0) {
      return res.json({ success: false, message: 'No preferences found' });
    }

    const pref = prefs[0];
    res.json({
      success: true,
      data: {
        allergies: JSON.parse(pref.allergies || '[]'),
        dietaryRestrictions: JSON.parse(pref.dietary_restrictions || '[]'),
        healthGoals: JSON.parse(pref.health_goals || '[]'),
        cuisinePreferences: JSON.parse(pref.cuisine_preferences || '[]'),
        spiceLevel: pref.spice_level
      }
    });
  } catch (error) {
    console.error('Error fetching preferences:', error);
    res.status(500).json({ error: 'Failed to fetch preferences' });
  }
});

// ============================================================================
// PERPLEXITY RECOMMENDATIONS
// ============================================================================

app.post('/api/recommendations', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { userProfile, restaurants } = req.body;

    if (!restaurants || restaurants.length === 0) {
      return res.status(400).json({ error: 'No restaurants provided' });
    }

    if (!PERPLEXITY_API_KEY) {
      return res.status(400).json({
        error: 'Perplexity API not configured',
        note: 'Add PERPLEXITY_API_KEY to .env to enable AI recommendations'
      });
    }

    const prompt = `
You are UMenu's dietary recommendation specialist. Analyze these REAL restaurants from Google Places and Yelp against the user's dietary profile and provide personalized recommendations.

USER DIETARY PROFILE:
- Allergies: ${userProfile.allergies?.join(', ') || 'None'}
- Dietary Restrictions: ${userProfile.dietaryRestrictions?.join(', ') || 'None'}
- Health Goals: ${userProfile.healthGoals?.join(', ') || 'None'}
- Cuisine Preferences: ${userProfile.cuisinePreferences?.join(', ') || 'Any'}
- Spice Level: ${userProfile.spiceLevel || 'Medium'}

NEARBY REAL RESTAURANTS:
${restaurants.map(r => `
- ${r.name} (${r.source})
  Rating: ${r.rating}/5 (${r.reviewCount} reviews)
  Address: ${r.address}
  Phone: ${r.phone || 'N/A'}
  Dietary Options: ${r.dietaryOptions?.join(', ') || 'Unknown'}
  Description: ${r.description}
`).join('\n')}

For EACH restaurant, provide:
1. Match Score (0-100)
2. Explanation: Why is/isn't this suitable
3. Specific Warnings: Allergen concerns or incompatibilities
4. Best Dishes or Menu Items: What to order (if suitable)

Format your response as JSON with array of objects:
[
  {
    "restaurantName": "...",
    "matchScore": 85,
    "explanation": "...",
    "warnings": "...",
    "bestDishes": ["..."]
  }
]
`;

    const response = await axios.post(PERPLEXITY_API_URL, {
      model: 'pplx-7b-online',
      messages: [
        {
          role: 'system',
          content: 'You are a nutrition expert AI. Provide JSON-formatted dietary recommendations.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 2000
    }, {
      headers: {
        'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const content = response.data.choices[0].message.content;
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    const recommendations = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

    res.json({
      success: true,
      count: recommendations.length,
      recommendations: recommendations,
      timestamp: new Date(),
      note: 'Powered by Perplexity AI'
    });
  } catch (error) {
    console.error('Error generating recommendations:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const deduplicateRestaurants = (restaurants) => {
  const seen = new Set();
  return restaurants.filter((restaurant) => {
    const key = `${restaurant.name.toLowerCase()}-${Math.round(restaurant.latitude * 100)}-${Math.round(restaurant.longitude * 100)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

// ============================================================================
// USE REAL RESTAURANT API ROUTES
// ============================================================================

app.use('/api', restaurantsAPI);

// ============================================================================
// ERROR HANDLING & SERVER START
// ============================================================================

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`\n✅ UMenu Backend Server Running`);
  console.log(`📍 http://localhost:${PORT}`);
  console.log(`🔌 API: http://localhost:${PORT}/api`);
  console.log(`🏥 Health Check: http://localhost:${PORT}/api/health\n`);
  console.log('📊 Real Restaurant APIs:');
  console.log(`  • Google Places: ${process.env.GOOGLE_PLACES_API_KEY ? '✅ ENABLED' : '❌ DISABLED'}`);
  console.log(`  • Yelp Fusion: ${process.env.YELP_API_KEY ? '✅ ENABLED' : '❌ DISABLED'}`);
  console.log(`  • Perplexity AI: ${process.env.PERPLEXITY_API_KEY ? '✅ ENABLED' : '❌ DISABLED'}\n`);
});

module.exports = app;
