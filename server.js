require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

// Razorpay Setup
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// User Model
const userSchema = new mongoose.Schema({
    email: { type: String, unique: true },
    credits: { type: Number, default: 10 }
});
const User = mongoose.model("User", userSchema);

// Payment Route (Updated with Validations)
app.post("/api/payments/create-order", async (req, res) => {
    try {
        const { userId } = req.body;

        // 1. Check if userId is sent
        if (!userId) {
            return res.status(400).json({ error: "userId is required!" });
        }

        // 2. Validate if the ID is a 24-character MongoDB ObjectID
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ 
                error: "Invalid ID format! 24-digit hex string ki zarurat hai." 
            });
        }

        // 3. Find User in DB
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: "User not found in Database!" });
        }

        // 4. Create Razorpay Order
        const options = {
            amount: 500 * 100, // Amount in paise (500 INR)
            currency: "INR",
            receipt: `receipt_${Date.now()}` // Dynamic receipt ID
        };

        const order = await razorpay.orders.create(options);
        
        res.json({ 
            success: true,
            orderId: order.id, 
            amount: order.amount,
            currency: order.currency
        });

    } catch (err) {
        console.error("Payment Error:", err.message);
        res.status(500).json({ error: "Internal Server Error: " + err.message });
    }
});

// MongoDB Connection with detailed logging
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
    console.error("❌ Error: MONGO_URI is not defined in environment variables!");
    process.exit(1);
}

mongoose.connect(MONGO_URI)
    .then(() => {
        console.log("✅ MongoDB Connected Successfully");
        app.listen(PORT, "0.0.0.0", () => {
            console.log(`🚀 Server is flying on port ${PORT}`);
        });
    })
    .catch(err => {
        console.error("❌ MongoDB Connection Failed!");
        console.error("Reason:", err.message);
    });
