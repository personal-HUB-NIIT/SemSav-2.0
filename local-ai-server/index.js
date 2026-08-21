require('dotenv').config({ path: '../supabase/.env.local' });
require('dotenv').config({ path: '../.env.local' });

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });

// Fetch Supabase variables (since they might be in Vite format)
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseAnonKey; // fallback
const geminiApiKey = process.env.GEMINI_API_KEY;

if (!geminiApiKey) {
  console.error("❌ GEMINI_API_KEY is not set in supabase/.env.local");
}

const verifyUser = async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return { error: 'No authorization header', status: 401 };

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { error: 'Unauthorized', status: 401 };
  
  return { user, supabase };
};

const enforceRateLimit = async (user, action, limit) => {
  const serviceClient = createClient(supabaseUrl, supabaseServiceKey);
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const { count, error } = await serviceClient
    .from('action_log')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('action', action)
    .gte('created_at', startOfDay.toISOString());

  if (error) throw error;
  if (count !== null && count >= limit) {
    throw new Error(`Daily limit reached (${limit}/${limit})`);
  }
  return serviceClient;
};

// ==========================================
// AI EXTRACT
// ==========================================
app.post('/api/ai-extract', upload.single('file'), async (req, res) => {
  try {
    const auth = await verifyUser(req, res);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    const serviceClient = await enforceRateLimit(auth.user, 'GEMINI_EXTRACT', 5);

    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const base64Data = req.file.buffer.toString('base64');
    const mimeType = req.file.mimetype;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`;
    
    const prompt = `
      You are an assistant for a college student portal. 
      The user has uploaded a document (it could be syllabus, lecture notes, assignment, or test schedule).
      Extract the following information:
      1. title: A concise, descriptive title (e.g. "Unit 1-3 Syllabus", "Assignment 2 - Sorting", "Mid Sem Schedule").
      2. test_type: If it is a test/exam schedule, specify one of: "MID_SEM", "QUIZ", "LAB_TEST", "VIVA", "RESCHEDULED". If it's not a test, return null.
      3. room_no: If it mentions a room number or venue, extract it. Otherwise null.
      4. due_date_time: If there is a deadline or exam time, extract it as an ISO8601 string (e.g. "2024-10-15T14:30:00"). Otherwise null.
      
      Return ONLY a raw JSON object with no markdown formatting.
      Format:
      {
        "title": "...",
        "test_type": "...",
        "room_no": "...",
        "due_date_time": "..."
      }
    `;

    const startTime = Date.now();
    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inlineData: { mimeType, data: base64Data } }
          ]
        }],
        generationConfig: { responseMimeType: "application/json" }
      })
    });

    const geminiData = await geminiRes.json();
    const latency = Date.now() - startTime;

    if (!geminiRes.ok) throw new Error("Gemini API Error");

    const extractedText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    let parsedData = {};
    try { parsedData = JSON.parse(extractedText); } catch (e) {}

    await serviceClient.from('action_log').insert({ user_id: auth.user.id, action: 'GEMINI_EXTRACT' });
    await serviceClient.from('ai_usage_log').insert({ user_id: auth.user.id, endpoint: 'extract', latency_ms: latency, success: true });

    res.json(parsedData);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// AI SUMMARIZE
// ==========================================
app.post('/api/ai-summarize', async (req, res) => {
  try {
    const auth = await verifyUser(req, res);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    const serviceClient = await enforceRateLimit(auth.user, 'GEMINI_SUMMARIZE', 10);

    const { file_url } = req.body;
    if (!file_url) return res.status(400).json({ error: 'Missing file_url' });

    const fileRes = await fetch(file_url);
    if (!fileRes.ok) throw new Error("Failed to fetch file from URL");

    const arrayBuffer = await fileRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Data = buffer.toString('base64');
    let mimeType = fileRes.headers.get('content-type') || 'application/pdf';

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`;
    
    const prompt = `
      You are an expert tutor. Please read the provided document (it's likely lecture notes or a syllabus) and generate a concise, highly readable summary. 
      Format the summary with markdown:
      - A short introductory sentence.
      - 3 to 5 key bullet points highlighting the most important concepts.
      - A brief concluding thought.
    `;

    const startTime = Date.now();
    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inlineData: { mimeType, data: base64Data } }
          ]
        }]
      })
    });

    const geminiData = await geminiRes.json();
    const latency = Date.now() - startTime;

    if (!geminiRes.ok) throw new Error("Gemini API Error");

    const summary = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "No summary could be generated.";

    await serviceClient.from('action_log').insert({ user_id: auth.user.id, action: 'GEMINI_SUMMARIZE' });
    await serviceClient.from('ai_usage_log').insert({ user_id: auth.user.id, endpoint: 'summarize', latency_ms: latency, success: true });

    res.json({ summary });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`🚀 Local AI Server running at http://localhost:${PORT}`);
});
