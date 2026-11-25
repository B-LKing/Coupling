
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
const pagesFile = path.join(__dirname, "data", "pages.json");

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


function readPages() {
    return JSON.parse(
        fs.readFileSync(pagesFile, "utf8")
    );
}

function writePages(pages) {
    fs.writeFileSync(
        pagesFile,
        JSON.stringify(pages, null, 2)
    );
}

// Find the page belonging to the current user
function findUserPage(pages, userId) {
    return pages.find(page => page.ownerId === userId);
}

// Create an empty page when a user doesn't have one
function getOrCreatePage(pages, userId) {

    let page = findUserPage(pages, userId);

    if (!page) {
        page = {
            ownerId: userId,
            displayName: "",
            bio: "",
            theme: "lavender",
            links: []
        };

        pages.push(page);
        writePages(pages);
    }

    return page;
}

// Only allow HTTP and HTTPS links
function isValidLinkUrl(value) {

    if (typeof value !== "string" ||
        value.length > 2048) {
        return false;
    }

    try {
        const url = new URL(value);

        return (
            (url.protocol === "https:" ||
             url.protocol === "http:") &&
            url.hostname.length > 0 &&
            !url.username &&
            !url.password
        );

    } catch {
        return false;
    }
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

// GET current user's page
app.get("/api/page", requireAuth, (req, res) => {

    try {
        const pages = readPages();

        const page = getOrCreatePage(
            pages,
            req.session.userId
        );

        res.json(page);

    } catch (error) {
        console.error("Page read error:", error);

        res.status(500).json({
            error: "Could not load your page."
        });
    }
});


//
// UPDATE PROFILE AND THEME
//
app.put("/api/page", requireAuth, (req, res) => {

    const { displayName, bio, theme } = req.body || {};

    if (
        typeof displayName !== "string" ||
        typeof bio !== "string" ||
        typeof theme !== "string"
    ) {
        return res.status(400).json({
            error: "Invalid profile information."
        });
    }

    const cleanName = displayName.trim();
    const cleanBio = bio.trim();

    const allowedThemes = [
        "lavender",
        "midnight",
        "forest"
    ];

    if (
        cleanName.length < 1 ||
        cleanName.length > 50 ||
        cleanBio.length > 300 ||
        !allowedThemes.includes(theme)
    ) {
        return res.status(400).json({
            error: "Invalid name, biography or theme."
        });
    }

    try {
        const pages = readPages();

        const page = getOrCreatePage(
            pages,
            req.session.userId
        );

        page.displayName = cleanName;
        page.bio = cleanBio;
        page.theme = theme;

        writePages(pages);

        res.json({
            message: "Profile updated successfully.",
            page: page
        });

    } catch (error) {
        console.error("Profile update error:", error);

        res.status(500).json({
            error: "Could not update your profile."
        });
    }
});


// CREATE a link
app.post("/api/links", requireAuth, (req, res) => {

    const { title, url } = req.body || {};

    if (
        typeof title !== "string" ||
        typeof url !== "string" ||
        title.trim().length < 1 ||
        title.trim().length > 60 ||
        !isValidLinkUrl(url)
    ) {
        return res.status(400).json({
            error: "Enter a title (1-60 characters) and a valid URL."
        });
    }

    try {
        const pages = readPages();

        const page = getOrCreatePage(
            pages,
            req.session.userId
        );

        const newLink = {
            id: crypto.randomUUID(),
            title: title.trim(),
            url: url.trim()
        };

        page.links.push(newLink);

        writePages(pages);

        res.status(201).json({
            message: "Link added successfully.",
            link: newLink
        });

    } catch (error) {
        console.error("Create link error:", error);

        res.status(500).json({
            error: "Could not add the link."
        });
    }
});

// UPDATE an existing link
app.put("/api/links/:id", requireAuth, (req, res) => {

    const { title, url } = req.body || {};
    const linkId = req.params.id;

    if (
        typeof title !== "string" ||
        typeof url !== "string" ||
        title.trim().length < 1 ||
        title.trim().length > 60 ||
        !isValidLinkUrl(url)
    ) {
        return res.status(400).json({
            error: "Invalid title or URL."
        });
    }

    try {
        const pages = readPages();

        const page = findUserPage(
            pages,
            req.session.userId
        );

        const link = page?.links.find(
            link => link.id === linkId
        );

        if (!link) {
            return res.status(404).json({
                error: "Link not found."
            });
        }

        link.title = title.trim();
        link.url = url.trim();

        writePages(pages);

        res.json({
            message: "Link updated successfully.",
            link: link
        });

    } catch (error) {
        console.error("Update link error:", error);

        res.status(500).json({
            error: "Could not update the link."
        });
    }
});

// DELETE an existing link
app.delete("/api/links/:id", requireAuth, (req, res) => {

    const linkId = req.params.id;

    try {
        const pages = readPages();

        const page = findUserPage(
            pages,
            req.session.userId
        );

        if (!page) {
            return res.status(404).json({
                error: "Link not found."
            });
        }

        const index = page.links.findIndex(
            link => link.id === linkId
        );

        if (index === -1) {
            return res.status(404).json({
                error: "Link not found."
            });
        }

        page.links.splice(index, 1);

        writePages(pages);

        res.json({
            message: "Link deleted successfully."
        });

    } catch (error) {
        console.error("Delete link error:", error);

        res.status(500).json({
            error: "Could not delete the link."
        });
    }
});

// PROTECTED DASHBOARD
app.get("/dashboard", requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, "private", "dashboard.html"));
});


