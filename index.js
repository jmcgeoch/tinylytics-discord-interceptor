const express = require("express");
const axios = require("axios");
const crypto = require("crypto");
const app = express();

// Capture the raw body so we can verify the HMAC signature against the exact
// bytes Tinylytics signed. express.json() otherwise discards the raw buffer.
app.use(express.json({
    verify: (req, res, buf) => {
        req.rawBody = buf;
    }
}));

const PORT = process.env.PORT || 3000;
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const WEBHOOK_SECRET = process.env.TINYLYTICS_WEBHOOK_SECRET;

// Verify the X-Signature header: sha256=<hex HMAC-SHA256 of the raw body>.
// Uses a timing-safe comparison to avoid leaking the signature via timing.
function verifySignature(req) {
    if (!WEBHOOK_SECRET) {
        console.error("TINYLYTICS_WEBHOOK_SECRET is not set; rejecting webhook.");
        return false;
    }

    const header = req.headers["x-signature"];
    if (!header || !req.rawBody) {
        return false;
    }

    const expected = "sha256=" + crypto
        .createHmac("sha256", WEBHOOK_SECRET)
        .update(req.rawBody)
        .digest("hex");

    const a = Buffer.from(header);
    const b = Buffer.from(expected);
    // timingSafeEqual throws on length mismatch, so guard first.
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Discord embed colors
const COLOR = {
    blue: 3066993,
    pink: 15158332,
    red: 15158332,
    green: 3066993,
    orange: 15105570,
    purple: 10181046,
    grey: 9807270
};

app.post("/", async (req, res) => {
    // Reject anything that isn't a genuine, untampered Tinylytics delivery.
    if (!verifySignature(req)) {
        console.warn("Rejected webhook: invalid or missing signature.");
        return res.status(401).send("Invalid signature");
    }

    const data = req.body;
    // Tinylytics passes the event type in the body (e.g. "new_hit", "new_kudo")
    const eventType = data.event || "unknown";
    const site = data.site || {};

    console.log(`Received ${eventType} event from Tinylytics.`);

    // Shared footer showing which site the event belongs to
    const footer = { text: `${site.name || "Site"} · ID: ${site.id || "N/A"}` };
    const ts = data.timestamp || new Date().toISOString();

    let embed;

    // Format based on the Tinylytics Event Type
    switch (eventType) {
        case "new_hit": {
            const hit = data.hit || {};
            embed = {
                title: "🌐 New Website Hit!",
                color: COLOR.blue,
                url: hit.url,
                fields: [
                    { name: "Page Path", value: `\`${hit.path || "/"}\``, inline: true },
                    { name: "Country", value: hit.country || "Unknown", inline: true },
                    { name: "Source", value: hit.source || "—", inline: true },
                    { name: "Referrer", value: hit.referrer || "Direct", inline: false },
                    { name: "Browser", value: hit.browser_name || "Unknown", inline: true },
                    { name: "Platform", value: hit.platform_name || "Unknown", inline: true },
                    { name: "Mobile", value: hit.is_mobile ? "Yes" : "No", inline: true }
                ],
                footer,
                timestamp: hit.created_at || ts
            };
            break;
        }

        case "new_kudo": {
            const kudo = data.kudo || {};
            embed = {
                title: "❤️ Kudo Received!",
                color: COLOR.pink,
                description: `Someone left a kudo on page: \`${kudo.path || "/"}\`!`,
                footer,
                timestamp: kudo.created_at || ts
            };
            break;
        }

        case "new_event": {
            const ev = data.analytics_event || {};
            embed = {
                title: "📊 Custom Event",
                color: COLOR.purple,
                url: ev.url,
                description: `**${ev.event || "event"}**${ev.value ? `: \`${ev.value}\`` : ""}`,
                fields: [
                    { name: "Page Path", value: `\`${ev.path || "/"}\``, inline: true },
                    { name: "Country", value: ev.country || "Unknown", inline: true },
                    { name: "Source", value: ev.source || "—", inline: true },
                    { name: "Referrer", value: ev.referrer || "Direct", inline: false }
                ],
                footer,
                timestamp: ev.created_at || ts
            };
            break;
        }

        case "monitor_down": {
            const dt = data.downtime || {};
            embed = {
                title: "🔴 Site Down!",
                color: COLOR.red,
                description: `**${site.name || site.url || "Your site"}** is unreachable.`,
                fields: [
                    { name: "Error", value: dt.error || "Unknown", inline: false },
                    { name: "Started", value: dt.started_at_formatted || dt.started_at || "Unknown", inline: true },
                    { name: "Duration", value: dt.duration_formatted || "just now", inline: true }
                ],
                footer,
                timestamp: dt.started_at || ts
            };
            break;
        }

        case "monitor_up": {
            const dt = data.downtime || {};
            embed = {
                title: "🟢 Site Recovered",
                color: COLOR.green,
                description: `**${site.name || site.url || "Your site"}** is back online.`,
                fields: [
                    { name: "Down For", value: dt.duration_formatted || "Unknown", inline: true },
                    { name: "Recovered", value: dt.ended_at_formatted || dt.ended_at || "just now", inline: true }
                ],
                footer,
                timestamp: dt.ended_at || ts
            };
            break;
        }

        case "content_issue": {
            const check = data.check || {};
            embed = {
                title: "⚠️ Content Issue Detected",
                color: COLOR.orange,
                url: check.url,
                description: `A \`${check.issue_type || "content"}\` issue was found.`,
                fields: [
                    { name: "URL", value: check.url || "Unknown", inline: false },
                    { name: "Status Code", value: `${check.status_code ?? "N/A"}`, inline: true },
                    { name: "Details", value: check.error_message || "—", inline: true }
                ],
                footer,
                timestamp: check.checked_at || ts
            };
            break;
        }

        case "new_insight": {
            const insight = data.insight || {};
            const fields = [];
            if (insight.traffic_patterns) fields.push({ name: "Traffic Patterns", value: insight.traffic_patterns, inline: false });
            if (insight.best_content) fields.push({ name: "Best Content", value: insight.best_content, inline: false });
            if (insight.recommendations) fields.push({ name: "Recommendations", value: insight.recommendations, inline: false });
            embed = {
                title: `🧠 New Insight${insight.formatted_insights_date ? ` — ${insight.formatted_insights_date}` : ""}`,
                color: COLOR.blue,
                url: site.dashboard_url,
                description: insight.summary || "A new insight is available.",
                fields,
                footer,
                timestamp: insight.generated_at || ts
            };
            break;
        }

        default: {
            // Fallback for general or unmapped events
            embed = {
                title: `Notification: ${eventType}`,
                color: COLOR.grey,
                description: `Event payload received: \`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``,
                footer,
                timestamp: ts
            };
        }
    }

    const discordPayload = {
        username: "Tinylytics Monitor",
        embeds: [embed]
    };

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
