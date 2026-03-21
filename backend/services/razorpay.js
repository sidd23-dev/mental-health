const Razorpay = require('razorpay');
require('dotenv').config();

const razorpay = new Razorpay({
    key_id: process.env.KEY_ID,
    key_secret: process.env.KEY_SECRET
});

/**
 * Creates a Razorpay order.
 * @param {number} amount - Amount in paise (INR). e.g. 50000 = ₹500
 * @param {string} currency - Currency code, default "INR"
 * @returns {Promise<object>} Razorpay order object
 */
async function createOrder(amount, currency = 'INR') {
    const options = {
        amount: amount,
        currency: currency,
        receipt: `receipt_${Date.now()}`,
        payment_capture: 1 // Auto-capture payment
    };
    const order = await razorpay.orders.create(options);
    return order;
}

module.exports = { razorpay, createOrder };
