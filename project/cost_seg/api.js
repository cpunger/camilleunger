const express = require('express');
const axios = require('axios');

const router = express.Router();

// Replace with your own Anthropic API key
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

router.post('/anthropic-proxy', async (req, res) => {
    try {
        const response = await axios.post('https://api.anthropic.com/v1/default', req.body, {
            headers: {
                'Authorization': `Bearer ${ANTHROPIC_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });
        res.json(response.data);
    } catch (error) {
        console.error('Error making request to Anthropic API:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

module.exports = router;