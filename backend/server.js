const express = require('express');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createOrder } = require('./services/razorpay');
const { createZoomMeeting, endZoomMeeting } = require('./services/zoom');
const User = require('./models/user');
const Doctor = require('./models/doctor');
const doctorProfileRouter = require('./routes/doctorprofile');
const Slot = require('./models/slot');
const Appointment = require('./models/appointment'); // Import Appointment model
const Message = require('./models/message'); // Import Message model

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
    .then(() => console.log("✅¦ MongoDB Connected"))
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

app.put('/api/doctor/profile/:email', upload.single('photo'), async (req, res) => {
    try {
        const { email } = req.params;
        const updateData = req.body;

        if (req.file) {
            updateData.photo = req.file.path;
        }

        // Remove _id from updateData if it exists to prevent Mongo errors
        delete updateData._id;

        const updatedDoc = await Doctor.findOneAndUpdate(
            { email: email },
            updateData,
            { new: true }
        );

        if (!updatedDoc) {
            return res.status(404).json({ success: false, message: "Doctor not found." });
        }

        res.json({ success: true, doctor: updatedDoc });
    } catch (err) {
        console.error("Doctor Profile Update Error:", err);
        res.status(500).json({ success: false, message: "Failed to update profile." });
    }
});

//slot routes//
app.post('/api/doctor/add-slot', async (req, res) => {
    try {
        const { doctorEmail } = req.body;

        // Remove any existing available slots for THIS doctor before adding a new one.
        // This ensures each doctor only ever has their OWN current slot, preventing
        // stale slots from appearing on newly created accounts.
        if (doctorEmail) {
            await Slot.deleteMany({ doctorEmail: doctorEmail, status: 'available' });
        }

        const newSlot = new Slot(req.body);
        await newSlot.save();
        res.json({ success: true, message: "Slot Added" });
    } catch (err) {
        res.status(500).json({ success: false, message: "Database error" });
    }
});

app.delete('/api/doctor/slot/:id', async (req, res) => {
    try {
        await Slot.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: "Slot cancelled successfully" });
    } catch (err) {
        console.error("Error cancelling slot:", err);
        res.status(500).json({ success: false, message: "Failed to cancel slot" });
    }
});


