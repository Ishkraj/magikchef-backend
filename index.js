const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
require('dotenv').config();


const Recipe = require('./models/recipe'); 

const app = express();
const PORT = process.env.PORT || 5000;

// ===========================================
// 👇 MIDDLEWARE (Ye SABSE PEHLE aana chahiye)
// ===========================================
app.use(cors({
  origin: ["https://magikchef-official.vercel.app", "https://magikchef.vercel.app"],
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));
app.use(express.json()); 
app.use(express.urlencoded({ extended: true })); // FormData texts ko support karne ke liye

// ===========================================
// 👇 CLOUDINARY & MULTER SETUP
// ===========================================
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'magikchef_recipes',
    allowed_formats: ['jpg', 'png', 'jpeg'],
  },
});
const upload = multer({ storage: storage });

// ===========================================
// 👇 DATABASE CONNECTION
// ===========================================
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected!'))
  .catch(err => console.log(err));

// ===========================================
// 👇 ROUTES
// ===========================================

// Auth Routes (Login/Register)
app.use('/api/auth', require('./routes/auth')); 

// 🔍 GET ALL RECIPES
app.get('/api/recipes', async (req, res) => {
  try {
    // 👇 YAHAN UPDATE KIYA HAI: 'email' ke sath 'username' bhi mangwaya hai
    const recipes = await mongoose.model('Recipe').find().populate('author', 'username email');
    res.json(recipes);
  } catch (err) {
    res.status(500).json({ msg: "Server Error", error: err.message });
  }
});


// 🛠️ ADD NEW RECIPE (Protected + Multiple Images) - ERROR CATCHER WALA ROUTE
app.post('/api/recipes', (req, res) => {
  
  // 1. Multer ko manually call kar rahe hain taaki error pakad sakein
  const uploadMiddleware = upload.array('images', 5);

  uploadMiddleware(req, res, async (err) => {
    // Agar Cloudinary ya image upload me koi bhi error aaya, toh yahan print hoga
    if (err) {
      return res.status(400).json({ msg: "Image Upload Failed", error: err.message });
    }

    try {
      
      const token = req.header('Authorization');
      if (!token) return res.status(401).json({ msg: 'Access Denied! Please Login first. 🛑' });

      const verified = jwt.verify(token, process.env.JWT_SECRET);
      const userId = verified.id || verified._id || verified.userId || (verified.user && verified.user.id);
      
      if (!userId) return res.status(400).json({ msg: "⚠️ User ID not found in token!" });

      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ msg: "⚠️ Images missing! Please upload photos." });
      }

      const { name, time, category, baseServings, rating, ingredients, steps } = req.body;
      const imageUrls = req.files.map(file => file.path);

      const Recipe = mongoose.model('Recipe');
      const newRecipe = new Recipe({
        name,
        time,
        category,
        baseServings,
        rating,
        image: imageUrls[0], // Pehli photo
        images: imageUrls,   // Saari photos
        ingredients: JSON.parse(ingredients),
        steps: JSON.parse(steps),
        author: userId 
      });

      await newRecipe.save();
      res.json({ msg: "✨ Recipe Added Successfully with Images to MagikChef! 📸", recipe: newRecipe });
    } catch (internalErr) {
      console.error("🚨 SERVER LOGIC ERROR:", internalErr);
      res.status(500).json({ msg: "Server Logic Error", error: internalErr.message });
    }
  });
});

const { GoogleGenerativeAI } = require('@google/generative-ai');

