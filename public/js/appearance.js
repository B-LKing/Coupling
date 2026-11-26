// Shared rendering for the dashboard preview and published profile.
window.CouplingAppearance = (() => {
    const themes = ["lavender", "midnight", "forest", "custom"];
    const defaultColors = {
        background: "#ffffff", text: "#1f2937",
        linkBackground: "#ede9fe", linkText: "#3730a3"
    };
    const colorVariables = {
        background: "--custom-bg", text: "--custom-text",
        linkBackground: "--custom-link", linkText: "--custom-link-text"
    };

    function getColors(colors) {
        return Object.fromEntries(Object.entries(defaultColors).map(([key, fallback]) => {
            const value = colors?.[key];
            return [key, typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback];
        }));
    }

    function applyTheme(card, theme, colors) {
        card.dataset.theme = themes.includes(theme) ? theme : "lavender";
        const palette = getColors(colors);
        for (const [key, variable] of Object.entries(colorVariables)) {
            card.style.setProperty(variable, palette[key]);
        }
    }

    function renderAvatar(container, name, avatarUrl) {
        const initial = name.charAt(0).toUpperCase() || "?";
        if (!avatarUrl) {
            container.textContent = initial;
            return;
        }
        // Reuse the existing image when only the name or colours change.
        const existing = container.querySelector("img");
        if (existing?.getAttribute("src") === avatarUrl) return;
        const image = document.createElement("img");
        image.alt = ""; // Decorative: the profile name is already displayed below.
        image.addEventListener("error", () => {
            if (container.contains(image)) container.textContent = initial;
        });
        container.replaceChildren(image);
        image.src = avatarUrl;
    }

    return { themes, getColors, applyTheme, renderAvatar };
})();
