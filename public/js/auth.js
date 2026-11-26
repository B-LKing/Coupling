document.addEventListener("DOMContentLoaded", function () {
    const registerForm = document.getElementById("registerForm");
    const loginForm = document.getElementById("loginForm");

    function isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    // Share request, loading state and error handling between both forms.
    function resetMessage(message) {
        message.textContent = "";
        message.classList.remove("success");
    }

    async function submitAuth(form, message, endpoint, data, failureMessage, onSuccess) {
        const button = form.querySelector('button[type="submit"]');
        button.disabled = true;

        try {
            const response = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data)
            });
            const result = await response.json();

            if (!response.ok) {
                message.textContent = result.error || failureMessage;
                return;
            }

            onSuccess();
        } catch {
            message.textContent = "Could not connect to the server.";
        } finally {
            button.disabled = false;
        }
    }

    // Registration
    if (registerForm) {
        registerForm.addEventListener("submit", async function (event) {
            event.preventDefault();
            const username = document.getElementById("username").value.trim();
            const email = document.getElementById("email").value.trim();
            const password = document.getElementById("password").value;
            const confirmPassword = document.getElementById("confirmPassword").value;
            const message = document.getElementById("registerError");
            resetMessage(message);

            if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
                message.textContent = "Username must be 3-20 letters, numbers or underscores.";
                return;
            }
            if (!isValidEmail(email)) {
                message.textContent = "Invalid email address: example@gmail.com.";
                return;
            }
            if (password.length < 8 || password.length > 72) {
                message.textContent = "Password must be between 8 and 72 characters.";
                return;
            }
            if (password !== confirmPassword) {
                message.textContent = "Passwords do not match.";
                return;
            }

            await submitAuth(registerForm, message, "/api/register",
                { username, email, password }, "Registration failed.", () => {
                    message.classList.add("success");
                    message.textContent = "Account created! Redirecting to login...";
                    registerForm.reset();
                    window.location.href = "/login.html";
                });
        });
    }

    // Login
    if (loginForm) {
        loginForm.addEventListener("submit", async function (event) {
            event.preventDefault();
            const email = document.getElementById("loginEmail").value.trim();
            const password = document.getElementById("loginPassword").value;
            const message = document.getElementById("loginError");
            resetMessage(message);

            if (!isValidEmail(email)) {
                message.textContent = "Enter a valid email: example@gmail.com.";
                return;
            }
            if (!password) {
                message.textContent = "Enter your password.";
                return;
            }

            await submitAuth(loginForm, message, "/api/login",
                { email, password }, "Login failed.", () => {
                    window.location.href = "/dashboard";
                });
        });
    }
});
