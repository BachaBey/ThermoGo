import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SYSTEM_PROMPT = `You are an environmental health advisor for a medical IoT temperature and humidity monitoring system called ThermoGo.

Your role is to analyse sensor data and provide concise, factual, medically-relevant insights.

Reference guidelines (apply in this priority order):
1. USER-CONFIGURED thresholds — always treat the user's own target and tolerance values as the primary definition of "acceptable". Flag any breach immediately.
2. WHO pharmaceutical storage: 15–25°C, humidity < 60%.
3. Cold chain / vaccine storage: 2–8°C.
4. General comfort / habitation range: 18–24°C, 40–60% humidity.

Behaviour rules:
- Be concise (3–6 sentences max unless a detailed breakdown is clearly needed).
- Always flag if current or recent conditions violate the user's configured thresholds first, then flag general medical guideline breaches.
- Explain observable patterns (time-of-day spikes, upward/downward trends, sudden step changes) with likely real-world causes (HVAC cycles, door openings, ambient weather, equipment faults).
- Give at least one specific, actionable recommendation when conditions are outside acceptable range.
- If there is insufficient data (fewer than 3 readings), say so and advise the user to wait for more data before drawing conclusions.
- Do not speculate beyond what the data supports.`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { device_id, question } = await req.json()

    if (!device_id || !question) {
      return new Response(
        JSON.stringify({ error: 'device_id and question are required.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // ── Verify caller identity from JWT ──────────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Use anon client scoped to the caller's JWT to resolve their user id
    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user }, error: userError } = await anonClient.auth.getUser()
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired session.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // ── 1. Fetch device and verify ownership ──────────────────────────────────
    const { data: device, error: deviceError } = await supabase
      .from('devices')
      .select('name, user_id, target_temp, target_humidity, threshold_temp, threshold_humidity')
      .eq('id', device_id)
      .single()

    if (deviceError) throw new Error(`Device not found: ${deviceError.message}`)

    if (device.user_id !== user.id) {
      return new Response(
        JSON.stringify({ error: 'Access denied.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // ── 2. Fetch all available readings (newest first, max 2000) ─────────────
    const { data: readings, error: readingsError } = await supabase
      .from('sensor_readings')
      .select('temperature, humidity, created_at')
      .eq('device_id', device_id)
      .order('created_at', { ascending: false })
      .limit(2000)

    if (readingsError) throw new Error(`Failed to fetch readings: ${readingsError.message}`)

    const allReadings = readings ?? []

    // ── 3. Compute stats over all available data ──────────────────────────────
    const temps  = allReadings.map(r => Number(r.temperature)).filter(t => !isNaN(t))
    const humids = allReadings.map(r => Number(r.humidity)).filter(h => !isNaN(h))

    const stats = (arr: number[]) =>
      arr.length === 0
        ? null
        : {
            min: Math.min(...arr),
            avg: arr.reduce((a, b) => a + b, 0) / arr.length,
            max: Math.max(...arr),
          }

    const tempStats  = stats(temps)
    const humidStats = stats(humids)

    const oldest = allReadings.length > 0 ? allReadings[allReadings.length - 1].created_at : null
    const newest = allReadings.length > 0 ? allReadings[0].created_at : null

    // ── 4. Build 50 evenly-spaced samples across the full data range ──────────
    const sampleCount = Math.min(50, allReadings.length)
    const step = allReadings.length > 1 ? Math.floor(allReadings.length / sampleCount) : 1
    const sampled = allReadings
      .filter((_, i) => i % step === 0)
      .slice(0, sampleCount)
      .reverse()

    const readingsText =
      sampled.length > 0
        ? sampled
            .map(r => `${r.created_at}: ${Number(r.temperature).toFixed(1)}°C  ${Number(r.humidity).toFixed(0)}%`)
            .join('\n')
        : '(no readings available)'

    // ── 5. Assemble user message ──────────────────────────────────────────────
    const configLine =
      [
        device.target_temp != null
          ? `Temperature target: ${device.target_temp}°C ±${device.threshold_temp ?? '?'}°C`
          : null,
        device.target_humidity != null
          ? `Humidity target: ${device.target_humidity}% ±${device.threshold_humidity ?? '?'}%`
          : null,
      ]
        .filter(Boolean)
        .join(' | ') || 'No targets configured'

    const statsText = [
      tempStats
        ? `Temperature — min: ${tempStats.min.toFixed(1)}°C, avg: ${tempStats.avg.toFixed(1)}°C, max: ${tempStats.max.toFixed(1)}°C`
        : 'Temperature — no data',
      humidStats
        ? `Humidity    — min: ${humidStats.min.toFixed(0)}%, avg: ${humidStats.avg.toFixed(0)}%, max: ${humidStats.max.toFixed(0)}%`
        : 'Humidity — no data',
    ].join('\n')

    const dataRange = oldest && newest
      ? `from ${oldest} to ${newest}`
      : 'no data available'

    const userMessage = `Device configuration: ${configLine}

All available data: ${allReadings.length} readings (${dataRange})
${statsText}

${sampled.length} evenly-spaced samples across the full data range (oldest → newest):
${readingsText}

User question: ${question}`

    // ── 6. Call Gemini API ────────────────────────────────────────────────────
    const geminiKey = Deno.env.get('GEMINI_API_KEY')!
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`

    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: SYSTEM_PROMPT }],
        },
        contents: [
          { role: 'user', parts: [{ text: userMessage }] },
        ],
        generationConfig: { maxOutputTokens: 8192 },
      }),
    })

    if (!geminiRes.ok) {
      const errBody = await geminiRes.text()
      console.error(`[ask-ai] Gemini error ${geminiRes.status}:`, errBody)
      throw new Error(`Gemini API error ${geminiRes.status}: ${errBody}`)
    }

    const geminiData = await geminiRes.json()
    const answer = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? 'No response received.'

    return new Response(JSON.stringify({ answer }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[ask-ai] Fatal error:', message)
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
