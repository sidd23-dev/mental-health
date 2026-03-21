const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    sessionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Appointment',
        required: true
    },
    senderEmail: {
        type: String,
        required: true
    },
    receiverEmail: {
        type: String,
        required: true
    },
    senderModel: {
        type: String
    },
    text: {
        type: String,
        required: true
    },
    isRead: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Message', messageSchema);
