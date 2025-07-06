const express = require("express");
const session = require("express-session");
const cors = require("cors");
const { google } = require("googleapis");
require("dotenv").config();

const app = express();

// ✅ Allow your frontend domain here:
app.use(cors({
  origin: "https://peru-stingray-813298.hostingersite.com",
  credentials: true
}));

app.use(session({
  secret: process.env.SESSION_SECRET || "my-secret",
  resave: false,
  saveUninitialized: true,
}));

// ✅ Update redirect URI to match your Google OAuth Console
const oauth2Client = new google.auth.OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  "https://gsc-auth-backend.onrender.com/auth/callback"
);

const scopes = [
  "https://www.googleapis.com/auth/webmasters.readonly",
  "https://www.googleapis.com/auth/userinfo.email"
];

// 🔐 OAuth Step 1: Redirect user to Google
app.get("/auth/google", (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: scopes
  });
  res.redirect(url);
});

// 🔐 OAuth Step 2: Handle Google callback
app.get("/auth/callback", async (req, res) => {
  const { code } = req.query;
  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    req.session.tokens = tokens;

    // ✅ Redirect to your public frontend dashboard
    res.redirect("https://peru-stingray-813298.hostingersite.com/dashboard");
  } catch (err) {
    console.error("OAuth callback error:", err);
    res.status(500).json({ error: "Authentication failed" });
  }
});

// 📊 Protected API to fetch GSC data
app.get("/api/gsc-data", async (req, res) => {
  if (!req.session.tokens) return res.status(403).json({ error: "Not logged in" });

  oauth2Client.setCredentials(req.session.tokens);
  const searchConsole = google.searchconsole({ version: "v1", auth: oauth2Client });

  try {
    const sites = await searchConsole.sites.list();
    const ownedSites = sites.data.siteEntry.filter(s => s.permissionLevel === "siteOwner");

    if (!ownedSites.length) return res.status(403).json({ error: "No accessible sites" });

    const response = await searchConsole.searchanalytics.query({
      siteUrl: ownedSites[0].siteUrl,
      requestBody: {
        startDate: "2024-05-01",
        endDate: "2025-07-01",
        dimensions: ["date"],
        rowLimit: 1000,
      }
    });

    const data = response.data.rows.map(row => ({
      date: row.keys[0],
      clicks: row.clicks
    }));

    res.json({ site: ownedSites[0].siteUrl, data });
  } catch (err) {
    console.error("GSC API error:", err);
    res.status(500).json({ error: "Failed to fetch GSC data" });
  }
});

app.listen(3001, () => console.log("Server running on http://localhost:3001"));
