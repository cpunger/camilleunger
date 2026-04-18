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
  const rawText = String(text || '').trim();
  if (!rawText) {
    throw new Error('Model returned an empty response.');
  }

  const tryParse = (candidate) => {
    try {
      return JSON.parse(candidate);
    } catch {
      return null;
    }
  };

  const parseToFindings = (candidate) => {
    const parsed = tryParse(candidate);
    if (!parsed) return null;
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed.findings)) return parsed.findings;
    if (Array.isArray(parsed.data)) return parsed.data;
    return null;
  };

  const cleaned = rawText.replace(/```json|```/g, '').trim();
  const direct = parseToFindings(cleaned);
  if (direct) return { findings: direct, parseStatus: 'clean' };

  // Try content from code fences first.
  const fenceMatches = rawText.match(/```(?:json)?\s*([\s\S]*?)```/gi) || [];
  for (const block of fenceMatches) {
    const inner = block.replace(/```json|```/g, '').trim();
    const parsed = parseToFindings(inner);
    if (parsed) return { findings: parsed, parseStatus: 'auto_corrected' };
  }

  // Try extracting JSON-looking object or array block from mixed text.
  const arrayStart = cleaned.indexOf('[');
  const arrayEnd = cleaned.lastIndexOf(']');
  if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) {
    const parsed = parseToFindings(cleaned.slice(arrayStart, arrayEnd + 1));
    if (parsed) return { findings: parsed, parseStatus: 'auto_corrected' };
  }

  const objectStart = cleaned.indexOf('{');
  const objectEnd = cleaned.lastIndexOf('}');
  if (objectStart !== -1 && objectEnd !== -1 && objectEnd > objectStart) {
    const parsed = parseToFindings(cleaned.slice(objectStart, objectEnd + 1));
    if (parsed) return { findings: parsed, parseStatus: 'auto_corrected' };
  }

  // Last resort: scan all bracketed regions and return the first valid JSON array/object with findings.
  const candidates = [];
  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (ch !== '[' && ch !== '{') continue;
    const closer = ch === '[' ? ']' : '}';
    for (let j = cleaned.length - 1; j > i; j--) {
      if (cleaned[j] !== closer) continue;
      candidates.push(cleaned.slice(i, j + 1));
      if (candidates.length > 120) break;
    }
    if (candidates.length > 120) break;
  }

  for (const candidate of candidates) {
    const parsed = parseToFindings(candidate);
    if (parsed) return { findings: parsed, parseStatus: 'auto_corrected' };
  }

  throw new Error('Model response was not valid JSON array output.');
}

function fallbackFinding() {
  return [{
    item: 'Unable to analyze',
    description: 'Image could not be parsed into structured model output.',
    classification: 'Needs Review',
    confidence: 'Low',
    rationale: 'Model returned malformed JSON format. Manual review recommended.',
    accelerated: false
  }];
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

    const baseMaxTokens = Number(process.env.ANTHROPIC_MAX_TOKENS || 700);
    const headers = {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    };

    const buildPayload = (maxTokens) => ({
      model,
      max_tokens: maxTokens,
      temperature: 0,
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
            text: 'Analyze this photo for cost segregation components. Return only strict valid JSON as an array. Keep it concise: max 8 findings and short rationale. No prose, no markdown, no code fences, no trailing commas.'
          }
        ]
      }]
    });

    const response = await axios.post('https://api.anthropic.com/v1/messages', buildPayload(baseMaxTokens), { headers });
    let text = response.data.content?.map(c => c.text || '').join('') || '';

    const mayBeTruncated = response.data.stop_reason === 'max_tokens';
    if (mayBeTruncated) {
      const retryMaxTokens = Math.min(baseMaxTokens + 300, 1200);
      const retryResponse = await axios.post('https://api.anthropic.com/v1/messages', buildPayload(retryMaxTokens), { headers });
      text = retryResponse.data.content?.map(c => c.text || '').join('') || text;
    }

    let findings;
    let parseStatus = 'clean';
    try {
      const parsed = extractFindingsArray(text);
      findings = parsed.findings;
      parseStatus = parsed.parseStatus;
    } catch (parseError) {
      console.warn('Using fallback finding due to parse error:', parseError.message);
      findings = fallbackFinding();
      parseStatus = 'manual_review';
    }

    res.json({ findings, parseStatus });
  } catch (error) {
    const status = error.response?.status || 500;
    const errorMessage = error.response?.data?.error?.message || error.message;
    const retryAfterHeader = error.response?.headers?.['retry-after'];
    const retryAfterSec = Number.parseInt(retryAfterHeader || '0', 10);
    const retryAfterMs = Number.isFinite(retryAfterSec) && retryAfterSec > 0 ? retryAfterSec * 1000 : 0;

    console.error('Analysis error:', error.response?.data || error.message);
    res.status(status).json({
      error: errorMessage,
      findings: [],
      retryable: status === 429 || status >= 500,
      retryAfterMs
    });
  }
});

const PORT = process.env.PORT || 5050;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
