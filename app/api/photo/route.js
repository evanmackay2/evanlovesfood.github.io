import OpenAI from "openai";

const openai = new OpenAI();

export async function POST(request) {
  try {
    const { image } = await request.json();

    if (!image || !image.startsWith("data:image/")) {
      throw new Error("No image received");
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Look at this photo of a meal. Identify the foods and estimate the nutrition of the WHOLE visible meal.
Respond ONLY with a valid JSON object in this exact schema:
{"title": string, "calories": number, "protein_g": number, "carbs_g": number, "fat_g": number}

- "title" is a short readable name listing the main items you see (e.g. "Grilled chicken, rice & broccoli")
- Estimate portion sizes from visual cues (plate size, food depth, typical servings)
- Be realistic, not optimistic
- If you truly cannot identify any food in the image, use the title "Couldn't identify food" with all values 0`,
            },
            {
              type: "image_url",
              image_url: { url: image },
            },
          ],
        },
      ],
    });

    const meal = JSON.parse(completion.choices[0].message.content);
    return Response.json(meal);
  } catch (err) {
    console.error("Photo analysis failed:", err);
    return Response.json(
      { error: "Couldn't analyze that photo. Try a clearer shot of the meal." },
      { status: 400 }
    );
  }
}