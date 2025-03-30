require('dotenv').config();

// Initialize a single Twilio client with more flexible environment variable handling
const accountSid = process.env.TWILIO_ACCOUNT_SID || process.env.TWILIO_ACCOUNT_SID_ || process.env.TWILIO_ACCOUNT_SID_1;
const authToken = process.env.TWILIO_AUTH_TOKEN || process.env.TWILIO_AUTH_TOKEN_ || process.env.TWILIO_AUTH_TOKEN_1;

console.log('Using Twilio credentials:', { 
    accountSid: accountSid ? ' Found' : ' Missing', 
    authToken: authToken ? ' Found' : ' Missing' 
});

const twilioClient = require('twilio')(accountSid, authToken);

// Function to fetch the Twilio WhatsApp sandbox number
async function getWhatsAppSandboxNumber() {
    try {
        console.log('Fetching WhatsApp sandbox info from Twilio API...');
        
        // Fetch the sandbox info from Twilio API
        const sandbox = await twilioClient.messaging.v1.services('MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')
            .fetch();
            
        return sandbox.inboundMethod === 'POST' ? 
            sandbox.inboundRequestUrl : 
            'whatsapp:+unknown'; // Return unknown if API call doesn't return expected data
    } catch (error) {
        console.error('Error fetching WhatsApp sandbox info:', error);
        return 'whatsapp:+unknown';
    }
}

// Alternate method to fetch the WhatsApp sandbox phone number
async function getWhatsAppPhoneNumber() {
    try {
        console.log('Fetching WhatsApp phone number from Twilio API...');
        
        // Get information about recent messages to find the FROM number
        const messages = await twilioClient.messages.list({
            limit: 10
        });
        
        // Find the first WhatsApp message sent from our system
        const outboundMsg = messages.find(msg => 
            msg.direction === 'outbound-api' && 
            msg.from && 
            msg.from.startsWith('whatsapp:')
        );
        
        if (outboundMsg && outboundMsg.from) {
            console.log('Found WhatsApp FROM number from recent messages:', outboundMsg.from);
            return outboundMsg.from;
        } else {
            console.warn('No recent outbound messages found');
            return 'whatsapp:+unknown';
        }
    } catch (error) {
        console.error('Error fetching WhatsApp phone number:', error);
        return 'whatsapp:+unknown';
    }
}

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

// Function to get all WhatsApp sandbox participants
async function getSandboxParticipants() {
    try {
        console.log('Fetching WhatsApp sandbox participants from Twilio API...');
        
        // Get all inbound participants from the Twilio conversation/WhatsApp
        const inboundNumbers = new Set();
        
        // Fetch recent messages to identify active participants
        const messages = await twilioClient.messages.list({
            limit: 100 // Fetch last 100 messages to find participants
        });
        
        // Extract unique WhatsApp numbers that have sent messages to our system
        messages.forEach(message => {
            // Only consider WhatsApp messages
            if (message.from && message.from.startsWith('whatsapp:')) {
                inboundNumbers.add(message.from);
            }
        });
        
        const participants = Array.from(inboundNumbers);
        
        if (participants.length === 0) {
            console.warn('No WhatsApp participants found in recent messages!');
            console.warn('Make sure users have joined your sandbox by sending a message first.');
        } else {
            console.log('Found WhatsApp participants:', participants);
        }
        
        return participants;
    } catch (error) {
        console.error('Error fetching WhatsApp participants:', error);
        return [];
    }
}

app.post('/twilio-webhook', async (req, res) => {
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
    
    // Get the FROM number dynamically from the Twilio API
    const fromNumber = await getWhatsAppPhoneNumber();
    let responseMsg = '';

    console.log(`Received message from ${from}: ${incomingMsg}`);
    console.log(`Will respond using Twilio number: ${fromNumber}`);

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

    // Remove the message showing FROM number
    // const fromNumberFormatted = fromNumber ? fromNumber.replace('whatsapp:', '') : 'Unknown';
    // responseMsg += `\n\n_Message sent from: ${fromNumberFormatted}_`;

    // Send the response
    twilioClient.messages
        .create({
            body: responseMsg,
            from: fromNumber,
            to: from
        })
        .then(message => console.log(`Message sent with SID: ${message.sid}`))
        .catch(error => console.error(`Error sending message: ${error}`));

    res.status(200).end();
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, async () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Webhook URL: ${process.env.WEBHOOK_URL}`);
    
    // Get FROM number dynamically from the Twilio API
    const fromNumber = await getWhatsAppPhoneNumber();
    console.log(`Twilio WhatsApp FROM number: ${fromNumber}`);
    
    // Get all sandbox participants as recipients
    const recipients = await getSandboxParticipants();
    
    // Send startup messages to all recipients
    recipients.forEach(recipient => {
        // Remove the message showing FROM number formatting
        // const fromNumberFormatted = fromNumber ? fromNumber.replace('whatsapp:', '') : 'Unknown';
        
        twilioClient.messages
            .create({
                body: `Valuation Bot is now online! Send /help for instructions.`,
                from: fromNumber,
                to: recipient
            })
            .then(message => console.log(`Startup message sent to ${recipient} with SID: ${message.sid}`))
            .catch(error => console.error(`Error sending startup message to ${recipient}: ${error}`));
    });
});