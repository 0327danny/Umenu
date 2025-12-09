const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    unique: true
  },
  email:String,
  preferences: {
    allergies: [String],
    dietaryRestrictions: [String],
    healthGoals: [String],
    cuisinePreferences: [String]
  },
  location: {
  latitutde: Number,
  longitude: Number
  },
  searchRadius: {
    type: Number,
    default: 25
  },
  createdAt: {
  type: Date,
  default: Date.now
  },
  updatedAt: {
  type: Date,
  default: Date.now
  }
});
module.exports = mongoose.model('User', userSchema);
