const express = require('express');
const cors = require('cors');
require('dotenv').config();
const axios = require('axios');
const connectDB = require('./db');
const User = require('./models/User');
const Restaurant = require('./models/Restaurant');
const Favorite = require('./models/Favorite');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Connect to database
connectDB();

// ============ HEALTH CHECK ============
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        database: 'connected',
        apis: {
            google_places: !!process.env.GOOGLE_PLACES_API_KEY,
            yelp: !!process.env.YELP_API_KEY,
            perplexity: !!process.env.PERPLEXITY_API_KEY
        }
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
            { preferences, updatedAt: Date.now() },
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
                updatedAt: Date.now()
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
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json({ success: true, user });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============ RESTAURANT SEARCH ============
app.post('/api/restaurants/search', async (req, res) => {
    const { latitude, longitude, radius } = req.body;
    
    if (!latitude || !longitude || !radius) {
        return res.status(400).json({ error: 'Missing coordinates or radius' });
    }

    try {
        const restaurants = [];

        // Try Google Places API
        try {
            if (!process.env.GOOGLE_PLACES_API_KEY) {
                console.warn('⚠️ Google Places API key not configured');
            } else {
                const googleRes = await axios.get(
                    'https://maps.googleapis.com/maps/api/place/nearbysearch/json',
                    {
                        params: {
                            location: `${latitude},${longitude}`,
                            radius: radius * 1609.34,
                            type: 'restaurant',
                            key: process.env.GOOGLE_PLACES_API_KEY
                        },
                        timeout: 5000
                    }
                );
                
                if (googleRes.data.results) {
                    for (const place of googleRes.data.results) {
                        const restaurantData = {
                            externalId: place.place_id,
                            name: place.name,
                            latitude: place.geometry.location.lat,
                            longitude: place.geometry.location.lng,
                            rating: place.rating || 0,
                            reviewCount: place.user_ratings_total || 0,
                            address: place.vicinity || '',
                            source: 'google_places',
                            description: '',
                            lastUpdated: Date.now()
                        };
                        
                        // Save or update in database
                        await Restaurant.findOneAndUpdate(
                            { externalId: place.place_id },
                            restaurantData,
                            { upsert: true, new: true }
                        );
                        
                        restaurants.push(restaurantData);
                    }
                    console.log(`✅ Google Places: Found ${googleRes.data.results.length} restaurants`);
                }
            }
        } catch (err) {
            console.error('Google Places error:', err.message);
        }

        // Try Yelp Fusion API
        try {
            if (!process.env.YELP_API_KEY) {
                console.warn('⚠️ Yelp API key not configured');
            } else {
                const yelpRes = await axios.get(
                    'https://api.yelp.com/v3/businesses/search',
                    {
                        params: {
                            latitude,
                            longitude,
                            radius: Math.min(radius * 1609.34, 40000),
                            categories: 'restaurants',
                            limit: 20,
                            sort_by: 'rating'
                        },
                        headers: {
                            Authorization: `Bearer ${process.env.YELP_API_KEY}`
                        },
                        timeout: 5000
                    }
                );
                
                if (yelpRes.data.businesses) {
                    for (const business of yelpRes.data.businesses) {
                        const restaurantData = {
                            externalId: business.id,
                            name: business.name,
                            latitude: business.coordinates.latitude,
                            longitude: business.coordinates.longitude,
                            rating: business.rating || 0,
                            reviewCount: business.review_count || 0,
                            address: business.location.address1 || '',
                            source: 'yelp',
                            dietaryOptions: business.categories 
                                ? business.categories.map(c => c.title) 
                                : [],
                            phone: business.phone || '',
                            website: business.url || '',
                            imageUrl: business.image_url || '',
                            lastUpdated: Date.now()
                        };
                        
                        // Save or update in database
                        await Restaurant.findOneAndUpdate(
                            { externalId: business.id },
                            restaurantData,
                            { upsert: true, new: true }
                        );
                        
                        restaurants.push(restaurantData);
                    }
                    console.log(`✅ Yelp: Found ${yelpRes.data.businesses.length} restaurants`);
                }
            }
        } catch (err) {
            console.error('Yelp error:', err.message);
        }

        if (restaurants.length === 0) {
            console.warn('⚠️ No restaurants found - check API keys are configured');
        }

        res.json({ 
            success: true, 
            count: restaurants.length, 
            data: restaurants 
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============ FAVORITES ============
app.post('/api/favorites/add', async (req, res) => {
    try {
        const { userId, externalId, restaurantName, source, latitude, longitude, rating, address } = req.body;
        
        if (!userId || !externalId || !restaurantName) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        const favorite = new Favorite({
            userId,
            externalId,
            restaurantName,
            source: source || 'google_places',
            latitude,
            longitude,
            rating,
            address
        });
        
        await favorite.save();
        res.json({ success: true, favorite, message: 'Added to favorites' });
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
        
        res.json({ success: true, count: favorites.length, favorites });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/favorites/check/:userId/:externalId', async (req, res) => {
    try {
        const favorite = await Favorite.findOne({ 
            userId: req.params.userId,
            externalId: req.params.externalId
        });
        
        res.json({ success: true, isFavorite: !!favorite });
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
            externalId: req.params.externalId
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
                visitedDate: Date.now()
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
        if (!process.env.PERPLEXITY_API_KEY) {
            return res.status(400).json({ error: 'Perplexity API key not configured' });
        }

        const response = await axios.post('https://api.perplexity.ai/openai/', {
            model: 'pplx-70b-online',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 500
        }, {
            headers: {
                Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`,
                'Content-Type': 'application/json'
            },
            timeout: 10000
        });

        res.json({ 
            success: true, 
            content: response.data.choices[0].message.content 
        });
    } catch (err) {
        console.error('Perplexity error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ============ ERROR HANDLING ============
app.use((err, req, res, next) => {
    console.error('❌ Server error:', err);
    res.status(500).json({ error: 'Internal server error', message: err.message });
});

// Start server
app.listen(PORT, () => {
    console.log(`\n🚀 UMenu Backend running on http://localhost:${PORT}`);
    console.log('\n📍 Available endpoints:');
    console.log('   GET  /api/health');
    console.log('   POST /api/users/create');
    console.log('   POST /api/users/preferences');
    console.log('   POST /api/users/location');
    console.log('   GET  /api/users/:userId');
    console.log('   POST /api/restaurants/search');
    console.log('   POST /api/favorites/add');
    console.log('   GET  /api/favorites/:userId');
    console.log('   GET  /api/favorites/check/:userId/:externalId');
    console.log('   DELETE /api/favorites/:favoriteId');
    console.log('   DELETE /api/favorites/user/:userId/external/:externalId');
    console.log('   PUT  /api/favorites/:favoriteId/mark-visited');
    console.log('   POST /api/insights\n');
});