import OpenAI from "openai";
import { fetchTranscript } from "youtube-transcript-plus";

const openai = new OpenAI(); // reads OPENAI_API_KEY from .env.local automatically

export async function POST(request) {
  try {
    const { url } = await request.json();

    // 1. Pull the transcript from the YouTube link
    const transcript = await fetchTranscript(url);
    const text = transcript.map((t) => t.text).join(" ");

    // 2. Turn the transcript into a structured recipe
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
      {
        error:
          "Couldn't import that video. Make sure it's a valid YouTube link and the video has captions.",
      },
      { status: 400 }
    );
  }
}
