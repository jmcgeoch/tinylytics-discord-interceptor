# Tinylytics → Discord Interceptor

A tiny Node.js/Express service that receives [Tinylytics](https://tinylytics.app) webhooks, formats them into rich Discord embeds, and forwards them to a Discord channel via an incoming webhook.

Instead of a raw JSON dump, you get clean notifications like:

- 🌐 **New Website Hit!** — path, country, referrer, browser, platform
- ❤️ **Kudo Received!**
- 📊 **Custom Event**
- 🔴 **Site Down!** / 🟢 **Site Recovered** — uptime monitoring
- ⚠️ **Content Issue Detected** — broken links / mixed content
- 🧠 **New Insight** — AI-generated summaries

Incoming requests are verified with an HMAC-SHA256 signature, so only genuine Tinylytics deliveries are forwarded.

## How it works

```
Tinylytics ──(signed webhook)──▶ this service ──(formatted embed)──▶ Discord
```

1. Tinylytics POSTs a signed JSON payload to your deployed URL.
2. The service verifies the `X-Signature` header against your signing secret.
3. It maps the event to a Discord embed and POSTs it to your Discord webhook.

## Prerequisites

- Node.js 18+
- A [Tinylytics](https://tinylytics.app) account with a webhook configured
- A Discord [incoming webhook URL](https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks) for the target channel

## Setup

```bash
git clone <this-repo>
cd tinylytics-discord-interceptor
npm install
```

Set the required environment variables:

| Variable | Required | Description |
| --- | --- | --- |
| `DISCORD_WEBHOOK_URL` | ✅ | The Discord incoming webhook URL to post messages to. |
| `TINYLYTICS_WEBHOOK_SECRET` | ✅ | The signing secret shown when you create the Tinylytics webhook. Used to verify request signatures. If unset, **all** webhooks are rejected. |
| `PORT` | ❌ | Port to listen on. Defaults to `3000`. |

Then start it:

```bash
DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/..." \
TINYLYTICS_WEBHOOK_SECRET="your_signing_secret" \
npm start
```

## Configure Tinylytics

In your Tinylytics site settings, create a webhook pointing at your deployed service's **root URL**:

```
https://your-deployment.example.com/
```

The route is registered at `/` (POST). Copy the signing secret Tinylytics gives you into `TINYLYTICS_WEBHOOK_SECRET`.

## Deploying

This runs anywhere that can run a Node process. It was built for [Railway](https://railway.app):

1. Create a new project from this repo.
2. Add the `DISCORD_WEBHOOK_URL` and `TINYLYTICS_WEBHOOK_SECRET` environment variables.
3. Deploy, then use the generated public URL as your Tinylytics webhook endpoint.

Railway sets `PORT` automatically; the service reads it.

## Signature verification

Tinylytics signs the exact raw JSON body with your signing secret and sends:

```
X-Signature: sha256=<hex HMAC-SHA256 digest>
```

The service recomputes the HMAC over the **raw** request body (captured before JSON parsing) and compares it to the header using a timing-safe comparison. Requests with a missing or invalid signature receive `401 Invalid signature` and are never forwarded to Discord.

## Supported events

All events documented in the [Tinylytics webhook payload reference](https://tinylytics.app/docs/webhooks#payload-reference) are handled:

| Tinylytics event | Discord embed |
| --- | --- |
| `new_hit` | 🌐 New Website Hit! |
| `new_kudo` | ❤️ Kudo Received! |
| `new_event` | 📊 Custom Event |
| `monitor_down` | 🔴 Site Down! |
| `monitor_up` | 🟢 Site Recovered |
| `content_issue` | ⚠️ Content Issue Detected |
| `new_insight` | 🧠 New Insight |
| _anything else_ | Raw JSON fallback embed |

Unrecognized event types fall back to an embed containing the raw payload, so nothing is silently dropped.

## Responses

| Status | Meaning |
| --- | --- |
| `200 Success` | Event received, verified, and forwarded to Discord. |
| `401 Invalid signature` | Missing/invalid signature, or the secret isn't configured. |
| `500 Failed to forward` | Signature was valid but the Discord request failed. |

## License

MIT
