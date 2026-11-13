
document.addEventListener("DOMContentLoaded", function () {

    const registerForm = document.getElementById("registerForm");
    const loginForm = document.getElementById("loginForm");

    function isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    // REGISTER
    if (registerForm !== null) {

        registerForm.addEventListener("submit", async function (event) {
            event.preventDefault();

            const username = document.getElementById("username").value.trim();
            const email = document.getElementById("email").value.trim();
            const password = document.getElementById("password").value;
            const confirmPassword =
                document.getElementById("confirmPassword").value;

            const message = document.getElementById("registerError");
            const button = registerForm.querySelector('button[type="submit"]');

            message.textContent = "";
            message.classList.remove("success");

            if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
                message.textContent = "Invalid username.";
                return;
            }

            if (!isValidEmail(email)) {
                message.textContent = "Invalid email address.";
                return;
            }

            if (password.length < 8 || password.length > 72) {
                message.textContent =
                    "Password must be between 8 and 72 characters.";
                return;
            }

            if (password !== confirmPassword) {
                message.textContent = "Passwords do not match.";
                return;
            }

            button.disabled = true;

            try {
                const response = await fetch("/api/register", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        username: username,
                        email: email,
                        password: password
                    })
                });

                const result = await response.json();

                if (!response.ok) {
                    message.textContent = result.error || "Registration failed.";
                    return;
                }

                message.classList.add("success");
                message.textContent =
                    "Account created! Redirecting to login...";

                registerForm.reset();

                // Redirect after successful registration
                window.location.href = "/login.html";

            } catch (error) {
                message.textContent =
                    "Could not connect to the server.";
            } finally {
                button.disabled = false;
            }
        });
    }

    // LOGIN
    if (loginForm !== null) {

        loginForm.addEventListener("submit", async function (event) {
            event.preventDefault();

            const email = document.getElementById("loginEmail").value.trim();
            const password = document.getElementById("loginPassword").value;

            const message = document.getElementById("loginError");
            const button = loginForm.querySelector('button[type="submit"]');

            message.textContent = "";
            message.classList.remove("success");

            if (!isValidEmail(email)) {
                message.textContent = "Enter a valid email.";
                return;
            }

            if (password.length === 0) {
                message.textContent = "Enter your password.";
                return;
            }

            button.disabled = true;

            try {
                const response = await fetch("/api/login", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        email: email,
                        password: password
                    })
                });

                const result = await response.json();

                if (!response.ok) {
                    message.textContent =
                        result.error || "Login failed.";
                    return;
                }

                // Browser retains the session cookie
                window.location.href = "/dashboard";

            } catch (error) {
                message.textContent =
                    "Could not connect to the server.";
            } finally {
                button.disabled = false;
            }
        });
    }
});
