require("dotenv").config();

const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { rateLimit } = require("express-rate-limit");

// Configuration
const app = express();
const PORT = process.env.PORT || 3000;
const APP_ORIGIN = process.env.APP_ORIGIN;
const SESSION_SECRET = process.env.SESSION_SECRET;
const SESSION_COOKIE = "linkspace.sid";
const usersFile = path.join(__dirname, "data", "users.json");
const pagesFile = path.join(__dirname, "data", "pages.json");
const allowedThemes = ["lavender", "midnight", "forest"];
const usernamePattern = /^[a-zA-Z0-9_]{3,20}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const writeMethods = ["POST", "PUT", "PATCH", "DELETE"];

if (!SESSION_SECRET) throw new Error("SESSION_SECRET is missing from .env");
if (!APP_ORIGIN) throw new Error("APP_ORIGIN is missing from .env");

// Middleware and authentication
app.use(express.json({ limit: "10kb" }));
app.use(session({
    name: SESSION_COOKIE,
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 1000 * 60 * 60
    }
}));

function requireSameOrigin(req, res, next) {
    if (writeMethods.includes(req.method) && req.get("Origin") !== APP_ORIGIN) {
        return res.status(403).json({ error: "Request origin not permitted." });
    }
    next();
}

function requireAuth(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).send("Unauthorized. Please log in.");
    }
    next();
}

app.use(requireSameOrigin);
app.use(express.static(path.join(__dirname, "public")));

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Too many authentication requests. Try again later." }
});

// Shared JSON persistence, with separate account/page wrappers.
function readJson(file) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function readUsers() {
    return readJson(usersFile);
}

function writeUsers(users) {
    writeJson(usersFile, users);
}

function readPages() {
    return readJson(pagesFile);
}

function writePages(pages) {
    writeJson(pagesFile, pages);
}

function findUserPage(pages, userId) {
    return pages.find(page => page.ownerId === userId);
}

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

// Reuse link validation for creation and editing.
function isValidLinkUrl(value) {
    if (typeof value !== "string" || value.length > 2048 || value !== value.trim()) {
        return false;
    }
    try {
        const url = new URL(value);
        return ["https:", "http:"].includes(url.protocol) &&
            !url.username && !url.password &&
            Boolean(url.hostname) && !/\s/.test(url.hostname);
    } catch {
        return false;
    }
}

function isValidLink(title, url) {
    return typeof title === "string" &&
        typeof url === "string" &&
        title.trim().length >= 1 && title.trim().length <= 60 &&
        isValidLinkUrl(url);
}

function serverError(res, error, context, message) {
    console.error(context, error);
    return res.status(500).json({ error: message });
}

// Account routes
app.post("/api/register", authLimiter, async (req, res) => {
    const { username, email, password } = req.body || {};
    if (typeof username !== "string" || typeof email !== "string" || typeof password !== "string") {
        return res.status(400).json({ error: "Invalid registration data." });
    }

    const cleanUsername = username.trim();
    const cleanEmail = email.trim().toLowerCase();
    if (!usernamePattern.test(cleanUsername)) {
        return res.status(400).json({ error: "Username must be 3-20 letters, numbers or underscores." });
    }
    if (cleanEmail.length > 254 || !emailPattern.test(cleanEmail)) {
        return res.status(400).json({ error: "Please enter a valid email." });
    }
    if (password.length < 8 || Buffer.byteLength(password, "utf8") > 72) {
        return res.status(400).json({
            error: "Password must be at least 8 characters and no more than 72 UTF-8 bytes."
        });
    }

    try {
        const users = readUsers();
        const accountExists = users.some(user =>
            user.username.toLowerCase() === cleanUsername.toLowerCase() || user.email === cleanEmail
        );
        if (accountExists) {
            return res.status(409).json({ error: "Username or email already exists." });
        }

        const passwordHash = await bcrypt.hash(password, 12);
        const newUser = {
            id: crypto.randomUUID(),
            username: cleanUsername,
            email: cleanEmail,
            passwordHash
        };
        users.push(newUser);
        writeUsers(users);
        res.status(201).json({ message: "Account created successfully." });
    } catch (error) {
        serverError(res, error, "Registration error:", "Registration failed. Please try again.");
    }
});

