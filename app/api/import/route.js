import OpenAI from "openai";
import { fetchTranscript } from "youtube-transcript-plus";

const openai = new OpenAI();

const RECIPE_SCHEMA_PROMPT = `Respond ONLY with a valid JSON object in this exact schema:
{"title": string, "servings": number, "prepMinutes": number,
 "ingredients": [{"name": string, "amount": number or null, "unit": string or null,
   "category": "produce"|"protein"|"dairy"|"grains"|"pantry"|"spices"|"other"}],
 "steps": [string],
 "perServing": {"calories": number, "protein_g": number, "carbs_g": number, "fat_g": number}}
Estimate per-serving macros carefully from the ingredients. Keep ingredient
names short and generic (e.g. "chicken breast"). If servings aren't stated,
estimate them.`;

// ---- Transcript: direct from YouTube (free, works on localhost) ----
async function getTranscriptDirect(url) {
  const transcript = await fetchTranscript(url);
  return transcript.map((t) => t.text).join(" ");
}

// ---- Transcript: Supadata universal endpoint (YouTube, TikTok, Instagram) ----
async function getTranscriptSupadata(url) {
  const res = await fetch(
    `https://api.supadata.ai/v1/transcript?url=${encodeURIComponent(url)}&text=true`,
    { headers: { "x-api-key": process.env.SUPADATA_API_KEY } }
  );
  if (!res.ok) throw new Error(`Supadata failed: ${res.status}`);
  const data = await res.json();
  return data.content;
}

// ---- Webpage: fetch the page and strip it down to readable text ----
async function getWebpageText(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    },
  });
  if (!res.ok) throw new Error(`Page fetch failed: ${res.status}`);
  const html = await res.text();
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function POST(request) {
  try {
    const { url } = await request.json();
    if (!url || !/^https?:\/\//i.test(url.trim())) {
      throw new Error("Not a valid link");
    }
    const cleanUrl = url.trim();

    const isYouTube = /youtube\.com|youtu\.be/i.test(cleanUrl);
    const isSocial = /tiktok\.com|instagram\.com/i.test(cleanUrl);

    let text;
    let sourceLabel;

    if (isYouTube) {
      sourceLabel = "cooking video transcript";
      try {
        text = await getTranscriptDirect(cleanUrl);
      } catch (e) {
        console.log("Direct fetch failed, trying Supadata fallback...");
        text = await getTranscriptSupadata(cleanUrl);
      }
    } else if (isSocial) {
      sourceLabel = "cooking video transcript";
      text = await getTranscriptSupadata(cleanUrl);
    } else {
      sourceLabel = "recipe webpage text (may contain unrelated site text - ignore navigation, ads, and comments)";
      text = await getWebpageText(cleanUrl);
    }

    if (!text || text.length < 50) {
      throw new Error("No usable text found at that link");
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: `Extract the recipe from this ${sourceLabel}.
${RECIPE_SCHEMA_PROMPT}

CONTENT: ${text.slice(0, 14000)}`,
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
          "Couldn't import from that link. Videos need captions/audio, and some sites block automated access - try another link.",
      },
      { status: 400 }
    );
  }
}