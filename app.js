import express from 'express';
import Razorpay from 'razorpay';
import path from 'path';
import fs from 'fs/promises'
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { validateWebhookSignature } from 'razorpay/dist/utils/razorpay-utils.js';


dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename)

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({extended: true}));

app.use(express.static(path.join(__dirname)));

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const readData = async () => {
    try {
        const data = await fs.readFile('orders.json','utf-8');
        return JSON.parse(data);
    } catch(error) {
        //if file doesn't exist return empty array
        if(error.code === 'ENOENT') {
            return [];
        }
        throw error;
    }
};

const writeData = async (data) => {
    await fs.writeFile('orders.json', JSON.stringify(data, null, 2), 'utf-8');
};


// Route to handle order creation
app.post('/create-order', async (req, res) => {
    try {
        const { amount, currency, receipt, notes } = req.body;

        const options = {
            amount: amount* 100,
            currency,
            receipt,
            notes,
        };

        const order = await razorpay.orders.create(options);

        // Read current orders, add new order, and write back to the file
        const orders = await readData();

        orders.push({
            order_id: order.id,
            amount: order.amount,
            currency: order.currency,
            receipt: order.receipt,
            status: 'created',
        });

        await writeData(orders);
        res.json(order);
    } catch (error) {
        console.error(error);
        res.status(500).send('Error creating order');
    }
});

// Route to serve the success page
app.get('/payment-success', async (req, res) => {
    res.sendFile(path.join(__dirname,'success.html'));
});

// Route to handle payment verification
app.post('/verify-payment', async (req, res) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    const secret = razorpay.key_secret;
    const body = razorpay_order_id + '|' + razorpay_payment_id;

    try {
        const isValidSignature = validateWebhookSignature(body, razorpay_signature, secret);
        if(isValidSignature) {
          // Update the order with payment details
          const orders = await readData();
          const order = orders.find(o => o.order_id === razorpay_order_id);
          if(order) {
            order.status = 'paid';
            order.payment_id = razorpay_payment_id;
            await writeData(orders);
          }
          res.status(200).json({status: 'ok'});
          console.log('Payment verification successful');
        } else {
            res.status(400).json({status: 'verification_failed'});
            console.log('Payment verification failed');
        }
    } catch(error) {
        console.error(error);
        res.status(500).json({ status: 'error', message: 'Error verifying payment' });
    }
});

app.get('/get-key', async (req, res) => {
    res.json({key : process.env.RAZORPAY_KEY_ID});
});


app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});