// Route to get all doctors for the patient to see
// server.js - Update this route
app.get('/api/patient/available-doctors', async (req, res) => {
    try {
        // Change the query to allow ONLY 'online' statuses
        const doctors = await Doctor.find({
            isVerified: true,
            status: 'online'
        });
        res.json(doctors);
    } catch (err) {
        res.status(500).json({ success: false });
    }
});
app.get('/api/doctor/availability/:email', async (req, res) => {
    try {
        const slots = await Slot.find({
            doctorEmail: req.params.email,
            status: 'available'
        }).sort({ createdAt: -1 });

        if (!slots || slots.length === 0) return res.json({ block: null, slots: [] });

        const latestSlot = slots[0];
        const now = new Date();

        // Helper: parse "HH:MM AM/PM" + date string into a Date
        const parseSlotTime = (timeStr, dateStr) => {
            const parts = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
            if (!parts) return null;
            let hour = parseInt(parts[1], 10);
            const minute = parseInt(parts[2], 10);
            const ampm = parts[3].toUpperCase();
            if (ampm === 'PM' && hour < 12) hour += 12;
            if (ampm === 'AM' && hour === 12) hour = 0;

            const d = new Date();
            const dateParts = dateStr.includes('/') ? dateStr.split('/') : dateStr.split('-');
            if (dateParts.length === 3) {
                if (dateStr.includes('/')) {
                    // DD/MM/YYYY
                    d.setFullYear(parseInt(dateParts[2], 10));
                    d.setMonth(parseInt(dateParts[1], 10) - 1);
                    d.setDate(parseInt(dateParts[0], 10));
                } else {
                    // YYYY-MM-DD
                    d.setFullYear(parseInt(dateParts[0], 10));
                    d.setMonth(parseInt(dateParts[1], 10) - 1);
                    d.setDate(parseInt(dateParts[2], 10));
                }
            }
            d.setHours(hour, minute, 0, 0);
            return d;
        };

        const slotStart = parseSlotTime(latestSlot.startTime, latestSlot.date);
        const slotEnd = parseSlotTime(latestSlot.endTime, latestSlot.date);

        // If end time has already passed, delete the slot and return null
        if (slotEnd && now >= slotEnd) {
            await Slot.findByIdAndDelete(latestSlot._id);
            return res.json({ block: null, slots: [] });
        }

        // Determine if slot is currently active (started but not ended)
        const isActive = slotStart && now >= slotStart;

        // Always return slot block to the doctor so they can see/cancel it even
        // before it starts. (Patient-facing routes should check isActive separately.)
        const bookedAppointments = await Appointment.find({
            doctorEmail: req.params.email,
            appointmentDate: latestSlot.date
        });
        const bookedTimes = bookedAppointments.map(app => app.appointmentTime);

        const splitIntoHalfHourSlots = (startTime, endTime) => {
            // Parse "HH:MM AM/PM" into total minutes from midnight.
            // We CANNOT use new Date('2000/01/01 10:00 AM') Ã¢â‚¬â€ Node.js
            // does not reliably parse AM/PM in that format (returns Invalid Date).
            const parseToMins = (timeStr) => {
                const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
                if (!match) return null;
                let h = parseInt(match[1], 10);
                const m = parseInt(match[2], 10);
                const ampm = match[3].toUpperCase();
                if (ampm === 'PM' && h < 12) h += 12;
                if (ampm === 'AM' && h === 12) h = 0;
                return h * 60 + m;
            };

            const fmtMins = (totalMins) => {
                let h = Math.floor(totalMins / 60) % 24;
                const m = totalMins % 60;
                const ampm = h < 12 ? 'AM' : 'PM';
                h = h % 12 || 12;
                return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')} ${ampm}`;
            };

            let startMins = parseToMins(startTime);
            let endMins = parseToMins(endTime);
            if (startMins === null || endMins === null) return [];
            if (endMins <= startMins) endMins += 24 * 60; // handle overnight slots

            const intervals = [];
            let cur = startMins;
            while (cur < endMins) {
                const next = cur + 30;
                if (next > endMins) break;
                intervals.push({ start: fmtMins(cur), end: fmtMins(next) });
                cur = next;
            }
            return intervals;
        };

        const subSlots = splitIntoHalfHourSlots(latestSlot.startTime, latestSlot.endTime);
        let processed = [];
        subSlots.forEach(sub => {
            const displayTime = `${sub.start} - ${sub.end}`;
            if (bookedTimes.includes(displayTime)) return; // already booked

            // Filter out sub-slots whose start time has already passed
            const subSlotStart = parseSlotTime(sub.start, latestSlot.date);
            if (subSlotStart && now >= subSlotStart) return; // this sub-slot's window has started/passed

            processed.push({
                _id: latestSlot._id,
                date: latestSlot.date,
                displayTime: displayTime,
                startTime: sub.start
            });
        });

        res.json({
            block: {
                _id: latestSlot._id,
                date: latestSlot.date,
                startTime: latestSlot.startTime,
                endTime: latestSlot.endTime,
                isActive: isActive
            },
            slots: processed  // Always return slots Ã¢â‚¬â€ patients can book upcoming ones too
        });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});


app.get('/api/doctor/sessions/:email', async (req, res) => {
    try {
        const appointments = await Appointment.find({ doctorEmail: req.params.email });

        // Fetch patient details (like phone number) for each appointment
        let sessions = await Promise.all(appointments.map(async (app) => {
            const patient = await User.findOne({ email: app.patientEmail });
            return {
                _id: app._id,
                patientName: app.patientName,
                patientEmail: app.patientEmail,
                patientPhone: patient ? patient.phone : 'N/A',
                appointmentDate: app.appointmentDate,
                appointmentTime: app.appointmentTime,
                status: app.status
            };
        }));

        const now = new Date();

        sessions = sessions.filter(session => {
            if (session.status === 'completed' || session.status === 'cancelled') return false;

            const dStr = session.appointmentDate;
            const tStr = session.appointmentTime;
            if (!dStr || !tStr) return false;

            // Parse date
            let parts = dStr.includes('/') ? dStr.split('/') : dStr.split('-');
            let sessionDate;
            if (dStr.includes('/')) {
                sessionDate = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
            } else {
                sessionDate = new Date(dStr);
            }

            // Parse end time from expected "HH:MM AM/PM - HH:MM AM/PM"
            const endMatch = tStr.match(/-\s*(\d+):(\d+)\s*(AM|PM)/i);
            if (endMatch) {
                let hours = parseInt(endMatch[1], 10);
                const minutes = parseInt(endMatch[2], 10);
                const ampm = endMatch[3].toUpperCase();

                if (ampm === 'PM' && hours < 12) hours += 12;
                if (ampm === 'AM' && hours === 12) hours = 0;

                sessionDate.setHours(hours, minutes, 0, 0);
            } else {
                sessionDate.setHours(23, 59, 59, 999); // Fallback to end of day
            }

            return sessionDate >= now;
        });

        sessions.sort((a, b) => {
            const parseDate = (dStr) => {
                if (!dStr) return 0;
                let parts = dStr.includes('/') ? dStr.split('/') : dStr.split('-');
                if (dStr.includes('/')) return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`).getTime();
                return new Date(dStr).getTime();
            };

            const dateA = parseDate(a.appointmentDate);
            const dateB = parseDate(b.appointmentDate);

            if (dateA !== dateB) return dateA - dateB;

            const parseTime = (tStr) => {
                if (!tStr) return 0;
                const match = tStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
                if (!match) return 0;
                let hours = parseInt(match[1], 10);
                const minutes = parseInt(match[2], 10);
                const ampm = match[3].toUpperCase();
                if (ampm === 'PM' && hours < 12) hours += 12;
                if (ampm === 'AM' && hours === 12) hours = 0;
                return hours * 60 + minutes;
            };

            return parseTime(a.appointmentTime) - parseTime(b.appointmentTime);
        });

        res.json({ success: true, sessions });
    } catch (err) {
        console.error("Error fetching sessions:", err);
        res.status(500).json({ success: false, message: "Error fetching sessions" });
    }
});

app.get('/api/patient/sessions/:email', async (req, res) => {
    try {
        const appointments = await Appointment.find({ patientEmail: req.params.email, status: { $nin: ['cancelled', 'completed'] } });

        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        let sessions = await Promise.all(appointments.map(async (app) => {
            const doctor = await Doctor.findOne({ email: app.doctorEmail });
            return {
                _id: app._id,
                doctorName: doctor ? `Dr. ${doctor.firstName} ${doctor.lastName}` : app.doctorEmail,
                doctorEmail: app.doctorEmail,
                specialization: doctor ? doctor.specialization : 'N/A',
                clinicName: doctor ? doctor.clinicName : 'N/A',
                appointmentDate: app.appointmentDate,
                appointmentTime: app.appointmentTime,
                status: app.status
            };
        }));

        // 'now' and 'startOfToday' are already declared above
        // Remove 'const now = new Date();' as it's defined on line 487

        sessions = sessions.filter(session => {
            if (session.status === 'completed' || session.status === 'cancelled') return false;

            const dStr = session.appointmentDate;
            const tStr = session.appointmentTime;
            if (!dStr || !tStr) return false;

            let parts = dStr.includes('/') ? dStr.split('/') : dStr.split('-');
            let sessionDate;
            if (dStr.includes('/')) {
                sessionDate = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
            } else {
                sessionDate = new Date(dStr);
            }

            // Parse end time from expected "HH:MM AM/PM - HH:MM AM/PM"
            const endMatch = tStr.match(/-\s*(\d+):(\d+)\s*(AM|PM)/i);
            if (endMatch) {
                let hours = parseInt(endMatch[1], 10);
                const minutes = parseInt(endMatch[2], 10);
                const ampm = endMatch[3].toUpperCase();

                if (ampm === 'PM' && hours < 12) hours += 12;
                if (ampm === 'AM' && hours === 12) hours = 0;

                sessionDate.setHours(hours, minutes, 0, 0);
            } else {
                sessionDate.setHours(23, 59, 59, 999); // Fallback to end of day
            }

            return sessionDate >= now;
        });

        // Optional: sort sessions by date and time
        sessions.sort((a, b) => {
            const parseDate = (dStr) => {
                if (!dStr) return 0;
                let parts = dStr.includes('/') ? dStr.split('/') : dStr.split('-');
                if (dStr.includes('/')) return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`).getTime();
                return new Date(dStr).getTime();
            };

            const dateA = parseDate(a.appointmentDate);
            const dateB = parseDate(b.appointmentDate);

            if (dateA !== dateB) return dateA - dateB;

            const parseTime = (tStr) => {
                if (!tStr) return 0;
                const match = tStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
                if (!match) return 0;
                let hours = parseInt(match[1], 10);
                const minutes = parseInt(match[2], 10);
                const ampm = match[3].toUpperCase();
                if (ampm === 'PM' && hours < 12) hours += 12;
                if (ampm === 'AM' && hours === 12) hours = 0;
                return hours * 60 + minutes;
            };

            return parseTime(a.appointmentTime) - parseTime(b.appointmentTime);
        });

        res.json({ success: true, sessions });
    } catch (err) {
        console.error("Error fetching patient sessions:", err);
        res.status(500).json({ success: false, message: "Error fetching sessions" });
    }
});

