// Load environment variables
require('dotenv').config();

const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 5000;

// Debug: show env loaded
console.log('ENV EMAIL_USER =', process.env.EMAIL_USER);
console.log('ENV EMAIL_PASS =', process.env.EMAIL_PASS ? 'LOADED' : 'MISSING');

// Middleware
app.use(cors());
app.use(bodyParser.json());

// In-memory storage (for learning only)
const otpStore = {};  // { email: { otp, expiresAt } }
const usersDB = {};   // { email: { firstName, lastName, password, createdAt } }

// Generate 6-digit OTP
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Nodemailer Gmail transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,  // from .env
        pass: process.env.EMAIL_PASS   // from .env
    },
    tls: {
        rejectUnauthorized: false
    }
});

// Test route
app.get('/', (req, res) => {
    res.json({ message: 'Backend running' });
});

// ========== PATIENT ROUTES ==========

// SIGNUP
app.post('/api/patient/signup', (req, res) => {
    const { firstName, lastName, email, password } = req.body;

    if (!firstName || !lastName || !email || !password) {
        return res.status(400).json({ message: 'All fields are required' });
    }

    if (usersDB[email]) {
        return res.status(400).json({ message: 'Email already registered' });
    }

    usersDB[email] = {
        firstName,
        lastName,
        password,
        createdAt: new Date()
    };

    console.log('New user registered:', email);
    return res.json({
        success: true,
        message: 'Account created successfully!'
    });
});

// SEND OTP FOR LOGIN (must match frontend URL)
app.post('/api/patient/send-otp', async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ message: 'Email is required' });
    }

    if (!usersDB[email]) {
        return res.status(400).json({ message: 'Email not registered. Please sign up first.' });
    }

    try {
        const otp = generateOTP();
        const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

        otpStore[email] = { otp, expiresAt };

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Your Login OTP - Mental Health App',
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; background: #f4f4f4;">
                    <div style="max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px;">
                        <h2 style="color: #2d5a27;">Mental Health App - Login OTP</h2>
                        <p>Hello ${usersDB[email].firstName},</p>
                        <p>Your One-Time Password (OTP) for login is:</p>
                        <h1 style="background: #2d5a27; color: white; padding: 15px; text-align: center; border-radius: 8px; letter-spacing: 5px;">
                            ${otp}
                        </h1>
                        <p style="color: #666;">This OTP will expire in 10 minutes.</p>
                        <p style="color: #666;">If you didn't request this, please ignore this email.</p>
                    </div>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);  // send email [web:58]

        console.log(`OTP sent to ${email}: ${otp}`);
        return res.json({ success: true, message: 'OTP sent to your email!' });
    } catch (error) {
        console.error('Error sending OTP:', error);
        return res.status(500).json({ message: 'Failed to send OTP. Please try again.' });
    }
});

// LOGIN WITH EMAIL + PASSWORD + OTP
app.post('/api/patient/login', (req, res) => {
    const { email, password, otp } = req.body;

    if (!email || !password || !otp) {
        return res.status(400).json({ message: 'Email, password, and OTP are required' });
    }

    if (!usersDB[email]) {
        return res.status(400).json({ message: 'Invalid credentials' });
    }

    if (usersDB[email].password !== password) {
        return res.status(400).json({ message: 'Invalid credentials' });
    }

    const storedOTP = otpStore[email];
    if (!storedOTP) {
        return res.status(400).json({ message: 'OTP not found. Please request a new one.' });
    }

    if (Date.now() > storedOTP.expiresAt) {
        delete otpStore[email];
        return res.status(400).json({ message: 'OTP expired. Please request a new one.' });
    }

    if (storedOTP.otp !== otp) {
        return res.status(400).json({ message: 'Invalid OTP' });
    }

    delete otpStore[email];

    const token = Buffer.from(`${email}:${Date.now()}`).toString('base64');

    console.log('User logged in:', email);
    return res.json({
        success: true,
        message: 'Login successful!',
        token,
        name: `${usersDB[email].firstName} ${usersDB[email].lastName}`,
        email
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
});
