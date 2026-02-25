const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    // Account
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    
    // Personal
    fullName: { type: String, required: true },
    dob: Date,
    age: Number,
    gender: String,
    bloodGroup: String,
    phone: String,
    
    // Address
    address: String,
    city: String,
    state: String,
    
    // Medical
    allergies: String,
    conditions: String,
    
    // Emergency
    eName: String,
    eRelation: String,
    ePhone: String,
    
    // System Fields
    photo: String, // Stores the file path
    otp: String,
    isVerified: { type: Boolean, default: false }
});

module.exports = mongoose.model('User', userSchema);