import OpenAI from "openai";
import { fetchTranscript } from "youtube-transcript-plus";

const openai = new OpenAI();

// Plan A: fetch the transcript directly from YouTube (free, works on localhost)
async function getTranscriptDirect(url) {
  const transcript = await fetchTranscript(url);
  return transcript.map((t) => t.text).join(" ");
}

// Plan B: fetch via Supadata (works on Vercel, where YouTube blocks direct requests)
async function getTranscriptSupadata(url) {
  const res = await fetch(
    `https://api.supadata.ai/v1/youtube/transcript?url=${encodeURIComponent(url)}&text=true`,
    { headers: { "x-api-key": process.env.SUPADATA_API_KEY } }
  );
  if (!res.ok) throw new Error(`Supadata failed: ${res.status}`);
  const data = await res.json();
  return data.content;
}

export async function POST(request) {
  try {
    const { url } = await request.json();

    // Try Plan A first; if YouTube blocks us, fall back to Plan B
    let text;
    try {
      text = await getTranscriptDirect(url);
    } catch (e) {
      console.log("Direct fetch failed, trying Supadata fallback...");
      text = await getTranscriptSupadata(url);
    }

    if (!text || text.length < 50) {
      throw new Error("Transcript came back empty");
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: `Extract the recipe from this cooking video transcript.
Respond ONLY with a valid JSON object in this exact schema:
{"title": string, "servings": number, "prepMinutes": number,
 "ingredients": [{"name": string, "amount": number or null, "unit": string or null,
   "category": "produce"|"protein"|"dairy"|"grains"|"pantry"|"spices"|"other"}],
 "steps": [string],
 "perServing": {"calories": number, "protein_g": number, "carbs_g": number, "fat_g": number}}
Estimate per-serving macros carefully from the ingredients. Keep ingredient
names short and generic (e.g. "chicken breast"). If servings aren't stated,
estimate them.

TRANSCRIPT: ${text.slice(0, 12000)}`,
        },
      ],
    });

    const recipe = JSON.parse(completion.choices[0].message.content);
    return Response.json(recipe);
  } catch (err) {
    console.error("Import failed:", err);
    return Response.json(
      { error: "Couldn't import that video. Try another one with captions." },
      { status: 400 }
    );
  }
}