"use strict";
/**
 * Content script: runs on Reddit, extracts visible posts, requests classification
 * from background (which caches by post_id + user_profile_hash), and applies
 * highlight / hide / neutral.
 */
const DATA_POST_ID = "data-reddit-focus-post-id";
const DATA_CLASSIFIED = "data-reddit-focus-classified";
const BLURB_CLASS = "reddit-focus-blurb";
const DEFAULT_API_BASE = "https://reddit-filter-api.nickzadbayati.workers.dev";
const POST_BASE_CLASS = "reddit-focus-post";
const POST_HIDE_CLASS = "reddit-focus-post--hide";
const POST_HIGHLIGHT_CLASS = "reddit-focus-post--highlight";
const POST_REVEALED_CLASS = "reddit-focus-post--revealed";
const DATA_REVEAL_BOUND = "data-reddit-focus-reveal-bound";
/** Simple stable hash for user profile (for cache key). */
function hashUserProfile(profile) {
    const str = "likes:" +
        [...(profile.likes || [])].sort().join(",") +
        "|dislikes:" +
        [...(profile.dislikes || [])].sort().join(",");
    let h = 0;
    for (let i = 0; i < str.length; i++) {
        const c = str.charCodeAt(i);
        h = (h << 5) - h + c;
        h = h & h;
    }
    return String(h);
}
/** Extract post id from element (new or old Reddit). */
function getPostId(el) {
    const existing = el.getAttribute(DATA_POST_ID);
    if (existing)
        return existing;
    // New Reddit: shreddit-post has id or link to post
    const link = el.querySelector('a[data-testid="post-title"], a[href*="/comments/"]');
    if (link && link.href) {
        const m = link.href.match(/\/comments\/([a-z0-9]+)/i);
        if (m)
            return m[1];
    }
    // Old Reddit: .thing has data-fullname
    const fullname = el.getAttribute("data-fullname");
    if (fullname)
        return fullname;
    // Fallback: use a hash of the title + subreddit
    const titleEl = el.querySelector("h1, h2, h3, [data-testid='post-title']");
    const title = titleEl?.textContent?.trim() || "";
    const sub = el.getAttribute("data-subreddit") || el.querySelector("a[data-testid='subreddit-name'], a.subreddit")?.textContent?.trim() || "";
    const combined = sub + "|" + title;
    let h = 0;
    for (let i = 0; i < combined.length; i++) {
        h = (h << 5) - h + combined.charCodeAt(i);
        h = h & h;
    }
    return "fallback-" + String(h);
}
/** Extract subreddit, title, excerpt, image from a post element. */
function extractPostData(el) {
    const titleEl = el.querySelector("[data-testid='post-title'], .title, a.title") ||
        el.querySelector("h1, h2, h3");
    const title = titleEl?.textContent?.trim() || "";
    const subredditEl = el.querySelector("a[data-testid='subreddit-name'], a.subreddit, [data-subreddit]");
    let subreddit = "";
    if (subredditEl) {
        subreddit =
            subredditEl.getAttribute("data-subreddit") ||
                subredditEl.textContent?.trim()?.replace(/^r\//, "") ||
                "";
    }
    if (!subreddit && el.closest("[data-subreddit]")) {
        subreddit =
            el.closest("[data-subreddit]")?.getAttribute("data-subreddit") || "";
    }
    const bodyEl = el.querySelector("[data-testid='post-content'], .usertext-body .md, .expanded");
    const text_excerpt = bodyEl?.textContent?.trim()?.slice(0, 500) || "";
    const img = el.querySelector("img[src*='preview'], img[src*='external'], [data-testid='post-content'] img");
    const image_url = img?.src || null;
    return { subreddit, title, text_excerpt, image_url };
}
/** Get all post container elements (new and old Reddit). */
function getPostElements() {
    const newReddit = document.querySelectorAll("shreddit-post");
    if (newReddit.length)
        return Array.from(newReddit);
    const oldReddit = document.querySelectorAll(".thing.link");
    if (oldReddit.length)
        return Array.from(oldReddit);
    const fallback = document.querySelectorAll('[data-testid="post-container"], article[data-testid]');
    return Array.from(fallback);
}
function ensureBlurbContainer(postEl) {
    let container = postEl.nextElementSibling;
    if (!container || !container.classList.contains("reddit-focus-blurb-container")) {
        container = document.createElement("div");
        container.className = "reddit-focus-blurb-container";
        postEl.insertAdjacentElement("afterend", container);
    }
    return container;
}

function applyClassification(el, classification, reasoning) {
    el.setAttribute(DATA_CLASSIFIED, classification);
    // Visual treatment on the post itself
    el.classList.add(POST_BASE_CLASS);
    el.classList.remove(POST_HIDE_CLASS, POST_HIGHLIGHT_CLASS);
    if (classification === "hide") {
        el.classList.add(POST_HIDE_CLASS);
        // Allow user to reveal hidden posts on click (one-time binding).
        if (!el.hasAttribute(DATA_REVEAL_BOUND)) {
            el.setAttribute(DATA_REVEAL_BOUND, "1");
            el.addEventListener("click", (e) => {
                if (!el.classList.contains(POST_HIDE_CLASS))
                    return;
                // If still hidden, first click should only reveal (no navigation/open).
                if (!el.classList.contains(POST_REVEALED_CLASS)) {
                    el.classList.add(POST_REVEALED_CLASS);
                    e.preventDefault();
                    e.stopPropagation();
                    // Some handlers on Reddit are attached at the same node; block those too.
                    e.stopImmediatePropagation();
                }
            }, { capture: true });
        }
    }
    else if (classification === "highlight") {
        el.classList.add(POST_HIGHLIGHT_CLASS);
    }
    else {
        el.classList.remove(POST_REVEALED_CLASS);
    }
    const container = ensureBlurbContainer(el);
    const blurb = document.createElement("div");
    blurb.className = BLURB_CLASS + " reddit-focus-blurb--" + classification;
    blurb.textContent = reasoning || "No reasoning provided.";
    container.innerHTML = "";
    container.appendChild(blurb);
}
async function getStoredPrefs() {
    const o = await browser.storage.local.get(["apiBase", "userProfile"]);
    return {
        apiBase: o.apiBase,
        userProfile: o.userProfile || { likes: [], dislikes: [] },
    };
}
async function classifyPost(postId, userProfileHash, payload, apiBase) {
    const res = (await browser.runtime.sendMessage({
        type: "classify",
        postId,
        userProfileHash,
        payload,
        apiBase,
    }));
    const classification = res?.classification === "highlight" || res?.classification === "hide" ? res.classification : "neutral";
    const reasoning = typeof res?.reasoning === "string" ? res.reasoning : "";
    return { classification, reasoning };
}
const processed = new Set();
async function processPost(el) {
    const postId = getPostId(el);
    el.setAttribute(DATA_POST_ID, postId);
    if (processed.has(postId))
        return;
    processed.add(postId);
    const { apiBase, userProfile } = await getStoredPrefs();
    const apiUrl = (apiBase && apiBase.trim()) ? apiBase.trim() : DEFAULT_API_BASE;
    if (!apiUrl) {
        applyClassification(el, "neutral", "Classification not attempted (API base not configured).");
        return;
    }
    const profile = userProfile ?? { likes: [], dislikes: [] };
    const userProfileHash = hashUserProfile(profile);
    const { subreddit, title, text_excerpt, image_url } = extractPostData(el);
    const payload = {
        subreddit,
        title,
        text_excerpt,
        image_url,
        user_profile: profile,
    };
    try {
        // Indicate that a request is being sent for this post.
        applyClassification(el, "neutral", "Classifying post…");
        let { classification, reasoning } = await classifyPost(postId, userProfileHash, payload, apiUrl);
        if (!reasoning) {
            reasoning = "Classifier returned a label but no explanation.";
        }
        applyClassification(el, classification, reasoning);
    }
    catch {
        applyClassification(el, "neutral", "Classification failed (API error or timeout).");
    }
}
function processVisiblePosts() {
    getPostElements().forEach((el) => {
        if (el.getAttribute(DATA_CLASSIFIED))
            return;
        processPost(el);
    });
}
function observeNewPosts() {
    const observer = new MutationObserver(() => {
        processVisiblePosts();
    });
    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });
}
function init() {
    processVisiblePosts();
    observeNewPosts();
    // Also run after a short delay for lazy-loaded content
    setTimeout(processVisiblePosts, 1500);
    setTimeout(processVisiblePosts, 4000);
}
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
}
else {
    init();
}