app.get('/api/doctor/dashboard-stats/:email', async (req, res) => {
    try {
        const appointments = await Appointment.find({ doctorEmail: req.params.email });

        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        let totalBookings = 0;
        let completedSessions = 0;

        appointments.forEach(app => {
            if (app.status === 'completed') {
                completedSessions++;
            } else if (app.status !== 'cancelled') {
                const dStr = app.appointmentDate;
                if (!dStr) return;
                let parts = dStr.includes('/') ? dStr.split('/') : dStr.split('-');
                let appDate;
                if (dStr.includes('/')) {
                    appDate = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
                } else {
                    appDate = new Date(dStr);
                }
                appDate.setHours(0, 0, 0, 0);

                if (appDate >= startOfToday) {
                    totalBookings++; // Count all upcoming uncompleted appointments
                }
            }
        });

        // Return a mock rating for now, or you can implement real rating logic later
        const rating = "4.9";

        res.json({
            success: true,
            stats: {
                totalBookings, // using this for upcoming/active
                completedSessions,
                rating
            }
        });
    } catch (err) {
        console.error("Error fetching stats:", err);
        res.status(500).json({ success: false, message: "Error fetching stats" });
    }
});

app.put('/api/doctor/session/start/:id', async (req, res) => {
    try {
        const appointmentId = req.params.id;
        await Appointment.findByIdAndUpdate(appointmentId, { status: 'active' });
        res.json({ success: true, message: "Session is now active." });
    } catch (err) {
        console.error("Error activating session:", err);
        res.status(500).json({ success: false, message: "Failed to activate session." });
    }
});