app.post("/api/login", authLimiter, async (req, res) => {
    const { email, password } = req.body || {};
    if (typeof email !== "string" || typeof password !== "string" ||
        email.length > 254 || password.length > 1024) {
        return res.status(400).json({ error: "Invalid login data." });
    }

    try {
        const users = readUsers();
        const user = users.find(user => user.email === email.trim().toLowerCase());
        if (!user || !await bcrypt.compare(password, user.passwordHash)) {
            return res.status(401).json({ error: "Invalid email or password." });
        }

        // Regenerate the session before storing the authenticated user.
        req.session.regenerate(error => {
            if (error) {
                return res.status(500).json({ error: "Unable to create session." });
            }
            req.session.userId = user.id;
            req.session.save(error => {
                if (error) {
                    return res.status(500).json({ error: "Unable to save session." });
                }
                res.json({ message: "Login successful." });
            });
        });
    } catch (error) {
        serverError(res, error, "Login error:", "Login failed. Please try again.");
    }
});

app.post("/api/logout", (req, res) => {
    req.session.destroy(error => {
        if (error) return res.status(500).json({ error: "Logout failed." });
        res.clearCookie(SESSION_COOKIE);
        res.json({ message: "Logged out successfully." });
    });
});

app.get("/api/me", requireAuth, (req, res) => {
    try {
        const user = readUsers().find(user => user.id === req.session.userId);
        if (!user) return res.status(401).json({ error: "User not found." });
        res.json({ id: user.id, username: user.username, email: user.email });
    } catch (error) {
        serverError(res, error, "Profile error:", "Unable to load profile.");
    }
});

// Private profile routes
app.get("/api/page", requireAuth, (req, res) => {
    try {
        const pages = readPages();
        const page = getOrCreatePage(pages, req.session.userId);
        res.json(page);
    } catch (error) {
        serverError(res, error, "Page read error:", "Could not load your page.");
    }
});

app.put("/api/page", requireAuth, (req, res) => {
    const { displayName, bio, theme } = req.body || {};
    if (typeof displayName !== "string" || typeof bio !== "string" || typeof theme !== "string") {
        return res.status(400).json({ error: "Invalid profile information." });
    }

    const cleanName = displayName.trim();
    const cleanBio = bio.trim();
    if (cleanName.length < 1 || cleanName.length > 50 || cleanBio.length > 300 ||
        !allowedThemes.includes(theme)) {
        return res.status(400).json({ error: "Invalid name, biography or theme." });
    }

    try {
        const pages = readPages();
        const page = getOrCreatePage(pages, req.session.userId);
        page.displayName = cleanName;
        page.bio = cleanBio;
        page.theme = theme;
        writePages(pages);
        res.json({ message: "Profile updated successfully.", page });
    } catch (error) {
        serverError(res, error, "Profile update error:", "Could not update your profile.");
    }
});

// Link management: every mutation searches only the authenticated user's page.
app.post("/api/links", requireAuth, (req, res) => {
    const { title, url } = req.body || {};
    if (!isValidLink(title, url)) {
        return res.status(400).json({ error: "Enter a title (1-60 characters) and a valid URL." });
    }

    try {
        const pages = readPages();
        const page = getOrCreatePage(pages, req.session.userId);
        if (page.links.length >= 100) {
            return res.status(400).json({ error: "Maximum of 100 links per page." });
        }

        const newLink = { id: crypto.randomUUID(), title: title.trim(), url: url.trim() };
        page.links.push(newLink);
        writePages(pages);
        res.status(201).json({ message: "Link added successfully.", link: newLink });
    } catch (error) {
        serverError(res, error, "Create link error:", "Could not add the link.");
    }
});

