
document.addEventListener("DOMContentLoaded", async function () {

    const welcomeMessage =
        document.getElementById("welcomeMessage");

    const displayUsername =
        document.getElementById("displayUsername");

    const displayEmail =
        document.getElementById("displayEmail");

    const logoutButton =
        document.getElementById("logoutButton");

    // Load authenticated user information
    try {
        const response = await fetch("/api/me");

        if (response.status === 401) {
            window.location.replace("/login.html");
            return;
        }

        if (!response.ok) {
            throw new Error("Failed to load account.");
        }

        const user = await response.json();

        welcomeMessage.textContent =
            "Welcome back, " + user.username + "!";

        displayUsername.textContent = user.username;
        displayEmail.textContent = user.email;

    } catch (error) {
        welcomeMessage.textContent =
            "Unable to load your account information.";
    }

    // Logout
    logoutButton.addEventListener("click", async function () {

        logoutButton.disabled = true;

        try {
            const response = await fetch("/api/logout", {
                method: "POST"
            });

            if (!response.ok) {
                throw new Error("Logout failed.");
            }

            window.location.replace("/login.html");

        } catch (error) {
            welcomeMessage.textContent =
                "Logout failed. Please try again.";
            logoutButton.disabled = false;
        }
    });
});
