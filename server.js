require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const Razorpay = require("razorpay");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

// Razorpay Setup (Railway Variables se uthayega)
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

// --- PAYMENT ROUTE WITH 24-DIGIT ID VALIDATION ---
app.post("/api/payments/create-order", async (req, res) => {
    try {
        const { userId } = req.body;

        // 1. Pehle check karo ki ID bheji gayi hai ya nahi
        if (!userId) {
            return res.status(400).json({ error: "Bhai, User ID bhejna zaroori hai!" });
        }

        // 2. CHECK: Kya ID 24-digit ki valid MongoDB ID hai?
        // Agar ye 24 hex characters nahi honge, toh ye block error pakad lega
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ 
                error: "Galat ID! MongoDB ki ID hamesha 24-digit (hex) ki hoti hai.",
                your_id_length: userId.length 
            });
        }

        // 3. Database mein User dhoondo
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: "Ye User ID hamare database mein nahi mili!" });
        }

        // 4. Razorpay Order Create karo
        const order = await razorpay.orders.create({
            amount: 500 * 100, // ₹500
            currency: "INR",
            receipt: `recept_id_${Math.floor(Math.random() * 10000)}`
        });

        res.json({ 
            success: true,
            orderId: order.id, 
            amount: order.amount 
        });

    } catch (err) {
        console.error("Server Error:", err.message);
        res.status(500).json({ error: "Kuch toh gadbad hai: " + err.message });
    }
});

// MongoDB Connection
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;

mongoose.connect(MONGO_URI)
    .then(() => {
        console.log("✅ MongoDB Connected Successfully");
        app.listen(PORT, "0.0.0.0", () => {
            console.log(`🚀 Server running on port ${PORT}`);
        });
    })
    .catch(err => {
        console.log("❌ DB Connection Error. Check your MONGO_URI in Railway Variables.");
        console.error(err.message);
    });
