// index.js
const express = require("express");
const axios = require("axios");

const app = express();

// ===== CONFIG =====
const CLIENT_ID = "1457465523443859476";
const CLIENT_SECRET = "Sizyxf64_Kc6gRK8xZOEBP7DJTmXecxy";
const BOT_TOKEN = "MTQ1NzQ2NTUyMzQ0Mzg1OTQ3Ng.Gg07MP.nUsOWVNod55WCl_y46yqkljyYtjOaOou8frFXE";
const GUILD_ID = "1456373887314034693";
const REDIRECT_URI = "http://localhost:3000/callback";
const DEFAULT_ROLE_ID = "1456374635456237598";

// ===== AUTHORIZED USERS STORAGE =====
// Map<userId, accessToken>
const authorizedUsers = new Map();

// ===== STARTUP LOG =====
console.log("index.js is running!");

// ===== LOGIN ROUTE =====
app.get("/login", (req, res) => {
  console.log("Someone accessed /login");

  const authURL =
    "https://discord.com/oauth2/authorize" +
    `?client_id=${CLIENT_ID}` +
    "&response_type=code" +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    "&scope=identify%20guilds.join";

  res.redirect(authURL);
});

// ===== CALLBACK ROUTE =====
app.get("/callback", async (req, res) => {
  const code = req.query.code;
  if (!code) return res.send("No authorization code.");

  try {
    // Exchange code for access token
    const tokenResponse = await axios.post(
      "https://discord.com/api/oauth2/token",
      new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI
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
      console.log("User added to guild");
    } catch (err) {
      if (err.response?.status !== 201 && err.response?.status !== 204) {
        console.error("Error adding user:", err.response?.data || err.message || err);
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
        console.log("Role assigned");
      } catch (err) {
        console.error("Error assigning role:", err.response?.data || err.message || err);
      }
    }

    // Store user in Map for auto-rejoin
    authorizedUsers.set(userId, accessToken);

    res.send("✅ Authorized and added to server!");
  } catch (err) {
    console.error("Callback error:", err.response?.data || err.message || err);
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
      // User exists, nothing to do
    } catch (err) {
      if (err.response?.status === 404) {
        // User left, re-add them
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
          console.error(`Failed to re-add user ${userId}:`, err2.response?.data || err2.message || err2);
        }
      }
    }
  }
}, 30 * 1000); // every 30 seconds

// ===== START SERVER =====
app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
