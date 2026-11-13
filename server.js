
require("dotenv").config();

const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

const usersFile = path.join(__dirname, "data", "users.json");

if (!process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET is missing from .env");
}

// Allow the server to receive JSON requests
app.use(express.json({ limit: "10kb" }));

// Configure authentication sessions
app.use(session({
    name: "linkspace.sid",
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 1000 * 60 * 60
    }
}));

// Serve public HTML, CSS and JavaScript
app.use(express.static(path.join(__dirname, "public")));

// Read user accounts from JSON
function readUsers() {
    return JSON.parse(fs.readFileSync(usersFile, "utf8"));
}

// Write user accounts to JSON
function writeUsers(users) {
    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
}

// Require login for protected resources
function requireAuth(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).send("Unauthorized. Please log in.");
    }

    next();
}

// REGISTER
app.post("/api/register", async (req, res) => {

    const { username, email, password } = req.body || {};

    if (
        typeof username !== "string" ||
        typeof email !== "string" ||
        typeof password !== "string"
    ) {
        return res.status(400).json({
            error: "Invalid registration data."
        });
    }

    const cleanUsername = username.trim();
    const cleanEmail = email.trim().toLowerCase();

    // Validate user input on the server
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(cleanUsername)) {
        return res.status(400).json({
            error: "Username must be 3-20 letters, numbers or underscores."
        });
    }

    if (
        cleanEmail.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)
    ) {
        return res.status(400).json({
            error: "Please enter a valid email."
        });
    }

    if (password.length < 8 || password.length > 72) {
        return res.status(400).json({
            error: "Password must be between 8 and 72 characters."
        });
    }

    try {
        const users = readUsers();

        const usernameExists = users.some(user =>
            user.username.toLowerCase() === cleanUsername.toLowerCase()
        );

        const emailExists = users.some(user =>
            user.email === cleanEmail
        );

        if (usernameExists || emailExists) {
            return res.status(409).json({
                error: "Username or email already exists."
            });
        }

        const passwordHash = await bcrypt.hash(password, 12);

        const newUser = {
            id: crypto.randomUUID(),
            username: cleanUsername,
            email: cleanEmail,
            passwordHash: passwordHash
        };

        users.push(newUser);
        writeUsers(users);

        res.status(201).json({
            message: "Account created successfully."
        });

    } catch (error) {
        console.error("Registration error:", error);

        res.status(500).json({
            error: "Registration failed. Please try again."
        });
    }
});

// LOGIN
app.post("/api/login", async (req, res) => {

    const { email, password } = req.body || {};

    if (
        typeof email !== "string" ||
        typeof password !== "string" ||
        email.length > 254 ||
        password.length > 1024
    ) {
        return res.status(400).json({
            error: "Invalid login data."
        });
    }

    try {
        const users = readUsers();

        const user = users.find(user =>
            user.email === email.trim().toLowerCase()
        );

        const validPassword = user
            ? await bcrypt.compare(password, user.passwordHash)
            : false;

        if (!user || !validPassword) {
            return res.status(401).json({
                error: "Invalid email or password."
            });
        }

        // Create a new session after successful login
        req.session.regenerate(error => {
            if (error) {
                return res.status(500).json({
                    error: "Unable to create session."
                });
            }

            req.session.userId = user.id;

            req.session.save(error => {
                if (error) {
                    return res.status(500).json({
                        error: "Unable to save session."
                    });
                }

                res.json({
                    message: "Login successful."
                });
            });
        });

    } catch (error) {
        console.error("Login error:", error);

        res.status(500).json({
            error: "Login failed. Please try again."
        });
    }
});

// LOGOUT
app.post("/api/logout", (req, res) => {

    req.session.destroy(error => {
        if (error) {
            return res.status(500).json({
                error: "Logout failed."
            });
        }

        res.clearCookie("linkspace.sid");
        res.json({ message: "Logged out successfully." });
    });
});

// GET CURRENT USER
app.get("/api/me", requireAuth, (req, res) => {

    try {
        const users = readUsers();

        const user = users.find(user =>
            user.id === req.session.userId
        );

        if (!user) {
            return res.status(401).json({
                error: "User not found."
            });
        }

        res.json({
            id: user.id,
            username: user.username,
            email: user.email
        });

    } catch (error) {
        console.error("Profile error:", error);

        res.status(500).json({
            error: "Unable to load profile."
        });
    }
});

// PROTECTED DASHBOARD
app.get("/dashboard", requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, "private", "dashboard.html"));
});

// Handle malformed JSON request bodies
app.use((error, req, res, next) => {
    if (error instanceof SyntaxError && error.status === 400) {
        return res.status(400).json({
            error: "Malformed JSON request."
        });
    }

    next(error);
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
