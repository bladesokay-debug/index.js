// index.js
require("dotenv").config(); // Load .env locally, ignored on Render
const express = require("express");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const app = express();

// ===== CONFIG FROM ENV =====
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const BOT_TOKEN = process.env.BOT_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const DEFAULT_ROLE_ID = process.env.DEFAULT_ROLE_ID;
const REDIRECT_URI = process.env.REDIRECT_URI;

// ===== PERSISTENT STORAGE =====
const USERS_FILE = path.join(__dirname, "users.json");

// Load authorized users from JSON file
let authorizedUsers = new Map();
if (fs.existsSync(USERS_FILE)) {
  try {
    const data = JSON.parse(fs.readFileSync(USERS_FILE, "utf-8"));
    for (const [id, token] of Object.entries(data)) {
      authorizedUsers.set(id, token);
    }
  } catch (err) {
    console.error("Error reading users.json:", err);
  }
}

// Save users to JSON
function saveUsers() {
  const obj = Object.fromEntries(authorizedUsers);
  fs.writeFileSync(USERS_FILE, JSON.stringify(obj, null, 2));
}

// ===== STARTUP LOG =====
console.log("index.js running!");

// ===== ROUTES =====
app.get("/login", (req, res) => {
  const authURL =
    `https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    "&response_type=code&scope=identify%20guilds.join";
  res.redirect(authURL);
});

app.get("/callback", async (req, res) => {
  const code = req.query.code;
  if (!code) return res.send("No authorization code provided.");

  try {
    // Exchange code for access token
    const tokenResponse = await axios.post(
      "https://discord.com/api/oauth2/token",
      new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const accessToken = tokenResponse.data.access_token;

    // Get user info
    const userResponse = await axios.get(
      "https://discord.com/api/users/@me",
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const userId = userResponse.data.id;
    console.log("User authorized:", userId);

    // Add user to guild immediately
    try {
      await axios.put(
        `https://discord.com/api/guilds/${GUILD_ID}/members/${userId}`,
        { access_token: accessToken },
        { headers: { Authorization: `Bot ${BOT_TOKEN}`, "Content-Type": "application/json" } }
      );
      console.log("User added to guild!");
    } catch (err) {
      if (err.response?.status !== 201 && err.response?.status !== 204) {
        console.error("Error adding user:", err.response?.data || err.message);
      }
    }

    // Assign role
    if (DEFAULT_ROLE_ID) {
      try {
        await axios.put(
          `https://discord.com/api/guilds/${GUILD_ID}/members/${userId}/roles/${DEFAULT_ROLE_ID}`,
          {},
          { headers: { Authorization: `Bot ${BOT_TOKEN}` } }
        );
        console.log("Role assigned successfully!");
      } catch (err) {
        console.error("Error assigning role:", err.response?.data || err.message);
      }
    }

    // Save user in memory & persist
    authorizedUsers.set(userId, accessToken);
    saveUsers();

    res.send("✅ Authorized and added to server!");
  } catch (err) {
    console.error("Callback error:", err.response?.data || err.message);
    res.send("❌ Authorization failed.");
  }
});

// ===== AUTO-REJOIN INTERVAL =====
setInterval(async () => {
  for (const [userId, accessToken] of authorizedUsers.entries()) {
    try {
      // Check if user is still in guild
      await axios.get(
        `https://discord.com/api/guilds/${GUILD_ID}/members/${userId}`,
        { headers: { Authorization: `Bot ${BOT_TOKEN}` } }
      );
    } catch (err) {
      if (err.response?.status === 404) {
        console.log(`User ${userId} left, re-adding...`);
        try {
          await axios.put(
            `https://discord.com/api/guilds/${GUILD_ID}/members/${userId}`,
            { access_token: accessToken },
            { headers: { Authorization: `Bot ${BOT_TOKEN}`, "Content-Type": "application/json" } }
          );
          console.log(`User ${userId} re-added!`);

          // Reassign role
          if (DEFAULT_ROLE_ID) {
            await axios.put(
              `https://discord.com/api/guilds/${GUILD_ID}/members/${userId}/roles/${DEFAULT_ROLE_ID}`,
              {},
              { headers: { Authorization: `Bot ${BOT_TOKEN}` } }
            );
            console.log(`Role reassigned to ${userId}`);
          }
        } catch (err2) {
          console.error(`Failed to re-add user ${userId}:`, err2.response?.data || err2.message);
        }
      }
    }
  }
}, 30 * 1000); // every 30 seconds

// ===== START SERVER =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
