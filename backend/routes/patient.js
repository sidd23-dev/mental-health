const express = require('express');
const router = express.Router();
const Patient = require('../models/Patient');
const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/patients/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// 1. Fetch Profile (To auto-fill the dashboard)
router.get('/profile/:email', async (req, res) => {
    try {
        const patient = await Patient.findOne({ email: req.params.email });
        if (!patient) return res.status(404).json({ success: false });
        res.json({ success: true, profile: patient });
    } catch (err) { res.status(500).json({ success: false }); }
});

// 2. Update Profile (The Edit Feature)
router.post('/update', upload.single('photo'), async (req, res) => {
    try {
        let updateData = req.body;
        if (req.file) updateData.photoPath = `/uploads/patients/${req.file.filename}`;
        
        const updated = await Patient.findOneAndUpdate(
            { email: req.body.email },
            { $set: updateData },
            { new: true }
        );
        res.json({ success: true, profile: updated });
    } catch (err) { res.status(500).json({ success: false }); }
});

module.exports = router;