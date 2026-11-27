
document.addEventListener("DOMContentLoaded", async function () {
    const nameElement = document.getElementById("publicName");
    const bioElement = document.getElementById("publicBio");
    const avatarElement = document.getElementById("publicAvatar");
    const linksContainer = document.getElementById("publicLinks");
    const messageElement = document.getElementById("publicMessage");
    const publicProfileCard = document.getElementById("publicProfileCard");

    const username = window.location.pathname.split("/")[2];


    // Convert a hexadecimal colour into RGB values.
    function hexToRgb(hex) {
        return hex.match(/[0-9a-f]{2}/gi)
            .map(value => parseInt(value, 16));
    }

    // Blend two colours using a specified ratio.
    function mixColors(first, second, ratio) {
        return first.map((value, i) =>
            Math.round(value * (1 - ratio) + second[i] * ratio)
        );
    }

    // Calculate the relative brightness of a colour.
    function luminance(rgb) {
        const [r, g, b] = rgb.map(value => {
            value /= 255;

            return value <= 0.04045
                ? value / 12.92
                : ((value + 0.055) / 1.055) ** 2.4;
        });

        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }

    // Generate the published page's background and branding.
    function updatePageBackground() {
        const styles = getComputedStyle(publicProfileCard);

        const background = hexToRgb(
            styles.getPropertyValue("--theme-bg").trim()
        );

        const text = hexToRgb(
            styles.getPropertyValue("--theme-text").trim()
        );

        const link = hexToRgb(
            styles.getPropertyValue("--theme-button").trim()
        );

        const linkText = hexToRgb(
            styles.getPropertyValue("--theme-button-text").trim()
        );

        // Blend all four theme colours into two gradient colours.
        let start = mixColors(background, text, 0.15);
        let end = mixColors(link, linkText, 0.15);

        // Choose contrasting branding based on average brightness.
        const average = mixColors(start, end, 0.5);
        const isDark = luminance(average) < 0.179;

        const brandColor = isDark ? "#ffffff" : "#111111";
        const tint = isDark ? [0, 0, 0] : [255, 255, 255];

        // Keep branding readable across the entire gradient.
        function hasContrast() {
            const darkest = start.map((v, i) => Math.min(v, end[i]));
            const lightest = start.map((v, i) => Math.max(v, end[i]));

            return isDark
                ? luminance(lightest) <= 0.18
                : luminance(darkest) >= 0.20;
        }

        while (!hasContrast()) {
            start = mixColors(start, tint, 0.2);
            end = mixColors(end, tint, 0.2);
        }

        document.body.style.setProperty(
            "--page-color-start", `rgb(${start.join(",")})`
        );

        document.body.style.setProperty(
            "--page-color-end", `rgb(${end.join(",")})`
        );

        document.body.style.setProperty(
            "--page-brand-color", brandColor
        );
    }


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

        updatePageBackground();

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
