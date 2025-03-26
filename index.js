const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = require('twilio')(accountSid, authToken);
const express = require('express');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());  // Add JSON body parser support

// Add a test endpoint
app.get('/test', (req, res) => {
    res.status(200).send('Valuation Bot is running!');
});

// Add a handler for Twilio status callbacks
app.post('/twilio-status', (req, res) => {
    console.log('Received status callback:', req.body);
    res.status(200).end();
});

// Default exchange rate
const DEFAULT_EXCHANGE_RATE = 5.43; // 1 SGD = 5.43
const DEFAULT_PERCENTAGE = 0.93; // 93%

// Function to calculate the offer
function calculateOffer(buffPrice, percentage = DEFAULT_PERCENTAGE, exchangeRate = DEFAULT_EXCHANGE_RATE) {
    return (buffPrice * percentage) / exchangeRate;
}

app.post('/twilio-webhook', (req, res) => {
    // Check if this is a status callback
    if (req.body && req.body.MessageStatus) {
        console.log(`Message ${req.body.MessageSid} status: ${req.body.MessageStatus}`);
        return res.status(200).end();
    }
    
    // Check if this is a message with a body
    if (!req.body || !req.body.Body) {
        console.log('Received request without message body:', req.body);
        return res.status(200).send('No message body found');
    }
    
    const incomingMsg = req.body.Body.trim();
    const from = req.body.From || 'whatsapp:+your_whatsapp_number_here'; // Default fallback
    let responseMsg = '';

    console.log(`Received message from ${from}: ${incomingMsg}`);

    // Check if the message starts with /calculate
    if (incomingMsg.startsWith('/calculate')) {
        const parts = incomingMsg.split(' ').filter(part => part.trim() !== '');
        
        if (parts.length >= 2) {
            const buffPrice = parseFloat(parts[1]);
            
            // Check if a custom percentage is provided
            let percentage = DEFAULT_PERCENTAGE;
            if (parts.length >= 3) {
                const customPercentage = parseFloat(parts[2]) / 100;
                if (!isNaN(customPercentage) && customPercentage > 0 && customPercentage <= 1) {
                    percentage = customPercentage;
                }
            }
            
            if (!isNaN(buffPrice) && buffPrice > 0) {
                const offer = calculateOffer(buffPrice, percentage);
                responseMsg = `*Price Calculation*\n\nBuff Price: ${buffPrice}\nPercentage: ${(percentage * 100).toFixed(1)}%\nExchange Rate: ${DEFAULT_EXCHANGE_RATE}\n\nOffer: SGD ${offer.toFixed(2)}`;
            } else {
                responseMsg = 'Please provide a valid price. Example: /calculate 15000 or /calculate 15000 92.5';
            }
        } else {
            responseMsg = 'Please provide a price to calculate. Example: /calculate 15000 or /calculate 15000 92.5';
        }
    } else if (incomingMsg.toLowerCase() === '/help') {
        responseMsg = `*Valuation Bot Help*\n\n- For most items, I offer between 92% - 93.5% of the maximum price.\n\n- To calculate an offer, use:\n/calculate [Buff Price] [Percentage (optional)]\n\nExamples:\n/calculate 15000 (uses default 93%)\n/calculate 15000 92.5 (uses 92.5%)`;
    } else {
        responseMsg = 'Welcome to the Valuation Bot! Use /calculate [price] to get an offer, or /help for more information.';
    }

    // Send the response
    client.messages
        .create({
            body: responseMsg,
            from: process.env.TWILIO_WHATSAPP_FROM,
            to: from
        })
        .then(message => console.log(`Message sent with SID: ${message.sid}`))
        .catch(error => console.error(`Error sending message: ${error}`));

    res.status(200).end();
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Webhook URL: https://a39a-103-92-41-13.ngrok-free.app/twilio-webhook`);
});

// Send an initial test message
client.messages
    .create({
        body: 'Valuation Bot is now online! Send /help for instructions.',
        from: process.env.TWILIO_WHATSAPP_FROM,
        to: process.env.TWILIO_WHATSAPP_TO
    })
    .then(message => console.log(message.sid))
    .catch(error => console.error(error));