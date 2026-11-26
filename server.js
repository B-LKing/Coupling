require("dotenv").config();

const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const sharp = require("sharp");
const { rateLimit } = require("express-rate-limit");

// Configuration
const app = express();
const PORT = process.env.PORT || 3000;
const APP_ORIGIN = process.env.APP_ORIGIN;
const SESSION_SECRET = process.env.SESSION_SECRET;
const SESSION_COOKIE = "linkspace.sid";
const usersFile = path.join(__dirname, "data", "users.json");
const pagesFile = path.join(__dirname, "data", "pages.json");
const avatarsDir = path.join(__dirname, "data", "avatars");
const allowedThemes = ["lavender", "midnight", "forest", "custom"];
const defaultColors = {
    background: "#ffffff", text: "#1f2937",
    linkBackground: "#ede9fe", linkText: "#3730a3"
};
const imageTypes = { "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp" };
const avatarLimit = 5 * 1024 * 1024;
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
            colors: { ...defaultColors },
            links: []
        };
        pages.push(page);
        writePages(pages);
    }
    return page;
}

// Custom palettes contain only the four expected six-digit hex colours.
function isValidColors(colors) {
    return colors !== null && typeof colors === "object" && !Array.isArray(colors) &&
        Object.keys(defaultColors).every(key =>
            typeof colors[key] === "string" && /^#[0-9a-f]{6}$/i.test(colors[key]));
}

function getColors(colors) {
    return Object.fromEntries(Object.keys(defaultColors).map(key => [
        key, isValidColors(colors) ? colors[key] : defaultColors[key]
    ]));
}

// File names are generated from server-owned user IDs, never upload names.
function avatarFile(userId) {
    return path.join(avatarsDir, userId + ".jpg");
}

function sendAvatar(res, userId) {
    const file = avatarFile(userId);
    if (!fs.existsSync(file)) return res.status(404).end();
    res.set("Cache-Control", "no-store");
    res.set("X-Content-Type-Options", "nosniff");
    return res.sendFile(file, { cacheControl: false });
}

function detectImageFormat(buffer) {
    if (!Buffer.isBuffer(buffer)) return null;
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpeg";
    if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "png";
    if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "webp";
    return null;
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
        res.json({ ...page, colors: getColors(page.colors),
            avatarUrl: fs.existsSync(avatarFile(req.session.userId)) ? "/api/page/avatar" : null });
    } catch (error) {
        serverError(res, error, "Page read error:", "Could not load your page.");
    }
});

app.put("/api/page", requireAuth, (req, res) => {
    const { displayName, bio, theme, colors } = req.body || {};
    if (typeof displayName !== "string" || typeof bio !== "string" || typeof theme !== "string") {
        return res.status(400).json({ error: "Invalid profile information." });
    }

    const cleanName = displayName.trim();
    const cleanBio = bio.trim();
    if (cleanName.length < 1 || cleanName.length > 50 || cleanBio.length > 300 ||
        !allowedThemes.includes(theme)) {
        return res.status(400).json({ error: "Invalid name, biography or theme." });
    }

    if ((theme === "custom" || colors !== undefined) && !isValidColors(colors)) {
        return res.status(400).json({ error: "Choose four valid hexadecimal colours." });
    }

    try {
        const pages = readPages();
        const page = getOrCreatePage(pages, req.session.userId);
        page.displayName = cleanName;
        page.bio = cleanBio;
        page.theme = theme;
        if (colors !== undefined) page.colors = getColors(colors);
        writePages(pages);
        res.json({ message: "Profile updated successfully.", page });
    } catch (error) {
        serverError(res, error, "Profile update error:", "Could not update your profile.");
    }
});

// Avatar uploads use a separate, size-limited binary body instead of JSON.
app.get("/api/page/avatar", requireAuth, (req, res) => {
    sendAvatar(res, req.session.userId);
});

app.put("/api/page/avatar", requireAuth,
    express.raw({ type: Object.keys(imageTypes), limit: avatarLimit, inflate: false }),
    async (req, res) => {
        const expectedFormat = imageTypes[req.get("Content-Type")?.split(";")[0].trim().toLowerCase()];
        if (!expectedFormat || detectImageFormat(req.body) !== expectedFormat) {
            return res.status(400).json({ error: "Upload a JPEG, PNG or WebP image." });
        }

        let image;
        try {
            // Decode the image, limit pixel count, crop and re-encode without original metadata.
            const source = sharp(req.body, { limitInputPixels: 25_000_000 });
            const metadata = await source.metadata();
            if (metadata.format !== expectedFormat || (metadata.pages || 1) > 1) {
                return res.status(400).json({ error: "Choose a non-animated JPEG, PNG or WebP image." });
            }
            image = await source.rotate().resize(400, 400, { fit: "cover" })
                .flatten({ background: "#ffffff" }).jpeg({ quality: 85 }).toBuffer();
        } catch {
            return res.status(400).json({ error: "Invalid image or image dimensions are too large." });
        }

        try {
            const pages = readPages();
            getOrCreatePage(pages, req.session.userId);
            fs.mkdirSync(avatarsDir, { recursive: true });
            fs.writeFileSync(avatarFile(req.session.userId), image);
            res.json({ message: "Profile picture uploaded.", avatarUrl: "/api/page/avatar" });
        } catch (error) {
            serverError(res, error, "Avatar upload error:", "Could not save your picture.");
        }
    }
);

app.delete("/api/page/avatar", requireAuth, (req, res) => {
    try {
        fs.rmSync(avatarFile(req.session.userId), { force: true });
        res.json({ message: "Profile picture removed." });
    } catch (error) {
        serverError(res, error, "Avatar removal error:", "Could not remove your picture.");
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
            colors: getColors(page.colors),
            avatarUrl: fs.existsSync(avatarFile(user.id))
                ? "/api/public/" + encodeURIComponent(user.username) + "/avatar" : null,
            links: page.links.filter(link => link.visible !== false)
                .map(link => ({ title: link.title, url: link.url }))
        });
    } catch (error) {
        serverError(res, error, "Public profile error:", "Unable to load public profile.");
    }
});

// Published avatars are readable, but only their owner can upload or remove them.
app.get("/api/public/:username/avatar", (req, res) => {
    try {
        if (!usernamePattern.test(req.params.username)) return res.status(404).end();
        const user = readUsers().find(user =>
            user.username.toLowerCase() === req.params.username.toLowerCase());
        if (!user || !findUserPage(readPages(), user.id)) return res.status(404).end();
        sendAvatar(res, user.id);
    } catch (error) {
        serverError(res, error, "Public avatar error:", "Could not load picture.");
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
    if (error.status === 413) {
        return res.status(413).json({ error: req.path === "/api/page/avatar"
            ? "Pictures must be 5 MB or smaller." : "Request is too large." });
    }
    if (error.status === 415) {
        return res.status(415).json({ error: "Unsupported upload encoding." });
    }
    if (error instanceof SyntaxError && error.status === 400) {
        return res.status(400).json({ error: "Malformed JSON request." });
    }
    next(error);
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
