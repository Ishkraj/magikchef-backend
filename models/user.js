const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
  },

  username: { 
    type: String, 
    required: true, 
    unique: true 
  },
  
  password: {
    type: String,
    required: true,
  },
  otp: {
    type: String, // Yahan hum temporary OTP store karenge
  },
  isVerified: {
    type: Boolean,
    default: false, // Jab tak OTP verify nahi hoga, ye false rahega
  },
  followers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  following: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
});

const User = mongoose.model('User', userSchema);
module.exports = User;

