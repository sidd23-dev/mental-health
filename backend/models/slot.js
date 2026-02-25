const mongoose = require('mongoose');

const slotSchema = new mongoose.Schema({
    doctorEmail: { 
        type: String, 
        required: true 
    },
    date: { 
        type: String, 
        required: true 
    },
    startTime: { 
        type: String, 
        required: true 
    },
    endTime: { 
        type: String, 
        required: true 
    },
    status: { 
        type: String, 
        default: 'available',
        enum: ['available', 'booked', 'cancelled'] 
    },
    patientEmail: { 
        type: String, 
        default: null 
    } // Stores the email of the patient who booked this slot
}, { 
    timestamps: true // This adds 'createdAt' and 'updatedAt' automatically
});

module.exports = mongoose.model('Slot', slotSchema);