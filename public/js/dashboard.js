
document.addEventListener("DOMContentLoaded", function () {

    const welcomeMessage = document.getElementById("welcomeMessage");
    const dashboardMessage = document.getElementById("dashboardMessage");

    const profileForm = document.getElementById("profileForm");
    const displayNameInput = document.getElementById("displayName");
    const bioInput = document.getElementById("bio");

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
    const publicPageLink = document.getElementById("publicPageLink");
    const copyPageLink = document.getElementById("copyPageLink");

    let currentUsername = "";


    let currentLinks = [];
    let editingLinkId = null;

    // Shared helper for API requests
    async function apiRequest(url, method = "GET", data = null) {

        const options = {
            method: method,
            headers: {}
        };

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

        if (!response.ok) {
            throw new Error(result.error || "Request failed.");
        }

        return result;
    }

    function showMessage(text, success = false) {
        dashboardMessage.textContent = text;
        dashboardMessage.classList.toggle("success", success);
    }

    // Load account and page information
    async function loadDashboard() {

        try {
            const user = await apiRequest("/api/me");

            currentUsername = user.username;
            copyPageLink.disabled = false;

            // Link to this user's published public page
            publicPageLink.href =
                "/u/" + encodeURIComponent(user.username);

            publicPageLink.hidden = false;


            welcomeMessage.textContent =
                "Welcome back, " + user.username + "!";

            const page = await apiRequest("/api/page");

            displayNameInput.value = page.displayName;
            bioInput.value = page.bio;

            currentLinks = page.links;

            renderLinks();
            updatePreview();

        } catch (error) {
            showMessage(error.message);
        }
    }


    function updatePreview() {

        // Read the current form values
        const name = displayNameInput.value.trim();
        const bio = bioInput.value.trim();

        // Update the profile preview
        previewName.textContent = name || currentUsername || "Your Name";

        previewBio.textContent = bio || "Your biography";

        previewAvatar.textContent =
            previewName.textContent.charAt(0).toUpperCase();

        // Clear previously displayed links
        previewLinks.replaceChildren();

        // Rebuild links from the saved link array
        currentLinks.forEach(function (link) {

            const anchor = document.createElement("a");

            // This preview only displays safe URL schemes
            try {
                const url = new URL(link.url);

                if (
                    url.protocol !== "https:" &&
                    url.protocol !== "http:"
                ) {
                    return;
                }

                anchor.href = url.href;

            } catch {
                return;
            }

            anchor.textContent = link.title;
            anchor.className = "public-link";
            anchor.target = "_blank";
            anchor.rel = "noopener noreferrer";

            previewLinks.appendChild(anchor);
        });
    }



    displayNameInput.addEventListener("input", updatePreview);

    bioInput.addEventListener("input", updatePreview);



    // Display the saved links
    function renderLinks() {

        linksContainer.replaceChildren();

        if (currentLinks.length === 0) {
            const emptyMessage = document.createElement("p");
            emptyMessage.textContent =
                "You haven't added any links yet.";

            linksContainer.appendChild(emptyMessage);
            return;
        }

        currentLinks.forEach(function (link) {

            const item = document.createElement("div");
            item.className = "link-item";

            const information = document.createElement("div");
            information.className = "link-information";

            const title = document.createElement("strong");
            title.textContent = link.title;

            const urlText = document.createElement("p");
            urlText.textContent = link.url;

            information.appendChild(title);
            information.appendChild(urlText);

            const actions = document.createElement("div");
            actions.className = "link-actions";

            const editButton = document.createElement("button");
            editButton.type = "button";
            editButton.className = "btn btn-small";
            editButton.textContent = "Edit";

            editButton.addEventListener("click", function () {
                startEditing(link);
            });

            const deleteButton = document.createElement("button");
            deleteButton.type = "button";
            deleteButton.className = "btn btn-danger";
            deleteButton.textContent = "Delete";

            deleteButton.addEventListener("click", function () {
                deleteLink(link.id);
            });

            actions.appendChild(editButton);
            actions.appendChild(deleteButton);

            item.appendChild(information);
            item.appendChild(actions);

            linksContainer.appendChild(item);
        });
    }

    // Save profile changes
    profileForm.addEventListener("submit", async function (event) {
        event.preventDefault();

        const displayName = displayNameInput.value.trim();
        const bio = bioInput.value.trim();

        if (
            displayName.length < 1 ||
            displayName.length > 50 ||
            bio.length > 300
        ) {
            showMessage("Check your name and biography lengths.");
            return;
        }

        try {
            await apiRequest("/api/page", "PUT", {
                displayName: displayName,
                bio: bio
            });

            showMessage("Profile saved successfully.", true);

        } catch (error) {
            showMessage(error.message);
        }
    });

    // Save a new or edited link
    linkForm.addEventListener("submit", async function (event) {
        event.preventDefault();

        const title = linkTitleInput.value.trim();
        const url = linkUrlInput.value.trim();

        if (title.length < 1 || title.length > 60) {
            showMessage("Link title must be 1-60 characters.");
            return;
        }

        try {
            const parsedUrl = new URL(url);

            if (
                parsedUrl.protocol !== "https:" &&
                parsedUrl.protocol !== "http:"
            ) {
                throw new Error("Invalid protocol.");
            }

        } catch {
            showMessage("Enter a valid HTTP or HTTPS URL.");
            return;
        }

        const isEditing = editingLinkId !== null;

        const endpoint = isEditing
            ? "/api/links/" + editingLinkId
            : "/api/links";

        const method = isEditing ? "PUT" : "POST";

        try {
            await apiRequest(endpoint, method, {
                title: title,
                url: url
            });

            resetLinkForm();
            await refreshLinks();

            showMessage(
                isEditing ? "Link updated successfully." :
                            "Link added successfully.",
                true
            );

        } catch (error) {
            showMessage(error.message);
        }
    });

    // Switch the form into edit mode
    function startEditing(link) {

        editingLinkId = link.id;

        linkTitleInput.value = link.title;
        linkUrlInput.value = link.url;

        linkFormHeading.textContent = "Edit Link";
        saveLinkButton.textContent = "Save Changes";

        cancelEditButton.hidden = false;

        linkTitleInput.focus();
    }

    // Exit edit mode
    function resetLinkForm() {

        editingLinkId = null;

        linkForm.reset();

        linkFormHeading.textContent = "Add a Link";
        saveLinkButton.textContent = "Add Link";

        cancelEditButton.hidden = true;
    }

    cancelEditButton.addEventListener("click", resetLinkForm);

    // Delete a link
    async function deleteLink(linkId) {

        const confirmed = window.confirm(
            "Are you sure you want to delete this link?"
        );

        if (!confirmed) {
            return;
        }

        try {
            await apiRequest(
                "/api/links/" + linkId,
                "DELETE"
            );

            if (editingLinkId === linkId) {
                resetLinkForm();
            }

            await refreshLinks();

            showMessage("Link deleted successfully.", true);

        } catch (error) {
            showMessage(error.message);
        }
    }

    // Refresh the displayed list after changes
    async function refreshLinks() {

        const page = await apiRequest("/api/page");

        currentLinks = page.links;

        renderLinks();
        updatePreview();
    }


    copyPageLink.addEventListener("click", async function () {

        const pageUrl = new URL(
            publicPageLink.getAttribute("href"),
            window.location.origin
        ).href;

        try {
            await navigator.clipboard.writeText(pageUrl);

            showMessage("Public page URL copied!", true);

        } catch (error) {
            showMessage(
                "Unable to copy automatically. Please copy the URL from your browser."
            );
        }

    });


    // Log out
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
