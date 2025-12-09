const mongoose = require('mongoose');

const favoriteSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        index: true
    },
    restaurantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Restaurant'
    },
    externalId: {
        type: String,
        required: true
    },
    restaurantName: {
        type: String,
        required: true
    },
    source: {
        type: String,
        enum: ['google_places', 'yelp'],
        default: 'google_places'
    },
    latitude: Number,
    longitude: Number,
    rating: Number,
    address: String,
    notes: String,
    visitedDate: Date,
    visited: {
        type: Boolean,
        default: false
    },
    savedAt: {
        type: Date,
        default: Date.now,
        index: true
    }
});

// Prevent duplicate favorites for same user and restaurant
favoriteSchema.index({ userId: 1, externalId: 1 }, { unique: true });

module.exports = mongoose.model('Favorite', favoriteSchema);