//
// PUBLIC PROFILE API
//
app.get("/api/public/:username", (req, res) => {

    try {
        const username = req.params.username;

        // Check username format
        if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
            return res.status(400).json({
                error: "Invalid username."
            });
        }

        const users = readUsers();
        const pages = readPages();

        // Find the requested account
        const user = users.find(user =>
            user.username.toLowerCase() === username.toLowerCase()
        );

        if (!user) {
            return res.status(404).json({
                error: "Profile not found."
            });
        }

        // Find the page belonging to that account
        const page = pages.find(page =>
            page.ownerId === user.id
        );

        if (!page) {
            return res.status(404).json({
                error: "Profile not found."
            });
        }

        // Return ONLY publicly visible data
        res.json({
            username: user.username,
            displayName: page.displayName || user.username,
            bio: page.bio || "",

            theme: ["lavender", "midnight", "forest"]
                .includes(page.theme) ? page.theme : "lavender",

            links: page.links
                .filter(link => link.visible !== false)
                .map(link => ({
                    title: link.title,
                    url: link.url
                }))
        });

    } catch (error) {
        console.error("Public profile error:", error);

        res.status(500).json({
            error: "Unable to load public profile."
        });
    }
});


//
// PUBLIC PROFILE PAGE
//
app.get("/u/:username", (req, res) => {

    res.sendFile(
        path.join(__dirname, "public", "profile.html")
    );

});


//
// MOVE A LINK UP OR DOWN
//
app.patch("/api/links/:id/move", requireAuth, (req, res) => {

    const linkId = req.params.id;
    const { direction } = req.body || {};

    // Accept only the two supported directions
    if (direction !== "up" && direction !== "down") {
        return res.status(400).json({
            error: "Invalid move direction."
        });
    }

    try {
        const pages = readPages();

        // Only access the authenticated user's page
        const page = findUserPage(
            pages,
            req.session.userId
        );

        if (!page) {
            return res.status(404).json({
                error: "Page not found."
            });
        }

        const index = page.links.findIndex(
            link => link.id === linkId
        );

        if (index === -1) {
            return res.status(404).json({
                error: "Link not found."
            });
        }

        const newIndex = direction === "up"
            ? index - 1
            : index + 1;

        // Prevent moving outside the array
        if (newIndex < 0 || newIndex >= page.links.length) {
            return res.status(400).json({
                error: "Link cannot move further."
            });
        }

        // Swap the two links
        const temp = page.links[index];

        page.links[index] = page.links[newIndex];
        page.links[newIndex] = temp;

        // Persist the new ordering
        writePages(pages);

        res.json({
            message: "Link reordered successfully."
        });

    } catch (error) {
        console.error("Reorder error:", error);

        res.status(500).json({
            error: "Could not reorder link."
        });
    }
});


//
// SHOW OR HIDE A LINK
//
app.patch("/api/links/:id/visibility", requireAuth, (req, res) => {

    const linkId = req.params.id;
    const { visible } = req.body || {};

    if (typeof visible !== "boolean") {
        return res.status(400).json({
            error: "Visibility must be true or false."
        });
    }

    try {
        const pages = readPages();

        const page = findUserPage(
            pages,
            req.session.userId
        );

        const link = page?.links.find(
            link => link.id === linkId
        );

        if (!link) {
            return res.status(404).json({
                error: "Link not found."
            });
        }

        link.visible = visible;

        writePages(pages);

        res.json({
            message: "Visibility updated.",
            link: link
        });

    } catch (error) {
        console.error("Visibility error:", error);

        res.status(500).json({
            error: "Could not update visibility."
        });
    }
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