app.put('/api/doctor/session/complete/:id', async (req, res) => {
    try {
        const appointmentId = req.params.id;
        await Appointment.findByIdAndUpdate(appointmentId, { status: 'completed' });
        res.json({ success: true, message: "Session marked as completed." });
    } catch (err) {
        console.error("Error updating session status:", err);
        res.status(500).json({ success: false, message: "Failed to update session." });
    }
});

// --- ADMIN LOGIN ROUTE ---
const ADMIN_CREDENTIALS = {
    adminId: 'adm123',
    email: 'admin123@gmail.com',
    password: 'adm123'
};

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
            token: "admin-session-secure-token"
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


// --- RAZORPAY PAYMENT ROUTES ---

// Step 1: Create a Razorpay order (called before showing the payment modal)
app.post('/api/payment/create-order', async (req, res) => {
    try {
        const { slotId, patientEmail, timeSlot } = req.body;

        if (!slotId || !patientEmail || !timeSlot) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }

        // Fetch the slot to confirm it still exists
        const slot = await Slot.findById(slotId);
        if (!slot) {
            return res.status(404).json({ success: false, message: 'Slot not found' });
        }

        // Consultation fee: Ã¢â€šÂ¹500 (amount in paise)
        const amount = 50000;
        const order = await createOrder(amount, 'INR');

        res.json({
            success: true,
            orderId: order.id,
            amount: 50000,
            currency: 'INR',
            key: process.env.KEY_ID
        });
    } catch (err) {
        console.error('Create Order Error:', err);
        let errorMsg = 'Failed to create payment order';

        // Check for common Razorpay errors to provide helpful feedback
        if (err.statusCode === 401) {
            errorMsg = 'Razorpay Authentication Failed: Your KEY_ID or KEY_SECRET is incorrect.';
        } else if (err.error && err.error.description) {
            errorMsg = `Razorpay Error: ${err.error.description}`;
        } else if (err.message) {
            errorMsg = `Error: ${err.message}`;
        }

        res.status(500).json({ success: false, message: errorMsg });
    }
});

