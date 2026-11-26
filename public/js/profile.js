
document.addEventListener("DOMContentLoaded", async function () {
    const nameElement = document.getElementById("publicName");
    const bioElement = document.getElementById("publicBio");
    const avatarElement = document.getElementById("publicAvatar");
    const linksContainer = document.getElementById("publicLinks");
    const messageElement = document.getElementById("publicMessage");
    const publicProfileCard = document.getElementById("publicProfileCard");

    const username = window.location.pathname.split("/")[2];

    // Render only valid HTTP(S) links.
    function renderLinks(links) {
        for (const link of links) {
            let url;

            try {
                url = new URL(link.url);

                if (!["http:", "https:"].includes(url.protocol))
                    continue;

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
        const response = await fetch(
            "/api/public/" + encodeURIComponent(username)
        );

        if (!response.ok)
            throw new Error("Profile not found.");

        const profile = await response.json();

        // Apply preset or custom theme.
        CouplingAppearance.applyTheme(
            publicProfileCard,
            profile.theme,
            profile.colors
        );

        nameElement.textContent = profile.displayName;
        bioElement.textContent = profile.bio;

        // Display profile picture or fallback initial.
        CouplingAppearance.renderAvatar(
            avatarElement,
            profile.displayName,
            profile.avatarUrl
        );

        document.title = profile.displayName + " | Coupling";

        renderLinks(profile.links);

    } catch {
        nameElement.textContent = "Profile unavailable";
        bioElement.textContent = "";
        avatarElement.textContent = "?";

        messageElement.textContent =
            "This profile does not exist or could not be loaded.";
    }
});
