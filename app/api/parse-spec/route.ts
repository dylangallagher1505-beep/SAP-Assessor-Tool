import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

const client = new Anthropic()

const SYSTEM = `You are a building physics expert. Extract wall/roof/floor construction layers from the provided text or image spec sheet.

Return ONLY a JSON object in this exact shape:
{
  "heatFlowDirection": "horizontal" | "upward" | "downward",
  "layers": [
    {
      "description": "string",
      "thickness_mm": number | null,
      "lambda": number | null,
      "resistance": number | null,
      "notes": "string"
    }
  ]
}

Rules:
- heatFlowDirection: "horizontal" for walls, "upward" for floors/ground, "downward" for roofs/ceilings
- For each layer include EITHER lambda (conductivity W/mK) OR resistance (fixed R m²K/W), not both
- Air gaps / cavities: use resistance value (unventilated 25mm+ gap ≈ 0.18, 50mm batten void ≈ 0.13, ventilated cladding void = 0.13)
- Surface resistances (Rsi, Rse) should NOT be included — add them automatically
- If lambda or resistance is unknown, use null and add a note
- Common values: plasterboard 0.21, OSB 0.13, plywood 0.13, timber 0.13, concrete block 0.79, brick 0.77, mineral wool 0.035-0.044, PIR 0.022-0.025, Kooltherm 0.018-0.020, zinc cladding 110, steel 50, VCL/membrane ≈ 0
- Do not include the surface resistance layers in the output`

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { text, imageBase64, mediaType } = body

    const content: Anthropic.MessageParam['content'] = []

    if (imageBase64 && mediaType) {
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: mediaType, data: imageBase64 },
      })
    }

    if (text) {
      content.push({ type: 'text', text })
    }

    content.push({
      type: 'text',
      text: 'Extract the construction layers and return the JSON as instructed.',
    })

    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: SYSTEM,
      messages: [{ role: 'user', content }],
    })

    const raw = msg.content[0].type === 'text' ? msg.content[0].text : ''
    // Strip markdown fences if present
    const json = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
    const parsed = JSON.parse(json)
    return NextResponse.json(parsed)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
