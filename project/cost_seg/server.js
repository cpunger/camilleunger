import express from 'express';
import cors from 'cors';
import axios from 'axios';

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

function extractFindingsArray(text) {
  const cleaned = String(text || '').replace(/```json|```/g, '').trim();
  if (!cleaned) {
    throw new Error('Model returned an empty response.');
  }

  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // Try extracting first JSON array block from mixed text
  }

  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start !== -1 && end !== -1 && end > start) {
    const slice = cleaned.slice(start, end + 1);
    const parsed = JSON.parse(slice);
    if (Array.isArray(parsed)) return parsed;
  }

  throw new Error('Model response was not valid JSON array output.');
}

// Anthropic API proxy
app.post('/api/analyze', async (req, res) => {
  try {
    const { image_data, media_type, system_prompt } = req.body;
    const apiKey = process.env.ANTHROPIC_API_KEY;
    const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

    if (!image_data) {
      return res.status(400).json({ error: 'No image data provided.' });
    }
    
    if (!apiKey) {
      return res.status(400).json({ error: 'ANTHROPIC_API_KEY not set on server' });
    }

    const response = await axios.post('https://api.anthropic.com/v1/messages', {
      model,
      max_tokens: 1000,
      system: system_prompt,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: media_type || 'image/jpeg',
              data: image_data
            }
          },
          {
            type: 'text',
            text: 'Analyze this photo for cost segregation components. Return only the JSON array.'
          }
        ]
      }]
    }, {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      }
    });

    const text = response.data.content?.map(c => c.text || '').join('') || '';
    const findings = extractFindingsArray(text);
    res.json({ findings });
  } catch (error) {
    console.error('Analysis error:', error.response?.data || error.message);
    res.status(500).json({ 
      error: error.response?.data?.error?.message || error.message,
      findings: []
    });
  }
});

const PORT = process.env.PORT || 5050;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
