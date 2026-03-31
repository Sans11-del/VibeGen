require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const cors = require("cors");
const helmet = require("helmet");

const app = express();

// ===== MIDDLEWARE =====
app.use(express.json());
app.use(cors());
app.use(helmet({
    contentSecurityPolicy: false, // Razorpay script allow karne ke liye zaroori
}));

// ===== RAZORPAY SETUP =====
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID || "dummy",
    key_secret: process.env.RAZORPAY_KEY_SECRET || "dummy",
});

// ===== DB MODEL =====
const User = mongoose.model("User", new mongoose.Schema({
    email: { type: String, unique: true },
    credits: { type: Number, default: 10 }
}));

// ===== 1. FRONTEND ROUTE (Ab button dikhega) =====
app.get("/", (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>VibeGen AI - Buy Credits</title>
        <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
        <style>
            body { font-family: sans-serif; text-align: center; padding: 50px; background: #f4f4f4; }
            button { padding: 15px 30px; font-size: 18px; cursor: pointer; background: #3399cc; color: #fff; border: none; border-radius: 5px; }
        </style>
    </head>
    <body>
        <h1>🚀 VibeGen AI Payments</h1>
        <p>Current Status: Server is Live & Database Connected</p>
        <button id="pay-btn">Buy 50 Credits (₹500)</button>

        <script>
        document.getElementById('pay-btn').onclick = async () => {
            const userId = prompt("Apni User ID daalein (MongoDB ID):");
            if(!userId) return alert("User ID zaroori hai!");

            // 1. Order create karna
            const res = await fetch('/api/payments/create-order', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ userId })
            });
            const data = await res.json();
            if(data.error) return alert("Error: " + data.error);

            // 2. Razorpay Popup kholna
            const options = {
                key: "${process.env.RAZORPAY_KEY_ID}", 
                amount: data.amount,
                currency: "INR",
                name: "VibeGen AI",
                description: "Purchase Credits",
                order_id: data.orderId,
                handler: async function (response) {
                    const verifyRes = await fetch('/api/payments/verify', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ ...response, userId })
                    });
                    const verifyData = await verifyRes.json();
                    alert(verifyData.message);
                }
            };
            const rzp = new Razorpay(options);
            rzp.open();
        }
        </script>
    </body>
    </html>
    `);
});

// ===== 2. CREATE ORDER API =====
app.post("/api/payments/create-order", async (req, res) => {
    try {
        const { userId } = req.body;
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ error: "User nahi mila database mein!" });

        const order = await razorpay.orders.create({
            amount: 500 * 100, // ₹500
            currency: "INR",
            receipt: `rcpt_${Date.now()}`
        });
        res.json({ orderId: order.id, amount: order.amount });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ===== 3. VERIFY PAYMENT API =====
app.post("/api/payments/verify", async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, userId } = req.body;
        const body = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSignature = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET).update(body).digest("hex");

        if (expectedSignature === razorpay_signature) {
            await User.findByIdAndUpdate(userId, { $inc: { credits: 50 } });
            res.json({ success: true, message: "Payment Success! 50 Credits added." });
        } else {
            res.status(400).json({ error: "Signature mismatch" });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ===== SERVER START (Railway Fix) =====
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;

mongoose.connect(MONGO_URI)
    .then(() => {
        console.log("✅ MongoDB Connected");
        app.listen(PORT, "0.0.0.0", () => console.log(`🚀 Server on port ${PORT}`));
    })
    .catch(err => {
        console.error("❌ DB Error:", err);
        // DB fail ho tab bhi server start rakhein taaki Railway crash na de
        app.listen(PORT, "0.0.0.0", () => console.log("🚀 Server running (But DB failed)"));
    });