// AI MAGIC ROUTE 
app.post('/api/ai/magic-recipe', async (req, res) => {
  try {
    const { ingredients, servings } = req.body;
    
    if (!ingredients) {
      return res.status(400).json({ msg: "Please provide some ingredients!" });
    }

    // 🕵️‍♂️ NAYA KADAM: Google se available models ki list mangwa rahe hain
    const checkModels = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`);
    const modelsData = await checkModels.json();
    console.log("🟢 TUMHARE LIYE AVAILABLE MODELS:", modelsData.models.map(m => m.name));

    // Abhi ke liye ek safe default try kar rahe hain
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "models/gemini-2.5-flash" }); 

    // 🧠 PROMPT ENGINEERING UPDATE (Ingredients ko Objects bana diya)
    const prompt = `You are an expert Indian chef. I have these ingredients: ${ingredients}.
    Create a tasty recipe specifically for ${servings} people using mostly these ingredients.
    Return ONLY a raw JSON object (without markdown blocks like \`\`\`json) with this exact structure:
    {
    "ingredients": [
    { "name": "Aloo", "qty": "2", "unit": "cup", "sub": "" }
     ],
     "steps": ["Step 1 description", "Step 2 description"]
     }`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    const recipeData = JSON.parse(responseText);

    res.json({ msg: "Magic Recipe Generated! ✨", recipe: recipeData });

  } catch (err) {
    console.error("AI Error:", err);
    res.status(500).json({ msg: "AI fail ho gaya bhai", error: err.message });
  }
});

// ==========================================
// 🎙️ AI VOICE AGENT ROUTE (MagikChef JARVIS)
// ==========================================
app.post('/api/ai/voice-agent', async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ msg: "Bhai kuch toh bolo!" });
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    // gemini-2.5-flash sabse fast hai real-time voice ke liye
    const model = genAI.getGenerativeModel({ model: "models/gemini-2.5-flash" }); 

    const prompt = `You are an energetic and smart AI cooking assistant inside the 'MagikChef' app.
    The user just said: "${message}"

    Respond in Hinglish (Hindi written in English alphabet) with a very friendly tone. 
    Keep the response VERY SHORT (1-2 sentences max) because it will be spoken out loud by a voice engine. 

    If the user mentions they want to cook something or eat something (e.g., paneer, maggi, cake, breakfast), extract that main ingredient/dish and put it in 'searchQuery'. If it's just a general chat (like "hello"), leave 'searchQuery' empty.

    Return ONLY a raw JSON object (without markdown blocks like \`\`\`json) with this exact structure:
    {
      "reply": "Your short spoken hinglish response here",
      "searchQuery": "keyword to search or empty string"
    }`;

    const result = await model.generateContent(prompt);
    let responseText = result.response.text();
    
    let data;
    try {
      // 🔥 BULLETPROOF PARSING: AI ka extra kachra (markdown/text) saaf karo
      let cleanedText = responseText.replace(/```(json)?/gi, '').trim();
      
      const startIndex = cleanedText.indexOf('{');
      const endIndex = cleanedText.lastIndexOf('}');
      
      if (startIndex !== -1 && endIndex !== -1) {
          cleanedText = cleanedText.substring(startIndex, endIndex + 1);
      }
      
      data = JSON.parse(cleanedText);
      
    } catch (parseError) {
      console.error("AI JSON Parse Error:", parseError);
      console.error("Raw AI Text:", responseText); 
      
      // Agar JSON fass jaye, toh 500 error rokne ke liye default data bhej do
      data = {
          reply: "Bhai, mujhe theek se samajh nahi aaya. Kya aap wapas bol sakte ho?",
          searchQuery: ""
      };
    }

    res.json({ msg: "Agent responded! 🤖", data });

  } catch (err) {
    console.error("Voice Agent Error:", err);
    res.status(500).json({ msg: "Voice Agent server error", error: err.message });
  }
});
// ==========================================
// 🔍 GET SINGLE RECIPE BY ID
// ==========================================
app.get('/api/recipes/:id', async (req, res) => {
  try {
    const recipe = await Recipe.findById(req.params.id)
      .populate('author', 'username email') 
      .populate('comments.user', 'username email'); 

    if (!recipe) return res.status(404).json({ msg: "Recipe not found!" });
    res.json(recipe);
  } catch (err) {
    res.status(500).json({ msg: "Server Error", error: err.message });
  }
});

// ==========================================
// 🌟 SOCIAL FEATURES ROUTES (Profile & Follow)
// ==========================================
app.get('/api/profile/:userId', async (req, res) => {
  try {
    const user = await mongoose.model('User')
      .findById(req.params.userId)
      .select('-password')
      .populate('followers', 'email username')
      .populate('following', 'email username');

    if (!user) return res.status(404).json({ msg: "User not found!" });

    const userRecipes = await Recipe.find({ author: req.params.userId });
    res.json({ user, recipes: userRecipes });
  } catch (err) {
    res.status(500).json({ msg: "Profile fetch error", error: err.message });
  }
});

app.post('/api/follow/:targetUserId', async (req, res) => {
  try {
    let token = req.header('Authorization');
    if (!token) return res.status(401).json({ msg: 'Please Login to follow someone! 🛑' });

    if (token.startsWith('Bearer ')) {
      token = token.split(' ')[1];
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const myId = decoded.id || decoded._id || decoded.userId || (decoded.user && decoded.user.id);
    
    const User = mongoose.model('User');
    const currentUser = await User.findById(myId); 
    const targetUser = await User.findById(req.params.targetUserId);

    if (!currentUser || !targetUser) {
      return res.status(404).json({ msg: "User not found!" });
    }

    if (currentUser._id.toString() === targetUser._id.toString()) {
      return res.status(400).json({ msg: "You cannot follow yourself! 😅" });
    }

    const isFollowing = currentUser.following && currentUser.following.some(id => id.toString() === targetUser._id.toString());

    if (isFollowing) {
      // ❌ Unfollow Logic (Direct DB update, ignores username validation)
      await User.findByIdAndUpdate(myId, { $pull: { following: targetUser._id } });
      await User.findByIdAndUpdate(targetUser._id, { $pull: { followers: myId } });
    } else {
      // ✅ Follow Logic (Direct DB update)
      await User.findByIdAndUpdate(myId, { $push: { following: targetUser._id } });
      await User.findByIdAndUpdate(targetUser._id, { $push: { followers: myId } });
    }
    
    res.json({ msg: "Follow status updated successfully! ✅" });
  } catch (err) {
    console.error("Backend Follow Error:", err);
    res.status(500).json({ msg: "Follow action failed", error: err.message });
  }
});

// ==========================================
// ❤️ LIKE & 💬 COMMENT ROUTES
// ==========================================
app.post('/api/recipes/:id/like', async (req, res) => {
  try {
    const token = req.header('Authorization');
    if (!token) return res.status(401).json({ msg: 'Please Login to like!' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.id || decoded._id || decoded.userId || (decoded.user && decoded.user.id);

    const recipe = await Recipe.findById(req.params.id);
    if (!recipe) return res.status(404).json({ msg: "Recipe not found" });

    const isLiked = recipe.likes.includes(userId);
    if (isLiked) {
      recipe.likes.pull(userId); 
    } else {
      recipe.likes.push(userId); 
    }

    await recipe.save();
    res.json({ msg: isLiked ? "Unliked" : "Liked ❤️", likes: recipe.likes });
  } catch (err) {
    res.status(500).json({ msg: "Server Error", error: err.message });
  }
});

app.post('/api/recipes/:id/comment', async (req, res) => {
  try {
    const token = req.header('Authorization');
    if (!token) return res.status(401).json({ msg: 'Please Login to comment!' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.id || decoded._id || decoded.userId || (decoded.user && decoded.user.id);

    const recipe = await Recipe.findById(req.params.id);
    if (!recipe) return res.status(404).json({ msg: "Recipe not found" });

    const { text, rating } = req.body;
    if (!text) return res.status(400).json({ msg: "Comment text is required!" });
    if (!rating || rating < 1 || rating > 5) return res.status(400).json({ msg: "Please provide a rating between 1 and 5! ⭐️" });

    const newComment = { user: userId, text: text, rating: Number(rating) };
    recipe.comments.push(newComment);

    const totalRatingsSum = recipe.comments.reduce((sum, item) => sum + (item.rating || 0), 0);
    recipe.rating = (totalRatingsSum / recipe.comments.length).toFixed(1);

    await recipe.save();
    res.json({ msg: "Review & Rating added! 💬⭐️", comments: recipe.comments, rating: recipe.rating });
  } catch (err) {
    res.status(500).json({ msg: "Server Error", error: err.message });
  }
});

app.delete('/api/recipes/:id/comment/:commentId', async (req, res) => {
  try {
    const token = req.header('Authorization');
    if (!token) return res.status(401).json({ msg: 'Please Login to delete!' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.id || decoded._id || decoded.userId || (decoded.user && decoded.user.id);

    const recipe = await Recipe.findById(req.params.id);
    if (!recipe) return res.status(404).json({ msg: "Recipe not found" });

    const comment = recipe.comments.find(c => c._id.toString() === req.params.commentId);
    if (!comment) return res.status(404).json({ msg: "Comment not found" });

    const isCommentOwner = comment.user && comment.user.toString() === String(userId);
    const isRecipeOwner = recipe.author && recipe.author.toString() === String(userId);

    if (!isCommentOwner && !isRecipeOwner) {
      return res.status(401).json({ msg: "Not authorized to delete this comment! 🛑" });
    }

    recipe.comments = recipe.comments.filter(c => c._id.toString() !== req.params.commentId);

    if (recipe.comments.length > 0) {
      const totalRatingsSum = recipe.comments.reduce((sum, item) => sum + (Number(item.rating) || 5), 0);
      recipe.rating = (totalRatingsSum / recipe.comments.length).toFixed(1);
    } else {
      recipe.rating = 0; 
    }

    await recipe.save();
    res.json({ msg: "Comment deleted! 🗑️", comments: recipe.comments, rating: recipe.rating });
  } catch (err) {
    res.status(500).json({ msg: "Server Error", error: err.message });
  }
});

// Seed Route (Dummy Data)
app.get('/seed', async (req, res) => {
    res.send("Seed route working");
});

app.listen(PORT, () => {
  console.log(`Server is running on ${PORT} 🚀`);
});
module.exports = app;