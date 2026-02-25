const mongoose = require('mongoose');

const doctorSchema = new mongoose.Schema({
    firstName: String,
    lastName: String,
    email: { type: String, unique: true },
    password: { type: String, required: true },
    specialization: String,
    clinicName: String,  
    experience: { type: Number, default: 0 }, // <--- ADDED THIS FIELD
    registrationId: String,
  certificate: String,
    photo: String,
    otp: String,
    isVerified: { type: Boolean, default: false },
    status: { type: String, default: 'pending' } // pending, approved, rejected
});

module.exports = mongoose.model('Doctor', doctorSchema);