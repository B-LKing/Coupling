
document.addEventListener("DOMContentLoaded", function () 
{

    const registerForm = document.getElementById("registerForm");
    const loginForm = document.getElementById("loginForm");

    // Registration form
    if (registerForm !== null) {

        registerForm.addEventListener("submit", function (event) {

            event.preventDefault();

            const username = document.getElementById("username").value.trim();
            const email = document.getElementById("email").value.trim();
            const password = document.getElementById("password").value;
            const confirmPassword = document.getElementById("confirmPassword").value;

            const message = document.getElementById("registerError");

            message.classList.remove("success");
            message.textContent = "";

            if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) 
            {
                message.textContent = "Username must be 3-20 characters and contain only letters, numbers or underscores.";
                return;
            }

            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) 
            {
                message.textContent = "Please enter a valid email address.";
                return;
            }

            if (password.length < 8) 
            {
                message.textContent =
                    "Password must contain at least 8 characters.";
                return;
            }

            if (password !== confirmPassword) 
            {
                message.textContent = "Passwords do not match.";
                return;
            }

            message.classList.add("success");
            message.textContent = "Form validated successfully! Backend registration is coming next.";
        });
    }

    // Login form
    if (loginForm !== null) 
    {

        loginForm.addEventListener("submit", function (event) 
        {

            event.preventDefault();

            const email = document.getElementById("loginEmail").value.trim();

            const password = document.getElementById("loginPassword").value;

            const message = document.getElementById("loginError");

            message.classList.remove("success");
            message.textContent = "";

            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) 
            {
                message.textContent = "Please enter a valid email address.";
                return;
            }

            if (password.length === 0) 
            {
                message.textContent = "Please enter your password.";
                return;
            }

            message.classList.add("success");
            message.textContent = "Form validated successfully! Backend login is coming next.";
        });
    }
});