// Step 2: Verify payment signature and create the appointment
app.post('/api/payment/verify', async (req, res) => {
    try {
        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            slotId,
            patientEmail,
            timeSlot
        } = req.body;

        // Verify HMAC-SHA256 signature
        const expectedSignature = crypto
            .createHmac('sha256', process.env.KEY_SECRET)
            .update(`${razorpay_order_id}|${razorpay_payment_id}`)
            .digest('hex');

        if (expectedSignature !== razorpay_signature) {
            return res.status(400).json({ success: false, message: 'Payment verification failed. Invalid signature.' });
        }

        // Payment is verified Ã¢â‚¬â€ now create the appointment
        const slot = await Slot.findById(slotId);
        if (!slot) {
            return res.status(404).json({ success: false, message: 'Associated slot block not found' });
        }

        const patient = await User.findOne({ email: patientEmail });
        const patientName = patient ? patient.fullName : 'Unknown Patient';

        const newAppointment = new Appointment({
            doctorEmail: slot.doctorEmail,
            patientName: patientName,
            patientEmail: patientEmail,
            appointmentDate: slot.date,
            appointmentTime: timeSlot,
            status: 'scheduled',
            razorpay_order_id: razorpay_order_id,
            razorpay_payment_id: razorpay_payment_id,
            razorpay_signature: razorpay_signature,
            amount: 500
        });

        await newAppointment.save();

        // Fetch doctor name for the email
        const doctor = await Doctor.findOne({ email: slot.doctorEmail });
        const doctorName = doctor ? `Dr. ${doctor.firstName} ${doctor.lastName}` : 'your doctor';

        // Send confirmation email
        await transporter.sendMail({
            from: '"Mental Health Support" <mentaalhealth2025@gmail.com>',
            to: patientEmail,
            subject: 'Appointment Booking Confirmed',
            text: `Hello ${patientName},\n\nYour appointment with ${doctorName} has been successfully booked and payment received.\n\nDate: ${slot.date}\nTime: ${timeSlot}\nPayment ID: ${razorpay_payment_id}\n\nThank you for choosing AI Heal.\n\nBest regards,\nMental Health Support Team`
        });

        res.json({ success: true, message: 'Payment verified and appointment created' });
    } catch (err) {
        console.error('Payment Verify Error:', err);
        res.status(500).json({ success: false, message: 'Server error during verification' });
    }
});

