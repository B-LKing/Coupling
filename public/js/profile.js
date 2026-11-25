
document.addEventListener("DOMContentLoaded", async function () {

    const nameElement = document.getElementById("publicName");
    const bioElement = document.getElementById("publicBio");
    const avatarElement = document.getElementById("publicAvatar");
    const linksContainer = document.getElementById("publicLinks");
    const messageElement = document.getElementById("publicMessage");
    const publicProfileCard = document.getElementById("publicProfileCard");

    // Extract username from URL: /u/username
    const username = window.location.pathname.split("/")[2];

    try {
        const response = await fetch(
            "/api/public/" + encodeURIComponent(username)
        );

        if (!response.ok) {
            throw new Error("Profile not found.");
        }

        const profile = await response.json();

        const allowedThemes = ["lavender", "midnight", "forest"];

        publicProfileCard.dataset.theme = allowedThemes.includes(profile.theme) ? profile.theme : "lavender";

        // Display name and biography
        nameElement.textContent = profile.displayName;
        bioElement.textContent = profile.bio;

        // Use first letter as avatar
        avatarElement.textContent =
            profile.displayName.charAt(0).toUpperCase();

        // Update browser tab title
        document.title = profile.displayName + " | LinkSpace";

        // Display links
        profile.links.forEach(function (link) {

            const anchor = document.createElement("a");

            // Validate before assigning a clickable URL
            let parsedUrl;

            try {
                parsedUrl = new URL(link.url);

                if (
                    parsedUrl.protocol !== "https:" &&
                    parsedUrl.protocol !== "http:"
                ) {
                    return;
                }

            } catch {
                return;
            }

            anchor.href = parsedUrl.href;
            anchor.textContent = link.title;

            anchor.target = "_blank";
            anchor.rel = "noopener noreferrer";

            anchor.className = "public-link";

            linksContainer.appendChild(anchor);
        });

    } catch (error) {

        nameElement.textContent = "Profile unavailable";
        bioElement.textContent = "";
        avatarElement.textContent = "?";
        messageElement.textContent =
            "This profile does not exist or could not be loaded.";
    }

});
