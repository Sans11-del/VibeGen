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
app.use(helmet());

// ===== ENV CHECK =====
if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    console.error("❌ Razorpay keys missing in .env");
    process.exit(1);
}

// ===== RAZORPAY =====
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// ===== DB CONNECT =====
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("✅ MongoDB Connected"))
.catch(err => {
    console.error("❌ DB Error:", err);
    process.exit(1);
});

// ===== USER MODEL =====
const User = mongoose.model("User", new mongoose.Schema({
    email: { type: String, unique: true },
    credits: { type: Number, default: 10 }
}));

// ===== CREATE ORDER =====
app.post("/api/payments/create-order", async (req, res) => {
    try {
        const { userId } = req.body;

        if (!userId) return res.status(400).json({ error: "UserId required" });

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ error: "User not found" });

        let finalAmount = 500;
        const isWednesday = new Date().getDay() === 3;

        if (isWednesday) finalAmount *= 0.79;

        const order = await razorpay.orders.create({
            amount: Math.round(finalAmount * 100),
            currency: "INR",
            receipt: `rcpt_${userId}_${Date.now()}`,
            notes: { userId }
        });

        res.json({
            orderId: order.id,
            amount: order.amount,
            currency: order.currency,
            msg: isWednesday ? "21% Discount Applied!" : "Standard Price"
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ===== PAYMENT VERIFY =====
app.post("/api/payments/verify", async (req, res) => {
    try {
        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature
        } = req.body;

        const body = razorpay_order_id + "|" + razorpay_payment_id;

        const expectedSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(body.toString())
            .digest("hex");

        if (expectedSignature !== razorpay_signature) {
            return res.status(400).json({ error: "Invalid signature" });
        }

        // Get userId from DB (optional: store order mapping)
        // For demo: assume sent from frontend
        const { userId } = req.body;

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ error: "User not found" });

        user.credits += 50;
        await user.save();

        res.json({ success: true, message: "Payment verified & credits added" });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ===== FRONTEND =====
app.get("/", (req, res) => {
    res.send(`
    <html>
    <head>
        <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
    </head>
    <body style="text-align:center; padding:50px;">
        <h1>VibeGen AI</h1>
        <button id="pay-btn">Buy 50 Credits</button>

        <script>
        document.getElementById('pay-btn').onclick = async () => {

            const userId = prompt("Enter User ID");

            const res = await fetch('/api/payments/create-order', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ userId })
            });

            const data = await res.json();

            const options = {
                key: "${process.env.RAZORPAY_KEY_ID}",
                amount: data.amount,
                currency: "INR",
                order_id: data.orderId,

                handler: async function (response) {

                    const verifyRes = await fetch('/api/payments/verify', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({
                            ...response,
                            userId
                        })
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

// ===== SERVER =====
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log("🚀 Server running on port " + PORT));
