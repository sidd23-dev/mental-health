require('dotenv').config();

const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(bodyParser.json());

// ========== IN-MEMORY "DATABASE" ==========
const patientsDB = {};   // patientsDB[email] = { firstName, lastName, email, password, isVerified }
const patientOtpStore = {};  // patientOtpStore[email] = { otp, expiresAt }

const doctorsDB = {};    // doctorsDB[email] = { firstName, lastName, email, password, specialization, regId, isVerified, isApproved }
const doctorOtpStore = {};   // doctorOtpStore[email] = { otp, expiresAt }

// ========== HELPERS ==========
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

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

// ========== TEST ROUTE ==========
app.get('/', (req, res) => {
    res.json({ message: 'Backend running' });
});

// ========== PATIENT ROUTES (SHORT VERSION) ==========
// (Assume you already have them; not rewriting fully here)

// ========== DOCTOR ROUTES ==========

// 1) DOCTOR SIGNUP - save basic info, send OTP, mark as not verified & not approved
app.post('/api/doctor/signup', async (req, res) => {
    const {
        firstName,
        lastName,
        email,
        password,
        age,
        specialization,
        experienceYears,
        clinicName,
        registrationId
    } = req.body;

    if (!firstName || !lastName || !email || !password || !age || !specialization || !experienceYears || !clinicName || !registrationId) {
        return res.status(400).json({ message: 'All fields are required' });
    }

    // If already verified doctor exists
    if (doctorsDB[email] && doctorsDB[email].isVerified) {
        return res.status(400).json({ message: 'Doctor already registered. Please login.' });
    }

    // Save/overwrite doctor as unverified & not approved
    doctorsDB[email] = {
        firstName,
        lastName,
        email,
        password,              // plain for demo
        age,
        specialization,
        experienceYears,
        clinicName,
        registrationId,
        isVerified: false,
        isApproved: false,     // admin will set this to true
        createdAt: new Date()
    };

    // Generate OTP
    const otp = generateOTP();
    const expiresAt = Date.now() + 10 * 60 * 1000;
    doctorOtpStore[email] = { otp, expiresAt };

    try {
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Doctor Signup OTP - Mental Health App',
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; background: #f4f4f4;">
                    <div style="max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px;">
                        <h2 style="color: #2d5a27;">Verify Your Doctor Account</h2>
                        <p>Hello Dr. ${firstName},</p>
                        <p>Your OTP for doctor account verification is:</p>
                        <h1 style="background: #2d5a27; color: white; padding: 15px; text-align: center; border-radius: 8px; letter-spacing: 5px;">
                            ${otp}
                        </h1>
                        <p style="color: #666;">This OTP will expire in 10 minutes.</p>
                        <p style="color: #666;">After verification, an admin will review and approve your account.</p>
                    </div>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        console.log(`Doctor signup OTP sent to ${email}: ${otp}`);

        return res.json({
            success: true,
            message: 'Doctor account created. OTP sent to email. Please verify.'
        });
    } catch (err) {
        console.error('Error sending doctor signup OTP:', err);
        return res.status(500).json({ message: 'Failed to send OTP. Please try again.' });
    }
});

// 2) DOCTOR VERIFY SIGNUP OTP
app.post('/api/doctor/verify-signup-otp', (req, res) => {
    const { email, otp } = req.body;

    if (!email || !otp) {
        return res.status(400).json({ message: 'Email and OTP are required' });
    }

    const doctor = doctorsDB[email];
    if (!doctor) {
        return res.status(400).json({ message: 'Doctor not found. Please sign up again.' });
    }

    const stored = doctorOtpStore[email];
    if (!stored) {
        return res.status(400).json({ message: 'No OTP found. Please sign up again.' });
    }

    if (Date.now() > stored.expiresAt) {
        delete doctorOtpStore[email];
        return res.status(400).json({ message: 'OTP expired. Please sign up again.' });
    }

    if (stored.otp !== otp) {
        return res.status(400).json({ message: 'Invalid OTP.' });
    }

    // Mark as verified (still waiting for admin approval)
    doctor.isVerified = true;
    delete doctorOtpStore[email];

    console.log('Doctor email verified:', email);
    return res.json({
        success: true,
        message: 'Email verified successfully! Please wait for admin approval.'
    });
});

