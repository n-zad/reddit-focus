"use strict";
/**
 * Popup script: save API base URL and user profile (likes/dislikes) to storage.
 */
function splitLinesOrComma(text) {
    return text
        .split(/[\n,]+/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
}
async function load() {
    const o = await browser.storage.local.get(["apiBase", "userProfile"]);
    const apiBase = typeof o.apiBase === "string" ? o.apiBase : "";
    const userProfile = o.userProfile;
    document.getElementById("api-base").value = apiBase;
    document.getElementById("likes").value = (userProfile?.likes || []).join("\n");
    document.getElementById("dislikes").value = (userProfile?.dislikes || []).join("\n");
}
async function save() {
    const apiBase = document.getElementById("api-base").value.trim();
    const likes = splitLinesOrComma(document.getElementById("likes").value);
    const dislikes = splitLinesOrComma(document.getElementById("dislikes").value);
    await browser.storage.local.set({
        apiBase: apiBase || undefined,
        userProfile: { likes, dislikes },
    });
    const status = document.getElementById("status");
    status.textContent = "Saved.";
    status.classList.remove("error");
    setTimeout(() => {
        status.textContent = "";
    }, 2000);
}
document.addEventListener("DOMContentLoaded", () => {
    load();
    document.getElementById("save").addEventListener("click", save);
});
