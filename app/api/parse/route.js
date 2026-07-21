import OpenAI from "openai";

const openai = new OpenAI();

export async function POST(request) {
  try {
    const { text } = await request.json();
    if (!text || text.trim().length < 10) {
      throw new Error("Recipe text too short");
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: `A user wrote down their own recipe below. Structure it.
Respond ONLY with a valid JSON object in this exact schema:
{"title": string, "servings": number, "prepMinutes": number,
 "ingredients": [{"name": string, "amount": number or null, "unit": string or null,
   "category": "produce"|"protein"|"dairy"|"grains"|"pantry"|"spices"|"other"}],
 "steps": [string],
 "perServing": {"calories": number, "protein_g": number, "carbs_g": number, "fat_g": number}}

- Keep the user's wording for steps where possible, just cleaned up
- Estimate per-serving macros carefully from the ingredients
- Keep ingredient names short and generic
- If servings aren't stated, estimate them

USER'S RECIPE:
${text.slice(0, 8000)}`,
        },
      ],
    });

    const recipe = JSON.parse(completion.choices[0].message.content);
    return Response.json(recipe);
  } catch (err) {
    console.error("Parse failed:", err);
    return Response.json(
      { error: "Couldn't structure that recipe. Add a bit more detail (ingredients + steps) and try again." },
      { status: 400 }
    );
  }
}