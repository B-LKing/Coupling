document.addEventListener("DOMContentLoaded", function () {
    // Dashboard controls and state
    const welcomeMessage = document.getElementById("welcomeMessage");
    const dashboardMessage = document.getElementById("dashboardMessage");
    const profileForm = document.getElementById("profileForm");
    const displayNameInput = document.getElementById("displayName");
    const bioInput = document.getElementById("bio");
    const themeSelect = document.getElementById("themeSelect");
    const linkForm = document.getElementById("linkForm");
    const linkTitleInput = document.getElementById("linkTitle");
    const linkUrlInput = document.getElementById("linkUrl");
    const linksContainer = document.getElementById("linksContainer");
    const saveLinkButton = document.getElementById("saveLinkButton");
    const cancelEditButton = document.getElementById("cancelEditButton");
    const linkFormHeading = document.getElementById("linkFormHeading");
    const logoutButton = document.getElementById("logoutButton");
    const previewAvatar = document.getElementById("previewAvatar");
    const previewName = document.getElementById("previewName");
    const previewBio = document.getElementById("previewBio");
    const previewLinks = document.getElementById("previewLinks");
    const livePreviewCard = document.getElementById("livePreviewCard");
    const publicPageLink = document.getElementById("publicPageLink");
    const copyPageLink = document.getElementById("copyPageLink");
    const appearance = window.CouplingAppearance;
    const allowedThemes = appearance.themes;
    const avatarInput = document.getElementById("avatarInput");
    const uploadAvatarButton = document.getElementById("uploadAvatarButton");
    const removeAvatarButton = document.getElementById("removeAvatarButton");
    const avatarMessage = document.getElementById("avatarMessage");
    const customColors = document.getElementById("customColors");
    const colorInputs = {
        background: document.getElementById("colorBackground"),
        text: document.getElementById("colorText"),
        linkBackground: document.getElementById("colorLinkBackground"),
        linkText: document.getElementById("colorLinkText")
    };
    const resetColorsButton = document.getElementById("resetColorsButton");
    let avatarUrl = null;
    let avatarReady = false;
    let avatarBusy = false;

    let currentUsername = "";
    let currentLinks = [];
    let editingLinkId = null;

    // Shared API and validation helpers
    async function apiRequest(url, method = "GET", data = null) {
        const options = { method, headers: {} };
        if (data !== null) {
            options.headers["Content-Type"] = "application/json";
            options.body = JSON.stringify(data);
        }

        const response = await fetch(url, options);
        if (response.status === 401) {
            window.location.replace("/login.html");
            throw new Error("Please log in again.");
        }

        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Request failed.");
        return result;
    }

    function showMessage(text, success = false) {
        dashboardMessage.textContent = text;
        dashboardMessage.classList.toggle("success", success);
    }

    function parseHttpUrl(value) {
        try {
            const url = new URL(value);
            return ["http:", "https:"].includes(url.protocol) ? url : null;
        } catch {
            return null;
        }
    }

    function linkEndpoint(id) {
        return "/api/links/" + encodeURIComponent(id);
    }

    // Load profile and render saved links in both views.
    async function loadDashboard() {
        try {
            const user = await apiRequest("/api/me");
            currentUsername = user.username;
            copyPageLink.disabled = false;
            publicPageLink.href = "/u/" + encodeURIComponent(user.username);
            publicPageLink.hidden = false;
            welcomeMessage.textContent = "Welcome back, " + user.username + "!";

            const page = await apiRequest("/api/page");
            displayNameInput.value = page.displayName;
            bioInput.value = page.bio;
            themeSelect.value = allowedThemes.includes(page.theme) ? page.theme : "lavender";
            setColors(page.colors);
            avatarUrl = page.avatarUrl || null;
            avatarReady = true;
            updateAvatarControls();
            displayLinks(page.links);
        } catch (error) {
            showMessage(error.message);
        }
    }

    function displayLinks(links) {
        currentLinks = links;
        renderLinks();
        updatePreview();
    }

    async function refreshLinks() {
        const page = await apiRequest("/api/page");
        displayLinks(page.links);
    }

    function updatePreview() {
        const name = displayNameInput.value.trim();
        const bio = bioInput.value.trim();
        customColors.hidden = themeSelect.value !== "custom";
        appearance.applyTheme(livePreviewCard, themeSelect.value, readColors());
        previewName.textContent = name || currentUsername || "Your Name";
        previewBio.textContent = bio || "Your biography";
        appearance.renderAvatar(previewAvatar, previewName.textContent, avatarUrl);
        previewLinks.replaceChildren();

        for (const link of currentLinks) {
            if (link.visible === false) continue;
            const url = parseHttpUrl(link.url);
            if (!url) continue;

            const anchor = document.createElement("a");
            anchor.href = url.href;
            anchor.textContent = link.title;
            anchor.className = "public-link";
            anchor.target = "_blank";
            anchor.rel = "noopener noreferrer";
            previewLinks.appendChild(anchor);
        }
    }

    // Colour pickers and picture controls share the existing live preview.
    function readColors() {
        return Object.fromEntries(Object.entries(colorInputs).map(([key, input]) => [key, input.value]));
    }

    function setColors(colors) {
        const palette = appearance.getColors(colors);
        for (const [key, input] of Object.entries(colorInputs)) input.value = palette[key];
    }

    function updateAvatarControls() {
        avatarInput.disabled = !avatarReady || avatarBusy;
        uploadAvatarButton.disabled = !avatarReady || avatarBusy || !avatarInput.files.length;
        removeAvatarButton.disabled = !avatarReady || avatarBusy || !avatarUrl;
    }

    function showAvatarMessage(text, success = false) {
        avatarMessage.textContent = text;
        avatarMessage.classList.toggle("success", success);
    }

    async function uploadAvatar() {
        if (!avatarReady || avatarBusy) return;
        const file = avatarInput.files[0];
        if (!file) return;
        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
            showAvatarMessage("Choose a JPEG, PNG or WebP image up to 5 MB.");
            return;
        }
        avatarBusy = true;
        updateAvatarControls();
        try {
            // Send the image itself, not a JSON string or an arbitrary file path.
            const response = await fetch("/api/page/avatar", {
                method: "PUT", headers: { "Content-Type": file.type }, body: file
            });
            if (response.status === 401) {
                window.location.replace("/login.html");
                return;
            }
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || "Upload failed.");
            avatarUrl = result.avatarUrl + "?v=" + Date.now();
            avatarInput.value = "";
            updatePreview();
            showAvatarMessage(result.message, true);
        } catch (error) {
            showAvatarMessage(error.message);
        } finally {
            avatarBusy = false;
            updateAvatarControls();
        }
    }

    async function removeAvatar() {
        if (!avatarReady || avatarBusy || !avatarUrl) return;
        avatarBusy = true;
        updateAvatarControls();
        try {
            const result = await apiRequest("/api/page/avatar", "DELETE");
            avatarUrl = null;
            avatarInput.value = "";
            updatePreview();
            showAvatarMessage(result.message, true);
        } catch (error) {
            showAvatarMessage(error.message);
        } finally {
            avatarBusy = false;
            updateAvatarControls();
        }
    }

    // Common button setup; preserve all existing classes and handlers.
    function createActionButton(text, classes, onClick) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "btn btn-small" + (classes ? " " + classes : "");
        button.textContent = text;
        button.addEventListener("click", onClick);
        return button;
    }

    function renderLinks() {
        linksContainer.replaceChildren();
        if (currentLinks.length === 0) {
            const emptyMessage = document.createElement("p");
            emptyMessage.textContent = "You haven't added any links yet.";
            linksContainer.appendChild(emptyMessage);
            return;
        }

        currentLinks.forEach(function (link, index) {
            const item = document.createElement("div");
            item.className = "link-item";
            const information = document.createElement("div");
            information.className = "link-information";
            const title = document.createElement("strong");
            title.textContent = link.title;
            const urlText = document.createElement("p");
            urlText.textContent = link.url;
            information.append(title, urlText);

            const actions = document.createElement("div");
            actions.className = "link-actions";

            const upButton = createActionButton("↑", "btn-secondary arrow-btn",
                () => moveLink(link.id, "up"));
            upButton.disabled = index === 0;
            upButton.setAttribute("aria-label", "Move link up");

            const downButton = createActionButton("↓", "btn-secondary arrow-btn",
                () => moveLink(link.id, "down"));
            downButton.disabled = index === currentLinks.length - 1;
            downButton.setAttribute("aria-label", "Move link down");

            const isVisible = link.visible !== false;
            const visibilityButton = createActionButton(
                isVisible ? "Visible" : "Hidden",
                isVisible ? "btn-visible" : "btn-hidden",
                () => changeVisibility(link.id, !isVisible)
            );
            visibilityButton.setAttribute("aria-label", (isVisible ? "Hide " : "Show ") + link.title);
            visibilityButton.setAttribute("aria-pressed", String(isVisible));

            const editButton = createActionButton("Edit", "", () => startEditing(link));
            const deleteButton = createActionButton("Delete", "btn-danger", () => deleteLink(link.id));
            actions.append(upButton, downButton, visibilityButton, editButton, deleteButton);
            item.append(information, actions);
            linksContainer.appendChild(item);
        });
    }

    // Link editor and mutations
    function startEditing(link) {
        editingLinkId = link.id;
        linkTitleInput.value = link.title;
        linkUrlInput.value = link.url;
        linkFormHeading.textContent = "Edit Link";
        saveLinkButton.textContent = "Save Changes";
        cancelEditButton.hidden = false;
        linkTitleInput.focus();
    }

    function resetLinkForm() {
        editingLinkId = null;
        linkForm.reset();
        linkFormHeading.textContent = "Add a Link";
        saveLinkButton.textContent = "Add Link";
        cancelEditButton.hidden = true;
    }

    async function deleteLink(linkId) {
        if (!window.confirm("Are you sure you want to delete this link?")) return;
        try {
            await apiRequest(linkEndpoint(linkId), "DELETE");
            if (editingLinkId === linkId) resetLinkForm();
            await refreshLinks();
            showMessage("Link deleted successfully.", true);
        } catch (error) {
            showMessage(error.message);
        }
    }

    async function moveLink(linkId, direction) {
        try {
            await apiRequest(linkEndpoint(linkId) + "/move", "PATCH", { direction });
            await refreshLinks();
            showMessage("Link reordered successfully.", true);
        } catch (error) {
            showMessage(error.message);
        }
    }

    async function changeVisibility(linkId, visible) {
        try {
            await apiRequest(linkEndpoint(linkId) + "/visibility", "PATCH", { visible });
            await refreshLinks();
            showMessage("Link visibility updated.", true);
        } catch (error) {
            showMessage(error.message);
            await refreshLinks().catch(() => {});
        }
    }

    // Register event listeners together after the helper functions.
    displayNameInput.addEventListener("input", updatePreview);
    bioInput.addEventListener("input", updatePreview);
    themeSelect.addEventListener("change", updatePreview);
    cancelEditButton.addEventListener("click", resetLinkForm);
    Object.values(colorInputs).forEach(input => input.addEventListener("input", updatePreview));
    resetColorsButton.addEventListener("click", () => {
        setColors();
        updatePreview();
    });
    avatarInput.addEventListener("change", updateAvatarControls);
    uploadAvatarButton.addEventListener("click", uploadAvatar);
    removeAvatarButton.addEventListener("click", removeAvatar);

    profileForm.addEventListener("submit", async function (event) {
        event.preventDefault();
        const displayName = displayNameInput.value.trim();
        const bio = bioInput.value.trim();
        if (displayName.length < 1 || displayName.length > 50 || bio.length > 300) {
            showMessage("Check your name and biography lengths.");
            return;
        }

        try {
            await apiRequest("/api/page", "PUT", {
                displayName, bio, theme: themeSelect.value, colors: readColors()
            });
            showMessage("Profile saved successfully.", true);
        } catch (error) {
            showMessage(error.message);
        }
    });

    linkForm.addEventListener("submit", async function (event) {
        event.preventDefault();
        const title = linkTitleInput.value.trim();
        const url = linkUrlInput.value.trim();
        if (title.length < 1 || title.length > 60) {
            showMessage("Link title must be 1-60 characters.");
            return;
        }
        if (!parseHttpUrl(url)) {
            showMessage("Enter a valid HTTP or HTTPS URL.");
            return;
        }

        const isEditing = editingLinkId !== null;
        const endpoint = isEditing ? linkEndpoint(editingLinkId) : "/api/links";
        const method = isEditing ? "PUT" : "POST";

        try {
            await apiRequest(endpoint, method, { title, url });
            resetLinkForm();
            await refreshLinks();
            showMessage(isEditing ? "Link updated successfully." : "Link added successfully.", true);
        } catch (error) {
            showMessage(error.message);
        }
    });

    copyPageLink.addEventListener("click", async function () {
        const pageUrl = new URL(publicPageLink.getAttribute("href"), window.location.origin).href;
        try {
            await navigator.clipboard.writeText(pageUrl);
            showMessage("Public page URL copied!", true);
        } catch {
            showMessage("Unable to copy automatically. Please copy the URL from your browser.");
        }
    });

    logoutButton.addEventListener("click", async function () {
        logoutButton.disabled = true;
        try {
            await apiRequest("/api/logout", "POST");
            window.location.replace("/login.html");
        } catch (error) {
            showMessage(error.message);
            logoutButton.disabled = false;
        }
    });

    loadDashboard();
});
