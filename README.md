# Reddit Focus

A Firefox extension that improves Reddit feeds by using an LLM to classify posts based on your interests.

As you scroll, the extension extracts visible post data (subreddit, title, excerpt, image) and sends it to a small backend API. The model returns one of:

* **highlight** – emphasize the post
* **hide** – collapse/remove the post
* **neutral** – leave unchanged

## Architecture

Extension → Cloudflare Worker → NVIDIA Nemotron API

## Tech Stack

* Firefox WebExtensions
* TypeScript
* Cloudflare Workers
* NVIDIA Nemotron