app.put("/api/links/:id", requireAuth, (req, res) => {
    const { title, url } = req.body || {};
    const linkId = req.params.id;
    if (!isValidLink(title, url)) {
        return res.status(400).json({ error: "Invalid title or URL." });
    }

    try {
        const pages = readPages();
        const page = findUserPage(pages, req.session.userId);
        const link = page?.links.find(link => link.id === linkId);
        if (!link) return res.status(404).json({ error: "Link not found." });

        link.title = title.trim();
        link.url = url.trim();
        writePages(pages);
        res.json({ message: "Link updated successfully.", link });
    } catch (error) {
        serverError(res, error, "Update link error:", "Could not update the link.");
    }
});

app.delete("/api/links/:id", requireAuth, (req, res) => {
    const linkId = req.params.id;
    try {
        const pages = readPages();
        const page = findUserPage(pages, req.session.userId);
        const index = page ? page.links.findIndex(link => link.id === linkId) : -1;
        if (index === -1) return res.status(404).json({ error: "Link not found." });

        page.links.splice(index, 1);
        writePages(pages);
        res.json({ message: "Link deleted successfully." });
    } catch (error) {
        serverError(res, error, "Delete link error:", "Could not delete the link.");
    }
});

app.patch("/api/links/:id/move", requireAuth, (req, res) => {
    const linkId = req.params.id;
    const { direction } = req.body || {};
    if (direction !== "up" && direction !== "down") {
        return res.status(400).json({ error: "Invalid move direction." });
    }

    try {
        const pages = readPages();
        const page = findUserPage(pages, req.session.userId);
        if (!page) return res.status(404).json({ error: "Page not found." });

        const index = page.links.findIndex(link => link.id === linkId);
        if (index === -1) return res.status(404).json({ error: "Link not found." });
        const newIndex = direction === "up" ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= page.links.length) {
            return res.status(400).json({ error: "Link cannot move further." });
        }

        const temp = page.links[index];
        page.links[index] = page.links[newIndex];
        page.links[newIndex] = temp;
        writePages(pages);
        res.json({ message: "Link reordered successfully." });
    } catch (error) {
        serverError(res, error, "Reorder error:", "Could not reorder link.");
    }
});

app.patch("/api/links/:id/visibility", requireAuth, (req, res) => {
    const linkId = req.params.id;
    const { visible } = req.body || {};
    if (typeof visible !== "boolean") {
        return res.status(400).json({ error: "Visibility must be true or false." });
    }

    try {
        const pages = readPages();
        const page = findUserPage(pages, req.session.userId);
        const link = page?.links.find(link => link.id === linkId);
        if (!link) return res.status(404).json({ error: "Link not found." });

        link.visible = visible;
        writePages(pages);
        res.json({ message: "Visibility updated.", link });
    } catch (error) {
        serverError(res, error, "Visibility error:", "Could not update visibility.");
    }
});

// Public profile API: expose only published profile fields and visible links.
app.get("/api/public/:username", (req, res) => {
    try {
        const username = req.params.username;
        if (!usernamePattern.test(username)) {
            return res.status(400).json({ error: "Invalid username." });
        }

        const users = readUsers();
        const pages = readPages();
        const user = users.find(user => user.username.toLowerCase() === username.toLowerCase());
        const page = user ? findUserPage(pages, user.id) : null;
        if (!user || !page) return res.status(404).json({ error: "Profile not found." });

        res.json({
            username: user.username,
            displayName: page.displayName || user.username,
            bio: page.bio || "",
            theme: allowedThemes.includes(page.theme) ? page.theme : "lavender",
            links: page.links.filter(link => link.visible !== false)
                .map(link => ({ title: link.title, url: link.url }))
        });
    } catch (error) {
        serverError(res, error, "Public profile error:", "Unable to load public profile.");
    }
});

// HTML routes
app.get("/dashboard", requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, "private", "dashboard.html"));
});

app.get("/u/:username", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "profile.html"));
});

// Error handling and startup
app.use((error, req, res, next) => {
    if (error instanceof SyntaxError && error.status === 400) {
        return res.status(400).json({ error: "Malformed JSON request." });
    }
    next(error);
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
