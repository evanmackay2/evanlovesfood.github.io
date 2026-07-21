import OpenAI from "openai";

const openai = new OpenAI();

const MEAL_PROMPT = `Look at this photo of a meal. Identify the foods and estimate the nutrition of the WHOLE visible meal.
Respond ONLY with a valid JSON object in this exact schema:
{"title": string, "calories": number, "protein_g": number, "carbs_g": number, "fat_g": number}

- "title" is a short readable name listing the main items you see (e.g. "Grilled chicken, rice & broccoli")
- Estimate portion sizes from visual cues (plate size, food depth, typical servings)
- Be realistic, not optimistic
- If you truly cannot identify any food in the image, use the title "Couldn't identify food" with all values 0`;

const RECIPE_PROMPT = `Look at this photo. It is either:
(a) a written recipe - a cookbook page, handwritten recipe card, printed recipe, or a screenshot of a recipe, OR
(b) a photo of a prepared dish.

If it's a written recipe: transcribe it faithfully into the structure below, keeping the original ingredients and steps.
If it's a photo of a dish: identify the dish and construct a reasonable, standard recipe for it.

Respond ONLY with a valid JSON object in this exact schema:
{"title": string, "servings": number, "prepMinutes": number,
 "ingredients": [{"name": string, "amount": number or null, "unit": string or null,
   "category": "produce"|"protein"|"dairy"|"grains"|"pantry"|"spices"|"other"}],
 "steps": [string],
 "perServing": {"calories": number, "protein_g": number, "carbs_g": number, "fat_g": number}}

- Estimate per-serving macros carefully from the ingredients
- Keep ingredient names short and generic (e.g. "chicken breast")
- If servings aren't stated, estimate them
- If you truly cannot find a recipe or dish in the image, use the title "Couldn't read a recipe" with empty ingredients and steps`;

export async function POST(request) {
  try {
    const { image, mode } = await request.json();

    if (!image || !image.startsWith("data:image/")) {
      throw new Error("No image received");
    }

    const prompt = mode === "recipe" ? RECIPE_PROMPT : MEAL_PROMPT;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: image } },
          ],
        },
      ],
    });

    const data = JSON.parse(completion.choices[0].message.content);
    return Response.json(data);
  } catch (err) {
    console.error("Photo analysis failed:", err);
    return Response.json(
      { error: "Couldn't analyze that photo. Try a clearer shot." },
      { status: 400 }
    );
  }
}
