export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const url = new URL(request.url);
    if (url.pathname !== "/classify") {
      return new Response("Not Found", { status: 404 });
    }

    const body = await request.json();

    const prompt = {
      user_likes: body.user_profile?.likes || [],
      user_dislikes: body.user_profile?.dislikes || [],
      subreddit: body.subreddit,
      title: body.title,
      text_excerpt: body.text_excerpt,
      image_url: body.image_url || null,
    };

    const response = await fetch(
      "https://integrate.api.nvidia.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.NVIDIA_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "nvidia/nemotron-mini-4b-instruct",
          temperature: 0,
          max_tokens: 120,
          messages: [
            {
              role: "system",
              content:
                'Classify Reddit posts for a user. Output JSON only with two fields: "classification" (one of: highlight, hide, neutral) and "reasoning" (a short one-sentence explanation). Example: {"classification":"highlight","reasoning":"Matches user interest in programming."}',
            },
            {
              role: "user",
              content: JSON.stringify(prompt),
            },
          ],
        }),
      },
    );

    const data = await response.json();

    const raw = data.choices?.[0]?.message?.content || "{}";
    let output;
    try {
      const start = raw.indexOf("{");
      const end = raw.lastIndexOf("}");
      const jsonStr = start >= 0 && end > start ? raw.slice(start, end + 1) : "{}";
      const obj = JSON.parse(jsonStr);
      const classification = ["highlight", "hide", "neutral"].includes(obj.classification)
        ? obj.classification
        : "neutral";
      const reasoning = typeof obj.reasoning === "string" ? obj.reasoning : "";
      output = JSON.stringify({ classification, reasoning });
    } catch {
      output = JSON.stringify({ classification: "neutral", reasoning: "" });
    }

    return new Response(output, {
      headers: { "Content-Type": "application/json" },
    });
  },
};
