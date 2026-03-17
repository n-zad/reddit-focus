# Reddit Focus

A Firefox extension that improves Reddit feeds by using an LLM to classify posts based on your interests.

As you scroll, the extension extracts visible post data (subreddit, title, excerpt, image) and sends it to a small backend API. The model returns one of:

* **highlight** – emphasize the post
* **hide** – collapse/remove the post
* **neutral** – leave unchanged

## Architecture

```
repo/
├── extension/
│   ├── manifest.json
│   ├── content.js
│   ├── background.js
│   ├── styles.css
│   └── popup/
│       ├── popup.html
│       ├── popup.js
│       └── popup.css
├── worker/
│   └── cloudflare-worker.js
└── README.md
```

Extension → Cloudflare Worker → NVIDIA Nemotron API

## Caching

API responses are cached in the extension using **`key = post_id + user_profile_hash`**, so the same post with the same user profile (likes/dislikes) is not sent to the API again. Changing likes/dislikes in the popup updates the profile hash and triggers fresh classifications.

## Tech Stack

* Firefox WebExtensions (Manifest v2)
* JavaScript
* Cloudflare Workers
* NVIDIA Nemotron

## Setup

### 1. Deploy the worker

Deploy `worker/cloudflare-worker.js` to Cloudflare Workers and set `NVIDIA_API_KEY` in the worker environment. Note the worker URL (e.g. `https://your-worker.workers.dev`).

### 2. Load the extension in Firefox

1. Open `about:debugging` → **This Firefox** → **Load Temporary Add-on**.
2. Choose `extension/manifest.json` from this repo.
3. Click the extension icon and set **Worker API URL** to your worker URL.
4. Optionally set **Likes** and **Dislikes** (one per line or comma-separated) to tune classification.
5. Visit Reddit; posts will be classified as you scroll (highlight / hide / neutral).
