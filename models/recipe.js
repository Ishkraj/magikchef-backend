const mongoose = require('mongoose');

const recipeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  image: {
    type: String, // Hum image ka URL store karenge
    required: true,
  },
  images: [{ type: String }],
  time: {
    type: Number, // Minutes mein (e.g., 30)
    required: true,
  },
  calories: {
    type: Number, // Optional health feature ke liye
  },
  baseServings: {
    type: Number, // Isse hum math lagayenge (Default: 4 people)
    default: 4,
  },
  ingredients: [
    {
      name: { type: String, required: true },
      // 👇 'Number' ki jagah 'String' karo, aur 'required: true' HATA do
      qty: { type: String }, 
      unit: { type: String },
      sub: { type: String }
    }
  ],
  steps: [
    {
      type: String, // Step instructions
      required: true
    }
  ],
  category: {
    type: String, // Breakfast, Lunch, Dinner, Snack
    required: true
  },
  diet: { 
    type: String 
  },
  rating: {
    type: Number,
    required: true,
    default: 5
  },
  author: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  },
  likes: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  }],
  comments: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    text: { type: String, required: true },
    rating: { type: Number, default: 5 },
    date: { type: Date, default: Date.now }
  }],
  rating: { type: Number, default: 0 },
});

const Recipe = mongoose.model('Recipe', recipeSchema);
module.exports = Recipe;