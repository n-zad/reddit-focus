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
          max_tokens: 60,
          messages: [
            {
              role: "system",
              content:
                'Classify Reddit posts for a user. Output JSON only: {"classification":"highlight|hide|neutral"}',
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

    const output =
      data.choices?.[0]?.message?.content || '{"classification":"neutral"}';

    return new Response(output, {
      headers: { "Content-Type": "application/json" },
    });
  },
};
