document.addEventListener("DOMContentLoaded", async function () {
    const nameElement = document.getElementById("publicName");
    const bioElement = document.getElementById("publicBio");
    const avatarElement = document.getElementById("publicAvatar");
    const linksContainer = document.getElementById("publicLinks");
    const messageElement = document.getElementById("publicMessage");
    const publicProfileCard = document.getElementById("publicProfileCard");
    const allowedThemes = ["lavender", "midnight", "forest"];
    const username = window.location.pathname.split("/")[2];

    // Render only valid HTTP(S) links, using textContent for user text.
    function renderLinks(links) {
        for (const link of links) {
            let url;
            try {
                url = new URL(link.url);
                if (!["http:", "https:"].includes(url.protocol)) continue;
            } catch {
                continue;
            }

            const anchor = document.createElement("a");
            anchor.href = url.href;
            anchor.textContent = link.title;
            anchor.target = "_blank";
            anchor.rel = "noopener noreferrer";
            anchor.className = "public-link";
            linksContainer.appendChild(anchor);
        }
    }

    try {
        const response = await fetch("/api/public/" + encodeURIComponent(username));
        if (!response.ok) throw new Error("Profile not found.");
        const profile = await response.json();

        publicProfileCard.dataset.theme = allowedThemes.includes(profile.theme)
            ? profile.theme : "lavender";
        nameElement.textContent = profile.displayName;
        bioElement.textContent = profile.bio;
        avatarElement.textContent = profile.displayName.charAt(0).toUpperCase();
        document.title = profile.displayName + " | Coupling";
        renderLinks(profile.links);
    } catch {
        nameElement.textContent = "Profile unavailable";
        bioElement.textContent = "";
        avatarElement.textContent = "?";
        messageElement.textContent = "This profile does not exist or could not be loaded.";
    }
});
