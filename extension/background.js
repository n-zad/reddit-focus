"use strict";
/**
 * Background script: handles classify API calls and caches responses
 * by key = post_id + user_profile_hash to avoid repeat API calls.
 */
const CACHE_KEY_PREFIX = "reddit_focus_classify:";
const DEFAULT_API_BASE = "https://reddit-filter-api.nickzadbayati.workers.dev";
function cacheKey(postId, userProfileHash) {
    return CACHE_KEY_PREFIX + postId + "|" + userProfileHash;
}
async function getCached(postId, userProfileHash) {
    const key = cacheKey(postId, userProfileHash);
    const result = await browser.storage.local.get(key);
    const raw = result[key];
    if (!raw || typeof raw.classification !== "string")
        return null;
    return raw;
}
async function setCached(postId, userProfileHash, classification) {
    const key = cacheKey(postId, userProfileHash);
    await browser.storage.local.set({ [key]: classification });
}
async function classifyViaApi(apiBase, payload) {
    const url = apiBase.replace(/\/$/, "") + "/classify";
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
    }
    const data = (await res.json());
    if (!data.classification) {
        return { classification: "neutral" };
    }
    return {
        classification: data.classification === "highlight" ||
            data.classification === "hide" ||
            data.classification === "neutral"
            ? data.classification
            : "neutral",
    };
}
browser.runtime.onMessage.addListener((message, _sender) => {
    const msg = message;
    if (msg?.type !== "classify" || !msg.postId || !msg.userProfileHash) {
        return Promise.resolve({ classification: "neutral" });
    }
    const apiBase = msg.apiBase || DEFAULT_API_BASE;
    if (!apiBase) {
        return Promise.resolve({ classification: "neutral" });
    }
    return (async () => {
        const cached = await getCached(msg.postId, msg.userProfileHash);
        if (cached) {
            return cached;
        }
        const result = await classifyViaApi(apiBase, msg.payload);
        await setCached(msg.postId, msg.userProfileHash, result);
        return result;
    })();
});
