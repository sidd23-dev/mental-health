const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Doctor = require('../models/doctor');
const Appointment = require('../models/appointment'); // Fixed spelling: appointment

// Ensure upload directory exists
const uploadDir = path.join(__dirname, '..', 'uploads', 'doctors');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// HELPER: Generate 30-min slots
function generateTimeSlots(start, end) {
    let slots = [];
    let [startH, startM] = start.split(':').map(Number);
    let [endH, endM] = end.split(':').map(Number);
    let current = startH * 60 + startM;
    let finish = endH * 60 + endM;

    while (current < finish) {
        let h = Math.floor(current / 60);
        let m = current % 60;
        let ampm = h >= 12 ? 'PM' : 'AM';
        let displayH = h % 12 || 12;
        let displayM = m === 0 ? "00" : m;
        slots.push(`${displayH}:${displayM} ${ampm}`);
        current += 30;
    }
    return slots;
}

// SAVE PROFILE & GENERATE SLOTS
// This handles everything: Name, Clinic, Specialization, AND Experience
router.post('/profile', upload.single('photo'), async (req, res) => {
    try {
        let data = req.body;
        
        // Handle photo path if a new file is uploaded
        if (req.file) {
            data.photo = `uploads/doctors/${req.file.filename}`;
        }

        // Generate slots if time range is provided
        if (req.body.startTime && req.body.endTime) {
            const times = generateTimeSlots(req.body.startTime, req.body.endTime);
            data.availableSlots = times.map(t => ({ time: t, isBooked: false }));
        }

        const doctor = await Doctor.findOneAndUpdate(
            { email: req.body.email },
            data, // This includes 'experience' from the form
            { upsert: true, new: true }
        );

        res.json({ success: true, doctor });
    } catch (err) { 
        console.error("Profile update error:", err);
        res.status(500).json({ success: false, message: err.message }); 
    }
});

// GET BOOKINGS FOR DOCTOR
router.get('/my-bookings/:email', async (req, res) => {
    try {
        const appointments = await Appointment.find({ doctorEmail: req.params.email });
        res.json({ success: true, appointments });
    } catch (err) { 
        res.status(500).json({ success: false, message: "Could not fetch bookings" }); 
    }
});

module.exports = router;