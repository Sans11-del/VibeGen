require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

// ===== RAZORPAY SETUP =====
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// ===== DB MODEL =====
const userSchema = new mongoose.Schema({
    email: { type: String, unique: true },
    credits: { type: Number, default: 10 }
});
const User = mongoose.model("User", userSchema);

// ===== 1. FRONTEND ROUTE (Ab ID yahi dikhegi!) =====
app.get("/", async (req, res) => {
    // Database se user nikalna ya naya banana
    let testUser = await User.findOne({ email: "test@gmail.com" });
    if (!testUser) {
        testUser = await User.create({ email: "test@gmail.com", credits: 10 });
    }

    res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>VibeGen AI - Testing</title>
        <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
        <style>
            body { font-family: sans-serif; text-align: center; padding: 40px; background: #fdfdfd; }
            .card { background: white; padding: 20px; border-radius: 10px; box-shadow: 0 4px 8px rgba(0,0,0,0.1); display: inline-block; }
            .id-box { background: #eef; padding: 10px; border: 2px dashed #3399cc; font-weight: bold; font-size: 20px; color: #d32f2f; margin: 20px 0; }
            button { padding: 15px 30px; font-size: 18px; cursor: pointer; background: #3399cc; color: #fff; border: none; border-radius: 5px; }
        </style>
    </head>
    <body>
        <div class="card">
            <h1>🚀 VibeGen AI Payment Test</h1>
            <p>Testing ke liye niche di gayi ID copy karein:</p>
            
            <div class="id-box" id="myId">${testUser._id}</div>
            
            <p>Step: "Buy" dabayein aur yahi ID paste karein</p>
            <button id="pay-btn">Buy 50 Credits (₹500)</button>
        </div>

        <script>
        document.getElementById('pay-btn').onclick = async () => {
            const userId = document.getElementById('myId').innerText;
            
            const res = await fetch('/api/payments/create-order', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ userId })
            });
            const data = await res.json();
            
            if(data.error) return alert("Error: " + data.error);

            const options = {
                key: "${process.env.RAZORPAY_KEY_ID}", 
                amount: data.amount,
                currency: "INR",
                name: "VibeGen AI",
                description: "Testing Payment",
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
        if (!user) return res.status(404).json({ error: "User nahi mila!" });

        const order = await razorpay.orders.create({
            amount: 500 * 100, 
            currency: "INR",
            receipt: "rcpt_" + Math.random().toString(36).substring(7)
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
            res.json({ success: true, message: "Badhai ho! Payment Success." });
        } else {
            res.status(400).json({ error: "Signature mismatch" });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ===== SERVER START =====
const PORT = process.env.PORT || 5000;
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        app.listen(PORT, "0.0.0.0", () => console.log(`🚀 Server on port ${PORT}`));
    });
