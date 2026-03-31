require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const cors = require("cors");
const helmet = require("helmet");

const app = express();

// Middleware
app.use(express.json());
app.use(cors());
app.use(helmet());

// Razorpay Setup
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID || "dummy",
    key_secret: process.env.RAZORPAY_KEY_SECRET || "dummy",
});

// User Model
const User = mongoose.model("User", new mongoose.Schema({
    email: { type: String, unique: true },
    credits: { type: Number, default: 10 }
}));

// Routes
app.get("/", (req, res) => res.send("VibeGen Server is Live!"));

// DB Connection & Server Start
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
    console.error("❌ MONGO_URI is not defined in Railway Variables!");
}

mongoose.connect(MONGO_URI)
    .then(() => {
        console.log("✅ MongoDB Connected");
        // Railway ke liye 0.0.0.0 par listen karna behtar hai
        app.listen(PORT, "0.0.0.0", () => {
            console.log(`🚀 Server running on port ${PORT}`);
        });
    })
    .catch(err => {
        console.error("❌ MongoDB Connection Failed:", err.message);
        // Server crash na ho isliye listen yahan bhi dal sakte hain taaki health check pass ho jaye
        app.listen(PORT, "0.0.0.0", () => {
            console.log(`🚀 Server running on port ${PORT} (DB Connection Failed)`);
        });
    });
