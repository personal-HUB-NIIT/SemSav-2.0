import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
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

    // 2. Rate Limiting Check (Max 10 summaries per day)
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);

    const { count, error: countError } = await supabaseClient
      .from('action_log')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('action', 'GEMINI_SUMMARIZE')
      .gte('created_at', startOfDay.toISOString());

    if (countError) throw countError;
    if (count !== null && count >= 10) {
      return new Response(JSON.stringify({ error: 'Daily summary limit reached (10/10)' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 3. Get file URL from request
    const { file_url } = await req.json()
    if (!file_url) {
      return new Response(JSON.stringify({ error: 'Missing file_url in request' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Fetch the file from the URL to send to Gemini
    const fileRes = await fetch(file_url)
    if (!fileRes.ok) {
      throw new Error(`Failed to fetch file from URL: ${fileRes.statusText}`)
    }
    const arrayBuffer = await fileRes.arrayBuffer()
    const base64Data = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))
    
    // Determine mime type from URL extension or response headers
    let mimeType = fileRes.headers.get('content-type') || 'application/pdf'
    if (!mimeType.includes('pdf') && !mimeType.includes('image')) {
      // Fallback if not strictly pdf/image
      mimeType = 'application/pdf'
    }

    // 4. Call Gemini API
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not set")
    }

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`
    
    const prompt = `
      You are an expert tutor. Please read the provided document (it's likely lecture notes or a syllabus) and generate a concise, highly readable summary. 
      Format the summary with markdown:
      - A short introductory sentence.
      - 3 to 5 key bullet points highlighting the most important concepts.
      - A brief concluding thought.
    `

    const geminiReqBody = {
      contents: [{
        parts: [
          { text: prompt },
          { inlineData: { mimeType, data: base64Data } }
        ]
      }]
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
      throw new Error("Failed to generate summary with AI")
    }

    const summary = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "No summary could be generated."

    // 5. Log the action and AI usage
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    await serviceClient.from('action_log').insert({
      user_id: user.id,
      action: 'GEMINI_SUMMARIZE'
    })

    await serviceClient.from('ai_usage_log').insert({
      user_id: user.id,
      endpoint: 'summarize',
      latency_ms: latency,
      success: true
    })

    return new Response(JSON.stringify({ summary }), {
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