// --- BOOKING LOGIC ---
app.post('/api/bookings/create', async (req, res) => {
    try {
        const { slotId, patientEmail, timeSlot } = req.body;

        // 1. Fetch the original slot to get the doctor's email and date
        const slot = await Slot.findById(slotId);
        if (!slot) {
            return res.status(404).json({ success: false, message: "Associated slot block not found" });
        }

        // 2. Fetch the patient to get their name
        const patient = await User.findOne({ email: patientEmail });
        const patientName = patient ? patient.fullName : "Unknown Patient";

        // 3. Create a new Appointment referencing this time and doctor
        const newAppointment = new Appointment({
            doctorEmail: slot.doctorEmail,
            patientName: patientName,
            patientEmail: patientEmail,
            appointmentDate: slot.date,
            appointmentTime: timeSlot,
            status: 'scheduled'
        });

        await newAppointment.save();

        // 4. Fetch the doctor to get their name
        const doctor = await Doctor.findOne({ email: slot.doctorEmail });
        const doctorName = doctor ? `Dr. ${doctor.firstName} ${doctor.lastName}` : "your doctor";

        // 5. Send Confirmation Email to the Patient
        await transporter.sendMail({
            from: '"Mental Health Support" <mentaalhealth2025@gmail.com>',
            to: patientEmail,
            subject: "Appointment Booking Confirmed",
            text: `Hello ${patientName},\n\nYour appointment with ${doctorName} has been successfully booked.\n\nDate: ${slot.date}\nTime: ${timeSlot}\n\nThank you for choosing AI Heal.\n\nBest regards,\nMental Health Support Team`
        });

        res.json({ success: true, message: "Slot reserved successfully as an Appointment" });
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

// --- CHAT API LOGIC ---
app.post('/api/chat/send', async (req, res) => {
    try {
        const { sessionId, senderEmail, receiverEmail, text, senderModel } = req.body;
        const newMessage = new Message({
            sessionId,
            senderEmail,
            receiverEmail,
            senderModel,
            text,
            isRead: false
        });
        await newMessage.save();
        res.json({ success: true, message: newMessage });
    } catch (err) {
        console.error("Error sending message:", err);
        res.status(500).json({ success: false, message: "Error sending message" });
    }
});

app.get('/api/chat/messages/:sessionId', async (req, res) => {
    try {
        const messages = await Message.find({ sessionId: req.params.sessionId }).sort({ createdAt: 1 });
        res.json({ success: true, messages });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

app.put('/api/chat/mark-read', async (req, res) => {
    try {
        const { sessionId, receiverEmail } = req.body;
        // Update all messages in this session sent TO this receiver that are unread
        await Message.updateMany(
            { sessionId: sessionId, receiverEmail: receiverEmail, isRead: false },
            { $set: { isRead: true } }
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

app.get('/api/chat/unread-count/:email', async (req, res) => {
    try {
        const userEmail = req.params.email;
        // Group unread messages by sessionId so we can show badges per session
        const unreadCounts = await Message.aggregate([
            { $match: { receiverEmail: userEmail, isRead: false } },
            { $group: { _id: "$sessionId", count: { $sum: 1 } } }
        ]);

        // Convert to a neat dictionary of { sessionId: count }
        const countsBySession = {};
        unreadCounts.forEach(item => {
            countsBySession[item._id] = item.count;
        });

        res.json({ success: true, counts: countsBySession });
    } catch (err) {
        console.error("Error getting unread count:", err);
        res.status(500).json({ success: false, counts: {} });
    }
});


// --- ZOOM VIDEO CONFERENCE ROUTES (Server-to-Server OAuth) ---

// Doctor starts a Zoom meeting for an appointment
app.post('/api/zoom/start-meeting/:appointmentId', async (req, res) => {
    try {
        const appointment = await Appointment.findById(req.params.appointmentId);
        if (!appointment) return res.status(404).json({ success: false, message: 'Appointment not found' });

        if (appointment.zoomMeetingId && appointment.status === 'active') {
            return res.json({ success: true, meetingId: appointment.zoomMeetingId, startUrl: appointment.zoomStartUrl, joinUrl: appointment.zoomJoinUrl, password: appointment.zoomPassword });
        }

        const topic = `Mental Health Consultation - ${appointment.patientName}`;
        const meetingData = await createZoomMeeting(topic, appointment.patientName);

        await Appointment.findByIdAndUpdate(req.params.appointmentId, { status: 'active', zoomMeetingId: String(meetingData.meetingId), zoomJoinUrl: meetingData.joinUrl, zoomStartUrl: meetingData.startUrl, zoomPassword: meetingData.password });

        res.json({ success: true, meetingId: meetingData.meetingId, startUrl: meetingData.startUrl, joinUrl: meetingData.joinUrl, password: meetingData.password });
    } catch (err) {
        console.error('Zoom Start Meeting Error:', err.response ? err.response.data : err.message);
        res.status(500).json({ success: false, message: 'Failed to create Zoom meeting: ' + (err.response ? JSON.stringify(err.response.data) : err.message) });
    }
});

// Patient joins — verifies they are the booked patient
app.post('/api/zoom/join-meeting/:appointmentId', async (req, res) => {
    try {
        const { patientEmail } = req.body;
        const appointment = await Appointment.findById(req.params.appointmentId);
        if (!appointment) return res.status(404).json({ success: false, message: 'Appointment not found' });
        if (appointment.patientEmail.toLowerCase() !== patientEmail.toLowerCase()) return res.status(403).json({ success: false, message: 'Access denied. You are not the patient for this appointment.' });
        if (!appointment.zoomMeetingId || appointment.status !== 'active') return res.status(400).json({ success: false, message: 'The doctor has not started the meeting yet. Please wait a moment and try again.' });
        res.json({ success: true, joinUrl: appointment.zoomJoinUrl, meetingId: appointment.zoomMeetingId, password: appointment.zoomPassword });
    } catch (err) {
        console.error('Zoom Join Meeting Error:', err);
        res.status(500).json({ success: false, message: 'Failed to retrieve meeting info' });
    }
});

// Doctor ends the meeting and marks session complete
app.post('/api/zoom/end-meeting/:appointmentId', async (req, res) => {
    try {
        const appointment = await Appointment.findById(req.params.appointmentId);
        if (!appointment) return res.status(404).json({ success: false, message: 'Appointment not found' });
        if (appointment.zoomMeetingId) {
            try { await endZoomMeeting(appointment.zoomMeetingId); } catch (zoomErr) { console.warn('Zoom end meeting warning:', zoomErr.response ? zoomErr.response.data : zoomErr.message); }
        }
        await Appointment.findByIdAndUpdate(req.params.appointmentId, { status: 'completed' });
        res.json({ success: true, message: 'Session ended and marked as completed.' });
    } catch (err) {
        console.error('Zoom End Meeting Error:', err);
        res.status(500).json({ success: false, message: 'Failed to end meeting' });
    }
});

app.listen(5000, () => console.log(`🚀 Server running on http://127.0.0.1:5000`));
