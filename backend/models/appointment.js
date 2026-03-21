const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema({
    doctorEmail: String,
    patientName: String,
    patientEmail: String,
    appointmentDate: String,
    appointmentTime: String,
    status: { type: String, default: 'scheduled' }, // scheduled, completed, cancelled
    razorpay_order_id: String,
    razorpay_payment_id: String,
    razorpay_signature: String,
    amount: Number,
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Appointment', appointmentSchema);