// 3) DOCTOR LOGIN - email + password only; must be verified AND approved
app.post('/api/doctor/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required' });
    }

    const doctor = doctorsDB[email];
    if (!doctor) {
        return res.status(400).json({ message: 'Invalid email or password' });
    }

    if (!doctor.isVerified) {
        return res.status(400).json({ message: 'Email not verified. Please complete signup OTP.' });
    }

    if (!doctor.isApproved) {
        return res.status(400).json({ message: 'Account pending admin approval.' });
    }

    if (doctor.password !== password) {
        return res.status(400).json({ message: 'Invalid email or password' });
    }

    const token = Buffer.from(`${email}:${Date.now()}`).toString('base64');

    console.log('Doctor logged in:', email);
    return res.json({
        success: true,
        message: 'Login successful!',
        token,
        name: `Dr. ${doctor.firstName} ${doctor.lastName}`,
        email
    });
});

// ========== SIMPLE ADMIN ROUTES (FOR APPROVAL) ==========

// Get list of doctors waiting for approval
app.get('/api/admin/doctors/pending', (req, res) => {
    const pending = Object.values(doctorsDB).filter(d => d.isVerified && !d.isApproved);
    return res.json({ success: true, doctors: pending });
});

// Approve a doctor by email
app.post('/api/admin/doctors/approve', (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ message: 'Email is required' });
    }

    const doctor = doctorsDB[email];
    if (!doctor) {
        return res.status(400).json({ message: 'Doctor not found' });
    }

    if (!doctor.isVerified) {
        return res.status(400).json({ message: 'Doctor not verified yet' });
    }

    doctor.isApproved = true;
    console.log('Doctor approved by admin:', email);

    return res.json({ success: true, message: 'Doctor approved successfully.' });
});

//===========admin login section========
// ... existing requires, app = express(), middleware, patient/doctor routes ...
// Reject (delete) a doctor by email
app.post('/api/admin/doctors/reject', (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ message: 'Email is required' });
    }

    const doctor = doctorsDB[email];
    if (!doctor) {
        return res.status(400).json({ message: 'Doctor not found' });
    }

    delete doctorsDB[email];
    console.log('Doctor rejected and removed by admin:', email);

    return res.json({ success: true, message: 'Doctor rejected and removed.' });
});


// SIMPLE ADMIN ACCOUNT (in memory)
const adminUser = {
    adminId: 'ADM-001',
    email: 'admin@example.com',
    password: 'Admin@123'
};

// ADMIN LOGIN ROUTE
app.post('/api/admin/login', (req, res) => {
    const { adminId, email, password } = req.body;

    if (!adminId || !email || !password) {
        return res.status(400).json({ success: false, message: 'Admin ID, email and password are required' });
    }

    if (
        adminId === adminUser.adminId &&
        email === adminUser.email &&
        password === adminUser.password
    ) {
        const token = Buffer.from(`${email}:${Date.now()}`).toString('base64');

        return res.json({
            success: true,
            message: 'Admin login successful',
            email,
            token
        });
    } else {
        return res.status(401).json({ success: false, message: 'Invalid admin credentials' });
    }
});

//admin dash===
// ADMIN OVERVIEW (for dashboard cards)
app.get('/api/admin/overview', (req, res) => {
  const allDoctors = Object.values(doctorsDB);
  const totalDoctors = allDoctors.filter(d => d.isApproved).length;
  const pendingDoctors = allDoctors.filter(d => d.isVerified && !d.isApproved).length;

  // For now, you don't track patients/appointments in this file,
  // so set them to 0 (you can update later when you add them).
  const totalPatients = Object.keys(patientsDB).length;
  const totalAppointments = 0;

  return res.json({
    success: true,
    stats: {
      totalDoctors,
      pendingDoctors,
      totalPatients,
      totalAppointments
    },
    appointments: [] // later you can send real appointments here
  });
});

// ========== START SERVER ==========
app.listen(PORT, () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
});
