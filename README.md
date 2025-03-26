# Basic Whatsapp-Twilio Bot

A WhatsApp bot that calculates item valuations based on Buff prices and exchange rates, built with Node.js, Express, and the Twilio API.

## Features

- Calculate item valuations based on Buff prices
- Customize percentage rates for calculations
- Automatic currency conversion (CNY to SGD)
- Accessible via WhatsApp messaging

## Commands

- `/calculate [Buff Price] [Percentage (optional)]` - Calculate an offer based on the Buff price
- `/help` - Display help information and usage instructions

## Examples

```
/calculate 15000
```
Calculates an offer using the default percentage (93%)

```
/calculate 15000 92.5
```
Calculates an offer using a custom percentage (92.5%)

## Setup

1. Clone this repository
2. Install dependencies:
   ```
   npm install
   ```
3. Set up your environment variables in a `.env` file:
   ```
   TWILIO_ACCOUNT_SID=your_account_sid
   TWILIO_AUTH_TOKEN=your_auth_token
   ```
4. Start the server:
   ```
   npm run dev
   ```

## Webhook Setup

To receive WhatsApp messages, you need to expose your local server to the internet. You can use tools like ngrok:

```
ngrok http 8080
```

Then update your Twilio WhatsApp Sandbox webhook URL to point to your ngrok URL + `/twilio-webhook`

## Technologies Used

- Node.js
- Express.js
- Twilio API for WhatsApp messaging
- Body-parser for request parsing
