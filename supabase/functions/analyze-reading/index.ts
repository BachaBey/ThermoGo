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
      temperature, humidity,
      target_temp, threshold_temp,
      target_hum,  threshold_hum,
    } = await req.json()

    const hasConfig = target_temp !== undefined && target_temp !== null

    const tempMin  = hasConfig ? target_temp - threshold_temp : 15
    const tempMax  = hasConfig ? target_temp + threshold_temp : 25
    const humMax   = hasConfig ? target_hum  + threshold_hum  : 60
    const humMin   = hasConfig ? target_hum  - threshold_hum  : 30

    const tempHigh = temperature > tempMax
    const tempLow  = temperature < tempMin
    const humHigh  = humidity    > humMax
    const humLow   = humidity    < humMin

    let insight: string
    if      (tempHigh && humHigh) insight = 'Check conditions'
    else if (tempHigh && humLow)  insight = 'Check conditions'
    else if (tempLow  && humHigh) insight = 'Check conditions'
    else if (tempLow  && humLow)  insight = 'Check conditions'
    else if (tempHigh)            insight = 'Temp too high'
    else if (tempLow)             insight = 'Temp too low'
    else if (humHigh)             insight = 'Humidity high'
    else if (humLow)              insight = 'Humidity low'
    else                          insight = 'All good'

    console.log(`[analyze-reading] T=${temperature} H=${humidity} config=${hasConfig} → "${insight}"`)

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
