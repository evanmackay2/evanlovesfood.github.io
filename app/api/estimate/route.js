import OpenAI from "openai";

const openai = new OpenAI();

export async function POST(request) {
  try {
    const { description } = await request.json();

    if (!description || description.trim().length < 3) {
      throw new Error("Empty description");
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: `Estimate the nutrition of this meal that a person ate.
Respond ONLY with a valid JSON object in this exact schema:
{"title": string, "calories": number, "protein_g": number, "carbs_g": number, "fat_g": number}

- "title" is a short readable name for the meal (e.g. "Filet, mashed potatoes, salad & Coke")
- Estimate totals for the WHOLE described meal (not per ingredient)
- Use typical restaurant/home portion sizes when amounts aren't given
- Be realistic, not optimistic

MEAL: ${description.slice(0, 2000)}`,
        },
      ],
    });

    const meal = JSON.parse(completion.choices[0].message.content);
    return Response.json(meal);
  } catch (err) {
    console.error("Estimate failed:", err);
    return Response.json(
      { error: "Couldn't estimate that meal. Try describing it with a bit more detail." },
      { status: 400 }
    );
  }
}