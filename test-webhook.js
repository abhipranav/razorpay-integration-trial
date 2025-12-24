import crypto from 'crypto';
import http from 'http';
import fs from 'fs/promises';

// Configuration
const SECRET = 'test_secret';
const PORT = 3000;

// Mock Payload
const payload = {
    "entity": "event",
    "account_id": "acc_BFQ7uQEaa7j2z7",
    "event": "payment.captured",
    "contains": [
        "payment"
    ],
    "payload": {
        "payment": {
            "entity": {
                "id": "pay_test_payment_id",
                "entity": "payment",
                "amount": 50000,
                "currency": "INR",
                "status": "captured",
                "order_id": "order_test_order_id", // We will update this dynamically
                "invoice_id": null,
                "international": false,
                "method": "card",
                "amount_refunded": 0,
                "refund_status": null,
                "captured": true,
                "description": "Test Transaction",
                "card_id": "card_test_card_id",
                "bank": null,
                "wallet": null,
                "vpa": null,
                "email": "test@example.com",
                "contact": "+919999999999"
            }
        }
    },
    "created_at": 1567674797
};

async function createTestOrder() {
    // Manually add a test order to orders.json since we can't easily rely on Razorpay API to create one without valid credentials.
    // We will append a dummy order to orders.json directly so the webhook has something to update.
    
    // Read existing orders
    let orders = [];
    try {
        const data = await fs.readFile('orders.json', 'utf-8');
        orders = JSON.parse(data);
    } catch (e) {
        if (e.code !== 'ENOENT') throw e;
    }

    const testOrderId = `order_${Date.now()}`;
    const newOrder = {
        order_id: testOrderId,
        amount: 50000,
        currency: "INR",
        receipt: "test_receipt",
        status: "created"
    };

    orders.push(newOrder);
    await fs.writeFile('orders.json', JSON.stringify(orders, null, 2));
    console.log(`Created test order: ${testOrderId}`);
    
    return testOrderId;
}

async function verifyOrderUpdate(orderId) {
    const data = await fs.readFile('orders.json', 'utf-8');
    const orders = JSON.parse(data);
    const order = orders.find(o => o.order_id === orderId);
    
    if (order && order.status === 'paid' && order.webhook_received) {
        console.log('SUCCESS: Order updated correctly via webhook!');
    } else {
        console.error('FAILURE: Order not updated correctly.');
        console.log('Order state:', order);
    }
}

async function sendWebhook(orderId) {
    // Update payload with dynamic order ID
    payload.payload.payment.entity.order_id = orderId;
    
    const body = JSON.stringify(payload);
    const signature = crypto.createHmac('sha256', SECRET)
                            .update(body)
                            .digest('hex');

    const options = {
        hostname: 'localhost',
        port: PORT,
        path: '/webhook',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Razorpay-Signature': signature,
            'Content-Length': body.length
        }
    };

    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                console.log(`Webhook response: ${res.statusCode} ${data}`);
                resolve(res.statusCode === 200);
            });
        });

        req.on('error', (e) => {
            console.error(`Problem with request: ${e.message}`);
            reject(e);
        });

        req.write(body);
        req.end();
    });
}

async function run() {
    try {
        const orderId = await createTestOrder();
        await sendWebhook(orderId);
        // Wait a bit for file write to complete
        await new Promise(r => setTimeout(r, 1000));
        await verifyOrderUpdate(orderId);
    } catch (e) {
        console.error(e);
    }
}

run();
