const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const {
      temperature, humidity, battery,
      target_temp, threshold_temp,
      target_hum,  threshold_hum,
    } = await req.json()

    const hasConfig = target_temp !== undefined && target_temp !== null

    const systemPrompt =
      `You are a status indicator on a tiny medical IoT device OLED screen.
Reply with ONE short phrase — 20 characters maximum, no exceptions.
Assess the environment and pick the most appropriate response:
- Conditions safe:       "Safe" / "All good" / "Within range"
- Temperature too high:  "Temp too high"
- Temperature too low:   "Temp too low"
- Humidity too high:     "Humidity high"
- Humidity too low:      "Humidity low"
- Both out of range:     "Check conditions"
Use the user's configured targets if given, otherwise use WHO guidelines (15-25C, <60% humidity).
Never exceed 20 characters. Output only the phrase, nothing else.`

    const userMsg = hasConfig
      ? `Temp: ${temperature}°C (target ${target_temp}°C ±${threshold_temp}°C)\n` +
        `Humidity: ${humidity}% (target ${target_hum}% ±${threshold_hum}%)\n` +
        `Battery: ${battery}%`
      : `Temp: ${temperature}°C\nHumidity: ${humidity}%\nBattery: ${battery}%`

    const geminiKey = Deno.env.get('GEMINI_API_KEY')!
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`

    const res = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: systemPrompt }],
        },
        contents: [
          { role: 'user', parts: [{ text: userMsg }] },
        ],
        generationConfig: { maxOutputTokens: 30 },
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Gemini error ${res.status}: ${err}`)
    }

    const data    = await res.json()
    const insight = (data.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim().slice(0, 20)

    return new Response(JSON.stringify({ insight }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return new Response(JSON.stringify({ error: message }), {
      status:  500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
