const express = require("express");
const axios = require("axios");
const app = express();

app.use(express.json());

const PORT = process.env.PORT || 3000;
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

app.post("tinylytics-discord-interceptor-production.up.railway.app", async (req, res) => {
    // Tinylytics passes the event type in this header
    const eventType = req.headers["x-tinylytics-event"] || "unknown";
    const data = req.body;

    console.log(`Received ${eventType} event from Tinylytics.`);

    let discordPayload = {
        username: "Tinylytics Monitor",
        embeds: []
    };

    // Format based on the Tinylytics Event Type
    if (eventType === "hit") {
        discordPayload.embeds.push({
            title: "🌐 New Website Hit!",
            color: 3066993, // Light Blue
            fields: [
                { name: "Page Path", value: `\`${data.path || "/"}\``, inline: true },
                { name: "Country", value: data.country || "Unknown", inline: true },
                { name: "Referrer", value: data.referrer || "Direct", inline: false }
            ],
            footer: { text: `Site ID: ${data.site_id || "N/A"}` },
            timestamp: new Date().toISOString()
        });
    } else if (eventType === "kudo") {
        discordPayload.embeds.push({
            title: "❤️ Kudo Received!",
            color: 15158332, // Red/Pink
            description: `Someone left a kudo on page: \`${data.path || "/"}\`!`,
            footer: { text: `Site ID: ${data.site_id || "N/A"}` },
            timestamp: new Date().toISOString()
        });
    } else {
        // Fallback for general or unmapped events
        discordPayload.embeds.push({
            title: `Notification: ${eventType}`,
            color: 9807270, // Grey
            description: `Event payload received: \`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``
        });
    }

    try {
        // Forward the beautifully formatted embed to Discord
        await axios.post(DISCORD_WEBHOOK_URL, discordPayload);
        return res.status(200).send("Success");
    } catch (err) {
        console.error("Error forwarding to Discord:", err.message);
        return res.status(500).send("Failed to forward");
    }
});

app.listen(PORT, () => console.log(`Tinylytics proxy active on port ${PORT}`));
