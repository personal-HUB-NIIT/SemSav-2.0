import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    // 1. Verify Authentication
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 2. Rate Limiting Check (Max 5 extractions per day)
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);

    const { count, error: countError } = await supabaseClient
      .from('action_log')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('action', 'GEMINI_EXTRACT')
      .gte('created_at', startOfDay.toISOString());

    if (countError) throw countError;
    if (count !== null && count >= 5) {
      return new Response(JSON.stringify({ error: 'Daily limit reached (5/5)' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 3. Process Request (Multipart Form Data)
    const formData = await req.formData()
    const file = formData.get('file') as File
    
    if (!file) {
      return new Response(JSON.stringify({ error: 'No file uploaded' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Convert file to Base64
    const arrayBuffer = await file.arrayBuffer()
    const base64Data = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))
    
    let mimeType = file.type
    // Gemini supports PDF, PNG, JPEG, WEBP.
    if (!mimeType.includes('pdf') && !mimeType.includes('image')) {
      return new Response(JSON.stringify({ error: 'Unsupported file type for extraction. Please use PDF or Images.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 4. Call Gemini API
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not set")
    }

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`
    
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
    `

    const geminiReqBody = {
      contents: [{
        parts: [
          { text: prompt },
          { inlineData: { mimeType, data: base64Data } }
        ]
      }],
      generationConfig: {
        responseMimeType: "application/json"
      }
    }

    const startTime = Date.now()
    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiReqBody)
    })

    const latency = Date.now() - startTime
    const geminiData = await geminiRes.json()

    if (!geminiRes.ok) {
      console.error("Gemini API Error:", geminiData)
      throw new Error("Failed to process with AI")
    }

    const extractedText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "{}"
    let parsedData = {}
    try {
      parsedData = JSON.parse(extractedText)
    } catch (e) {
      console.error("Failed to parse Gemini JSON:", extractedText)
    }

    // 5. Log the action and AI usage
    // Using service role client to bypass RLS for logging
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    await serviceClient.from('action_log').insert({
      user_id: user.id,
      action: 'GEMINI_EXTRACT'
    })

    await serviceClient.from('ai_usage_log').insert({
      user_id: user.id,
      endpoint: 'extract',
      latency_ms: latency,
      success: true
    })

    return new Response(JSON.stringify(parsedData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error: any) {
    console.error('Edge Function Error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
