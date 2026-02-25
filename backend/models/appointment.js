const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema({
    doctorEmail: String,
    patientName: String,
    patientEmail: String,
    appointmentDate: String,
    appointmentTime: String,
    status: { type: String, default: 'scheduled' }, // scheduled, completed, cancelled
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Appointment', appointmentSchema);