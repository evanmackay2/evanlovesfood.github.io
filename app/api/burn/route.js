import OpenAI from "openai";

const openai = new OpenAI();

export async function POST(request) {
  try {
    const { exercises, durationMinutes, profile } = await request.json();

    if (!exercises || exercises.length === 0 || !durationMinutes) {
      throw new Error("Missing workout data");
    }

    const workoutSummary = exercises
      .map((ex) => {
        const sets = (ex.sets || [])
          .map((s) => `${s.weight || "?"} lbs x ${s.reps || "?"} reps`)
          .join(", ");
        return `- ${ex.exercise}: ${sets}`;
      })
      .join("\n");

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: `Estimate the calories burned during this workout session.

PERSON:
- Weight: ${profile?.weightLb || "unknown"} lbs
- Age: ${profile?.age || "unknown"}
- Gender: ${profile?.gender || "unknown"}

WORKOUT (total duration: ${durationMinutes} minutes, including rest between sets):
${workoutSummary}

Rules:
- This is resistance training unless the exercise names clearly indicate cardio
- Resistance training burns roughly 3-6 kcal per minute for most people, scaled by
  body weight, workout density, and load; be realistic, NOT optimistic
- Duration includes rest periods, which burn little
- Consider total volume (weight x reps) as a signal of workout intensity
- A typical 45-60 min lifting session burns roughly 150-350 kcal for most people

Respond ONLY with a valid JSON object:
{"calories": number, "explanation": string}

"calories" is your single best estimate for the whole session.
"explanation" is one short sentence of reasoning.`,
        },
      ],
    });

    const data = JSON.parse(completion.choices[0].message.content);
    return Response.json({
      calories: Math.max(0, Math.round(data.calories || 0)),
      explanation: data.explanation || "",
    });
  } catch (err) {
    console.error("Burn estimate failed:", err);
    return Response.json(
      { error: "Couldn't estimate calories burned." },
      { status: 400 }
    );
  }
}