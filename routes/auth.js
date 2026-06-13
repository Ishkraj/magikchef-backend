const express = require('express');
const router = express.Router();
const User = require('../models/user'); // ⚠️ Dhyan rakhna model/User.js me 'username' add kar liya ho!
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const randomstring = require('randomstring');
require('dotenv').config();

// 1. Email Sender Setup (Nodemailer)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// 2. REGISTER ROUTE (Ab Username bhi lega -> OTP bhejega)
router.post('/register', async (req, res) => {
  const { username, email, password } = req.body; // 👉 username add kiya

  try {
    // Check agar username ya email pehle se hai
    let user = await User.findOne({ $or: [{ email }, { username }] });
    
    if (user && user.isVerified) {
      return res.status(400).json({ msg: 'The username or email is already in use' });
    }

    // Agar user verify nahi hai, toh purana delete karke naya banao
    if (user && !user.isVerified) {
      await User.deleteOne({ _id: user._id });
    }

    // OTP & Password Hash Generate karo
    const otp = randomstring.generate({ length: 6, charset: 'numeric' });
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Naya user banao
    user = new User({
      username, // 👉 DB me save kiya
      email,
      password: hashedPassword,
      otp 
    });

    await user.save();

    // Email Bhejo
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'MagikChef - Your Verification OTP',
      text: `Welcome to MagikChef ${username}! 🍳\n\nYour OTP is: ${otp}\n\nDo not share this with anyone.`
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        return res.status(500).json({ msg: 'Error sending email' });
      } else {
        res.json({ msg: 'OTP sent to your email! Check inbox.' });
      }
    });

  } catch (err) {
    res.status(500).send('Server Error');
  }
});

// 3. VERIFY OTP ROUTE (OTP lega -> Login Token dega)
router.post('/verify-otp', async (req, res) => {
  const { email, otp } = req.body;

  try {
    const user = await User.findOne({ email });

    if (!user) return res.status(400).json({ msg: 'User not found' });
    if (user.otp !== otp) return res.status(400).json({ msg: 'Invalid OTP' });

    // Verify Success
    user.isVerified = true;
    user.otp = null; 
    await user.save();

    // Token Generate (7 din ke liye taaki jaldi expire na ho)
    const payload = { userId: user._id };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.json({ token, msg: 'Login Successful! 🚀', user: { username: user.username, email: user.email } });

  } catch (err) {
    res.status(500).send('Server Error');
  }
});

// 4. DUAL LOGIN (Username YA Email kisi se bhi login)
router.post('/login', async (req, res) => {
  const { identifier, password } = req.body; // 👉 email ki jagah 'identifier'
  try {
    // 🕵️‍♂️ Dono me search karega
    const user = await User.findOne({ 
      $or: [{ email: identifier }, { username: identifier }] 
    });
    
    if (!user) return res.status(400).json({ msg: 'User not found!' });
    if (!user.isVerified) return res.status(400).json({ msg: 'Please verify your email first' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ msg: 'Invalid Password' });

    const payload = { userId: user._id };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.json({ token, msg: 'Welcome Back!', user: { username: user.username, email: user.email } });
  } catch (err) {
    res.status(500).send('Server Error');
  }
});

// 5. NAYA: FORGOT PASSWORD ROUTE (Email par OTP bhejega)
router.post('/forgot-password', async (req, res) => {
  const { identifier } = req.body; // Username ya email
  try {
    const user = await User.findOne({ 
      $or: [{ email: identifier }, { username: identifier }] 
    });

    if (!user) return res.status(404).json({ msg: "Account not found." });

    const otp = randomstring.generate({ length: 6, charset: 'numeric' });
    user.otp = otp;
    await user.save();

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: user.email,
      subject: 'MagikChef - Password Reset OTP',
      text: `Hi ${user.username}, \n\nYour OTP to reset password is: ${otp}\n\nDo not share this with anyone.`
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) return res.status(500).json({ msg: 'Error sending email' });
      res.json({ msg: 'Password reset OTP sent to your email' });
    });
  } catch (err) {
    res.status(500).send('Server Error');
  }
});

// 6. RESET PASSWORD ROUTE (OTP verify karega aur naya password save karega)
router.post('/reset-password', async (req, res) => {
  const { identifier, otp, newPassword } = req.body;
  
  try {
    const user = await User.findOne({ 
      $or: [{ email: identifier }, { username: identifier }] 
    });

    if (!user) return res.status(404).json({ msg: "Account not found." });
    if (user.otp !== otp) return res.status(400).json({ msg: "Wrong OTP!" });

    // Naya password hash karo
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    user.otp = null; // OTP use ho gaya toh delete kar do
    await user.save();

    res.json({ msg: "Password is Update successfuly!" });
  } catch (err) {
    res.status(500).send('Server Error');
  }
});

module.exports = router;