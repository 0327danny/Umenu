const mongoose = require('mongoose');

const restaurantSchema = new mongoose.Schema({
    externalId: {
        type: String,
        required: true,
        unique: true
    },
    name: {
        type: String,
        required: true,
        index: true
    },
    latitude: {
        type: Number,
        required: true
    },
    longitude: {
        type: Number,
        required: true
    },
    rating: {
        type: Number,
        default: 0
    },
    reviewCount: {
        type: Number,
        default: 0
    },
    address: String,
    source: {
        type: String,
        enum: ['google_places', 'yelp'],
        required: true
    },
    dietaryOptions: [String],
    description: String,
    phone: String,
    website: String,
    hours: String,
    priceLevel: String,
    imageUrl: String,
    lastUpdated: {
        type: Date,
        default: Date.now
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Index for geospatial queries
restaurantSchema.index({ latitude: 1, longitude: 1 });
restaurantSchema.index({ name: 'text', address: 'text' });

module.exports = mongoose.model('Restaurant', restaurantSchema);