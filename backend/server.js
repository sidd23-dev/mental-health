// Load environment variables
require('dotenv').config();

const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 5000;

console.log('ENV EMAIL_USER =', process.env.EMAIL_USER);
console.log('ENV EMAIL_PASS =', process.env.EMAIL_PASS ? 'LOADED' : 'MISSING');

// Middleware
app.use(cors());
app.use(bodyParser.json());

// In-memory storage
// usersDB[email] = { firstName, lastName, email, password, isVerified, createdAt }
const usersDB = {};
// otpStore[email] = { otp, expiresAt }
const otpStore = {};

// Generate 6-digit OTP
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Nodemailer Gmail transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    tls: {
        rejectUnauthorized: false
    }
});

// Test route
app.get('/', (req, res) => {
    res.json({ message: 'Backend running' });
});

// ========== SIGNUP + OTP FLOW ==========

// 1) START SIGNUP: save user as unverified + send OTP
app.post('/api/patient/signup', async (req, res) => {
    const { firstName, lastName, email, password } = req.body;

    if (!firstName || !lastName || !email || !password) {
        return res.status(400).json({ message: 'All fields are required' });
    }

    // If already verified user exists
    if (usersDB[email] && usersDB[email].isVerified) {
        return res.status(400).json({ message: 'Email already registered and verified. Please login.' });
    }

    // Save or overwrite as unverified
    usersDB[email] = {
        firstName,
        lastName,
        email,
        password,          // plain for demo; use bcrypt in real apps [web:134]
        isVerified: false,
        createdAt: new Date()
    };

    // Generate OTP
    const otp = generateOTP();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes
    otpStore[email] = { otp, expiresAt };

    try {
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Signup OTP - Mental Health App',
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; background: #f4f4f4;">
                    <div style="max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px;">
                        <h2 style="color: #2d5a27;">Verify Your Email</h2>
                        <p>Hello ${firstName},</p>
                        <p>Your OTP for account verification is:</p>
                        <h1 style="background: #2d5a27; color: white; padding: 15px; text-align: center; border-radius: 8px; letter-spacing: 5px;">
                            ${otp}
                        </h1>
                        <p style="color: #666;">This OTP will expire in 10 minutes.</p>
                    </div>
                </div>
            `
        };

        await transporter.sendMail(mailOptions); // [web:58][web:125]

        console.log(`Signup OTP sent to ${email}: ${otp}`);
        return res.json({
            success: true,
            message: 'Account created. OTP sent to your email. Please verify.'
        });
    } catch (error) {
        console.error('Error sending signup OTP:', error);
        return res.status(500).json({ message: 'Failed to send OTP. Please try again.' });
    }
});

// 2) VERIFY SIGNUP OTP
app.post('/api/patient/verify-signup-otp', (req, res) => {
    const { email, otp } = req.body;

    if (!email || !otp) {
        return res.status(400).json({ message: 'Email and OTP are required' });
    }

    const user = usersDB[email];
    if (!user) {
        return res.status(400).json({ message: 'User not found. Please sign up again.' });
    }

    const storedOTP = otpStore[email];
    if (!storedOTP) {
        return res.status(400).json({ message: 'No OTP found. Please sign up again.' });
    }

    if (Date.now() > storedOTP.expiresAt) {
        delete otpStore[email];
        return res.status(400).json({ message: 'OTP expired. Please sign up again.' });
    }

    if (storedOTP.otp !== otp) {
        return res.status(400).json({ message: 'Invalid OTP.' });
    }

    // OTP correct → verify account
    user.isVerified = true;
    delete otpStore[email];

    console.log('User verified:', email);
    return res.json({
        success: true,
        message: 'Email verified successfully! You can now login.'
    });
});

// ========== LOGIN (NO OTP) ==========

// 3) NORMAL LOGIN: email + password only, must be verified
app.post('/api/patient/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required' });
    }

    const user = usersDB[email];
    if (!user) {
        return res.status(400).json({ message: 'Invalid email or password' });
    }

    if (!user.isVerified) {
        return res.status(400).json({ message: 'Email not verified. Please complete signup.' });
    }

    if (user.password !== password) {
        return res.status(400).json({ message: 'Invalid email or password' });
    }

    const token = Buffer.from(`${email}:${Date.now()}`).toString('base64');

    console.log('User logged in:', email);
    return res.json({
        success: true,
        message: 'Login successful!',
        token,
        name: `${user.firstName} ${user.lastName}`,
        email
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
});
