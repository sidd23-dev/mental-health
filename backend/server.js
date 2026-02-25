const express = require('express');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const User = require('./models/user'); 
const Doctor = require('./models/doctor'); 
const doctorProfileRouter = require('./routes/doctorprofile');
const Slot = require('./models/slot');

require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();

// --- MIDDLEWARE ---
app.use(express.json({ limit: '50mb' }));
app.use(cors());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/api/doctor-profile', doctorProfileRouter);

if (!fs.existsSync('./uploads')) fs.mkdirSync('./uploads');

// --- DATABASE ---
mongoose.connect('mongodb://127.0.0.1:27017/aiHealDB')
    .then(() => console.log("✅ MongoDB Connected"))
    .catch(err => console.error("❌ MongoDB Error:", err));

    // Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ 
    model: "gemini-2.5-flash",
    systemInstruction: `You are the CareConnect AI Support. 
    Your mission is to help patients with stress, anxiety, and depression.
    - If a user feels anxious, suggest the 5-4-3-2-1 grounding or 4-7-8 breathing.
    - If a user feels stressed, suggest box breathing.
    - Always be empathetic and clear.
    - Disclaimer: State you are an AI assistant, not a doctor.`
});

// --- STORAGE ---
const storage = multer.diskStorage({
    destination: './uploads/',
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// --- EMAIL ---
// --- EMAIL ---
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { 
        user: 'mentaalhealth2025@gmail.com', 
        pass: 'kuwf pqpg bhxr kadx' 
    },
    tls: {
       
        rejectUnauthorized: false
    }
});

// --- USER ROUTES ---

app.post('/api/signup', upload.single('photo'), async (req, res) => {
    try {
        const { email } = req.body;
        // Generate a 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        
        // 1. Check if a VERIFIED user already exists
        let user = await User.findOne({ email });
        if (user && user.isVerified) {
            return res.status(400).json({ 
                success: false, 
                message: "Email already registered." 
            });
        }

        // 2. Prepare ALL data from the registration form
        const userData = {
            ...req.body, 
            otp: otp,
            isVerified: false,
            // If a file is uploaded, use its path; otherwise keep existing or empty
            photo: req.file ? req.file.path : (user ? user.photo : '')
        };

        // 3. Use findOneAndUpdate with 'upsert'
        // This saves the user and the OTP to the database BEFORE sending the email
        await User.findOneAndUpdate({ email }, userData, { upsert: true, new: true });

        // 4. Send the OTP email using the transporter
        // NOTE: Ensure your transporter has 'rejectUnauthorized: false' as shown below
        await transporter.sendMail({
            from: '"Mental Health Support" <mentaalhealth2025@gmail.com>',
            to: email,
            subject: "Your Verification Code",
            text: `Your OTP is: ${otp}`
        });

        res.status(200).json({ success: true, message: "OTP Sent" });

    } catch (err) {
        console.error("Signup Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/verify-otp', async (req, res) => {
    const { email, otp } = req.body;
    const user = await User.findOne({ email, otp });
    if (user) {
        user.isVerified = true;
        user.otp = "";
        await user.save();
        res.json({ success: true });
    } else {
        res.status(400).json({ success: false, message: "Invalid OTP" });
    }
});

app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    // We find the user and send back ALL their data fields
    const user = await User.findOne({ email, password, isVerified: true });
    if (user) {
        res.json({ success: true, user }); // This 'user' object now contains all fields
    } else {
        res.status(401).json({ success: false, message: "Invalid credentials or unverified account." });
    }
});

// Patient Profile Update Route ---

