require('dotenv').config();
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

// Function to format calculation result
function formatCalculation(buffPrice, percentage, exchangeRate, offer) {
    return `Buff Price: ${buffPrice}\nPercentage: ${(percentage * 100).toFixed(1)}%\nExchange Rate: ${exchangeRate}\nOffer: SGD ${offer.toFixed(2)}\n`;
}

app.post('/twilio-webhook', (req, res) => {
    console.log('Received webhook request:', {
        headers: req.headers,
        body: req.body
    });
    
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
        const lines = incomingMsg.split('\n').map(line => line.trim());
        let calculations = [];
        let currentExchangeRate = DEFAULT_EXCHANGE_RATE;
        let currentPercentage = DEFAULT_PERCENTAGE;

        // Process first line for potential parameters
        const firstLine = lines[0].split(' ').filter(part => part.trim() !== '');
        
        // Check for exchange rate parameter (e.g., /calculate rate=5.45)
        const rateParam = firstLine.find(param => param.toLowerCase().startsWith('rate='));
        if (rateParam) {
            const rate = parseFloat(rateParam.split('=')[1]);
            if (!isNaN(rate) && rate > 0) {
                currentExchangeRate = rate;
            }
        }

        // Check for percentage parameter (e.g., /calculate p=92.5)
        const percentParam = firstLine.find(param => param.toLowerCase().startsWith('p='));
        if (percentParam) {
            const percent = parseFloat(percentParam.split('=')[1]);
            if (!isNaN(percent) && percent > 0 && percent <= 100) {
                currentPercentage = percent / 100;
            }
        }

        // Process each line for calculations
        lines.forEach(line => {
            const parts = line.split(' ').filter(part => part.trim() !== '');
            parts.forEach(part => {
                const price = parseFloat(part);
                if (!isNaN(price) && price > 0) {
                    const offer = calculateOffer(price, currentPercentage, currentExchangeRate);
                    calculations.push({
                        text: formatCalculation(price, currentPercentage, currentExchangeRate, offer),
                        offer: offer.toFixed(2)
                    });
                }
            });
        });

        if (calculations.length > 0) {
            responseMsg = `*Price Calculations*\n\n${calculations.map(calc => calc.text).join('\n')}`;
            if (calculations.length > 1) {
                const allOffers = calculations.map(calc => calc.offer).join(', ');
                responseMsg += `\nTotal Calculations: ${calculations.length}\nAll Offers: SGD ${allOffers}`;
            }
        } else {
            responseMsg = `Usage:\n/calculate [rate=exchange_rate] [p=percentage] price1\nprice2\nprice3\n\nExamples:\n/calculate 15000\n/calculate rate=5.45 p=92.5 15000\n/calculate 15000\n30000\n45000`;
        }
    } else if (incomingMsg.toLowerCase() === '/help') {
        responseMsg = `*Valuation Bot Help*\n\n- For most items, I offer between 92% - 93.5% of the maximum price.\n\n- To calculate an offer, use:\n/calculate [rate=exchange_rate] [p=percentage] price1\nprice2\nprice3\n\nExamples:\n/calculate 15000 (uses default ${(DEFAULT_PERCENTAGE * 100)}% and rate ${DEFAULT_EXCHANGE_RATE})\n/calculate rate=5.45 p=92.5 15000\n/calculate 15000\n30000\n45000`;
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
    console.log(`Webhook URL: ${process.env.WEBHOOK_URL}`);
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