// --- Patient Profile Update with FULL Support ---
// --- Patient Profile Update (Also apply similar logic to Doctor Update) ---
app.put('/api/patient/update', upload.single('photo'), async (req, res) => {
    try {
        // Multer handles the parsing. If it's missing, req.body will be undefined.
        if (!req.body) {
            return res.status(400).json({ success: false, message: "No data received" });
        }

        const { email } = req.body; // Now req.body should be populated
        
        if (!email) {
            return res.status(400).json({ success: false, message: "Email is required to update profile" });
        }

        let updateData = { ...req.body };

        if (req.file) {
            updateData.photo = req.file.path;
        }

        const updatedUser = await User.findOneAndUpdate(
            { email: email },
            updateData,
            { new: true } 
        );

        res.json({ success: true, user: updatedUser });
    } catch (err) {
        console.error("Update Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});
// --- AI CHAT ROUTE ---
app.post('/api/ai/support', async (req, res) => {
    try {
        const { message } = req.body;
        if (!message) return res.status(400).json({ success: false, message: "No message sent" });

        const result = await model.generateContent(message);
        const response = await result.response;
        const text = response.text();

        res.json({ success: true, reply: text });
    } catch (error) {
        console.error("AI Error:", error);
        res.status(500).json({ success: false, message: "AI is offline. Please try again." });
    }
});

// --- DOCTOR & ADMIN LOGIC ---

app.post('/api/doctor/signup', upload.fields([
    { name: 'photo', maxCount: 1 },
    { name: 'certificate', maxCount: 1 }
]), async (req, res) => {
    try {
        const { email } = req.body;
        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        const docData = { 
            ...req.body, 
            otp, 
            isVerified: false, 
            status: 'pending',
            photo: req.files['photo'] ? req.files['photo'][0].path : "",
            certificate: req.files['certificate'] ? req.files['certificate'][0].path : "" 
        };

        await Doctor.findOneAndUpdate({ email }, docData, { upsert: true, new: true });
        
        // --- ADD THIS TO SEND THE EMAIL ---
        await transporter.sendMail({
            from: '"Mental Health Supporter" <mentaalhealth2025@gmail.com>',
            to: email,
            subject: "Doctor Verification Code",
            text: `Your OTP for  registration is: ${otp}`
        });

        res.json({ success: true, message: "OTP Sent" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Error in Signup" });
    }
});


// handle Doctor verification
app.post('/api/doctor/verify-otp', async (req, res) => {
    const { email, otp } = req.body;
    try {
        // We MUST search the Doctor model now
        const doctor = await Doctor.findOne({ email, otp });
        
        if (doctor) {
            doctor.isVerified = true;
            doctor.otp = ""; // Clear OTP
            await doctor.save();
            res.json({ success: true, message: "Doctor verified successfully!" });
        } else {
            // This happens if the email/OTP combo isn't in the Doctor collection
            res.status(400).json({ success: false, message: "Invalid OTP or Email" });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: "Server error during verification" });
    }
});
// 3. Doctor Login
app.post('/api/doctor/login', async (req, res) => {
    const { email, password } = req.body;
    const doc = await Doctor.findOne({ email, password, isVerified: true });

    if (!doc) return res.status(401).json({ success: false, message: "Invalid credentials." });
    
    if (doc.status === 'pending') return res.status(403).json({ success: false, message: "Account pending admin approval." });
    if (doc.status === 'rejected') return res.status(403).json({ success: false, message: "Account access rejected by admin." });

    res.json({ success: true, doctor: doc });
});

//slot routes//
app.post('/api/doctor/add-slot', async (req, res) => {
    try {
        const newSlot = new Slot(req.body);
        await newSlot.save();
        res.json({ success: true, message: "Slot Added" }); // This triggers the 'data.success' in JS
    } catch (err) {
        res.status(500).json({ success: false, message: "Database error" });
    }
});


// Route to get all doctors for the patient to see
// server.js - Update this route
app.get('/api/patient/available-doctors', async (req, res) => {
    try {
        // Change the query to allow both 'approved' and 'online' statuses
        const doctors = await Doctor.find({ 
            isVerified: true, 
            status: { $in: ['approved', 'online'] } 
        });
        res.json(doctors);
    } catch (err) {
        res.status(500).json({ success: false });
    }
});
app.get('/api/doctor/availability/:email', async (req, res) => {
    try {
        // Find all available slots for this doctor
        // To show only the LATEST entry: .sort({ createdAt: -1 }).limit(1)
        const slots = await Slot.find({ 
            doctorEmail: req.params.email, 
            status: 'available' 
        }).sort({ createdAt: -1 });

        if (!slots || slots.length === 0) return res.json([]);

        // We will process the most recent slot entry
        const latestSlot = slots[0];

        const splitIntoHalfHourSlots = (startTime, endTime) => {
            let intervals = [];
            let start = new Date(`2000/01/01 ${startTime}`);
            let end = new Date(`2000/01/01 ${endTime}`);
            
            if (end < start) end.setDate(end.getDate() + 1); // Handle overnight

            while (start < end) {
                let next = new Date(start.getTime() + 30 * 60000);
                if (next > end) break;
                
                intervals.push({
                    start: start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }),
                    end: next.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })
                });
                start = next;
            }
            return intervals;
        };

        const subSlots = splitIntoHalfHourSlots(latestSlot.startTime, latestSlot.endTime);
        const processed = subSlots.map(sub => ({
            _id: latestSlot._id,
            date: latestSlot.date,
            displayTime: `${sub.start} - ${sub.end}`,
            startTime: sub.start
        }));

        res.json(processed);
    } catch (err) {
        res.status(500).json({ success: false });
    }
});
// --- ADMIN LOGIN ROUTE ---
app.post('/api/admin/login', (req, res) => {
    const { adminId, email, password } = req.body;

    // Check if the provided credentials match the hardcoded ones
    if (
        adminId === ADMIN_CREDENTIALS.adminId &&
        email === ADMIN_CREDENTIALS.email &&
        password === ADMIN_CREDENTIALS.password
    ) {
        // Successful login
        res.json({
            success: true,
            message: "Admin access granted",
            email: email,
            token: "admin-session-secure-token" // You can use a real JWT here later
        });
    } else {
        // Failed login
        res.status(401).json({
            success: false,
            message: "Invalid Admin ID, Email, or Password."
        });
    }
});

// 4. Admin Dashboard
-
app.get('/api/admin/pending-doctors', async (req, res) => {
    try {
        // Fetch all doctors who have verified their email, regardless of approval status
        const doctors = await Doctor.find({ isVerified: true });
        res.json(doctors);
    } catch (err) {
        res.status(500).json({ success: false, message: "Error fetching data" });
    }
});

app.post('/api/admin/approve', async (req, res) => {
    const { email, status } = req.body; 
    try {
        await Doctor.findOneAndUpdate({ email }, { status });
        res.json({ success: true, message: `Doctor ${status}` });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});


// --- BOOKING LOGIC ---
app.post('/api/bookings/create', async (req, res) => {
    try {
        const { slotId, patientEmail, timeSlot } = req.body;

        // Find the slot and update its status
        // Note: In a complex app, you'd create a separate 'Booking' model, 
        // but for now, we update the Slot status.
        const updatedSlot = await Slot.findByIdAndUpdate(slotId, {
            status: 'booked',
            patientEmail: patientEmail // You might need to add this field to your Slot Schema
        }, { new: true });

        if (!updatedSlot) {
            return res.status(404).json({ success: false, message: "Slot not found" });
        }

        

        res.json({ success: true, message: "Slot reserved successfully" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Server error during booking" });
    }
});

// 5. Doctor Profile Fetch
app.get('/api/doctor/profile/:email', async (req, res) => {
    try {
        const doc = await Doctor.findOne({ email: req.params.email });
        res.json(doc);
    } catch (err) {
        res.status(404).json({ message: "Doctor not found" });
    }
});

// 6. Consolidated Doctor Profile Update (Crucial Fix)
app.put('/api/doctor/update', upload.single('photo'), async (req, res) => {
    try {
        const { email } = req.body;
        let updateData = { ...req.body };

        // If a new photo was uploaded, update the path
        if (req.file) {
            updateData.photo = req.file.path;
        }

        const updatedDoctor = await Doctor.findOneAndUpdate(
            { email: email }, 
            updateData, 
            { new: true } 
        );

        if (!updatedDoctor) return res.status(404).json({ success: false, message: "Doctor not found" });

        res.json({ success: true, message: "Profile updated successfully", doctor: updatedDoctor });
        
    } catch (err) {
        console.error("Update Error:", err);
        res.status(500).json({ success: false, message: "Server error during update" });
    }
});

app.put('/api/doctor/status', async (req, res) => {
    try {
        const { email, isOnline } = req.body;
        // This updates the status field in your MongoDB
        await Doctor.findOneAndUpdate({ email }, { 
            status: isOnline ? 'online' : 'approved' 
        });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

app.listen(5000, () => console.log(`🚀 Server running on http://127.0.0.1:5000`));