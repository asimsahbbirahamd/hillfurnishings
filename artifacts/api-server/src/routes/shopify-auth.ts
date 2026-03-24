import { Router, type IRouter, type Request, type Response } from "express";
import crypto from "crypto";
import fs from "fs";
import path from "path";

const router: IRouter = Router();

const CLIENT_ID = process.env["SHOPIFY_CLIENT_ID"] ?? "";
const CLIENT_SECRET = process.env["SHOPIFY_CLIENT_SECRET"] ?? "";
const SHOP = process.env["SHOPIFY_STORE_DOMAIN"] ?? "hillfurnishings.myshopify.com";
const SCOPES = "read_products,write_shipping";

const TOKEN_FILE = path.join(process.cwd(), ".shopify-token");

function getAppBaseUrl(): string {
  // Prefer a stable configured base (deployed URL) so the redirect URI
  // never changes between dev restarts. Falls back to Replit dev domain.
  const configured = process.env["SHOPIFY_REDIRECT_BASE"];
  if (configured) return configured.replace(/\/$/, "");
  const domains = process.env["REPLIT_DOMAINS"] ?? "";
  const primary = domains.split(",")[0]?.trim();
  return primary ? `https://${primary}` : "http://localhost:8080";
}

function saveToken(token: string): void {
  try {
    fs.writeFileSync(TOKEN_FILE, token, "utf8");
  } catch {
    // non-fatal
  }
  process.env["SHOPIFY_ADMIN_ACCESS_TOKEN"] = token;
}

export function loadSavedToken(): string | null {
  // File token takes priority — it is saved by the OAuth callback and
  // is more authoritative than whatever the env var / secret holds.
  try {
    const t = fs.readFileSync(TOKEN_FILE, "utf8").trim();
    if (t) {
      process.env["SHOPIFY_ADMIN_ACCESS_TOKEN"] = t;
      return t;
    }
  } catch {
    // file not found
  }
  // Fall back to env var / Replit secret
  const envToken = process.env["SHOPIFY_ADMIN_ACCESS_TOKEN"];
  if (envToken) return envToken;
  return null;
}

export function getShopifyToken(): string | null {
  return loadSavedToken();
}

// Expose the redirect URI so the dashboard can display it for the user to register
router.get("/shopify/redirect-uri", (_req: Request, res: Response) => {
  res.json({ redirectUri: `${getAppBaseUrl()}/api/shopify/auth/callback` });
});

router.get("/shopify/auth", (_req: Request, res: Response) => {
  if (!CLIENT_ID) {
    res.status(500).send("SHOPIFY_CLIENT_ID not configured");
    return;
  }

  const redirectUri = `${getAppBaseUrl()}/api/shopify/auth/callback`;
  const nonce = crypto.randomBytes(16).toString("hex");

  const authUrl = new URL(`https://${SHOP}/admin/oauth/authorize`);
  authUrl.searchParams.set("client_id", CLIENT_ID);
  authUrl.searchParams.set("scope", SCOPES);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", nonce);
  // Request an offline (permanent) access token — does not expire
  authUrl.searchParams.set("grant_options[]", "offline");

  res.redirect(authUrl.toString());
});

router.get("/shopify/auth/callback", async (req: Request, res: Response) => {
  const { code, shop, hmac } = req.query as Record<string, string>;

  if (!code || !shop || !hmac) {
    res.status(400).send("Missing required OAuth parameters");
    return;
  }

  const params: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.query as Record<string, string>)) {
    if (k !== "hmac" && k !== "signature") params[k] = v;
  }
  const message = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");

  const expectedHmac = crypto
    .createHmac("sha256", CLIENT_SECRET)
    .update(message)
    .digest("hex");

  if (expectedHmac !== hmac) {
    res.status(401).send("HMAC validation failed — request may be forged");
    return;
  }

  const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
    }),
  });

  const tokenData = (await tokenRes.json()) as { access_token?: string; error?: string };

  if (!tokenData.access_token) {
    res.status(500).send(`Token exchange failed: ${JSON.stringify(tokenData)}`);
    return;
  }

  saveToken(tokenData.access_token);

  res.send(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Shopify Connected</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f9fafb; }
    .card { background: white; border-radius: 12px; padding: 40px; max-width: 480px; width: 100%; box-shadow: 0 1px 3px rgba(0,0,0,0.1); text-align: center; }
    .icon { width: 48px; height: 48px; background: #dcfce7; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; font-size: 24px; }
    h2 { margin: 0 0 8px; color: #111; font-size: 20px; }
    p { color: #6b7280; font-size: 14px; margin: 0 0 24px; }
    .token { background: #f3f4f6; border-radius: 8px; padding: 12px; font-family: monospace; font-size: 12px; word-break: break-all; color: #374151; margin-bottom: 24px; text-align: left; }
    a { display: inline-block; background: #4f46e5; color: white; text-decoration: none; padding: 10px 24px; border-radius: 8px; font-size: 14px; font-weight: 500; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">✓</div>
    <h2>Shopify Connected!</h2>
    <p>Your access token has been saved and is ready to use. The carrier service can now be registered.</p>
    <div class="token">${tokenData.access_token}</div>
    <p style="font-size:12px;color:#9ca3af;margin-bottom:16px;">Copy the token above and give it to your developer to save as the SHOPIFY_ADMIN_ACCESS_TOKEN secret.</p>
    <a href="/">← Back to Dashboard</a>
  </div>
</body>
</html>
`);
});

/**
 * Token Exchange — accepts an App Bridge session token (shpss_...) and
 * exchanges it for an offline Admin API access token via Shopify's
 * token exchange grant (December 2025+ approach).
 */
router.post("/shopify/exchange-token", async (req: Request, res: Response) => {
  const { session_token } = req.body as { session_token?: string };

  if (!session_token) {
    res.status(400).json({ error: "session_token is required" });
    return;
  }

  if (!CLIENT_ID || !CLIENT_SECRET) {
    res.status(500).json({ error: "SHOPIFY_CLIENT_ID or SHOPIFY_CLIENT_SECRET not configured" });
    return;
  }

  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
    subject_token: session_token,
    subject_token_type: "urn:ietf:params:oauth:token-type:id_token",
    requested_token_type: "urn:shopify:params:oauth:token-type:offline-access-token",
  });

  const tokenRes = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json",
    },
    body: body.toString(),
  });

  const data = (await tokenRes.json()) as { access_token?: string; error?: string; error_description?: string };

  if (!data.access_token) {
    res.status(400).json({
      error: "Token exchange failed",
      detail: data.error_description ?? data.error,
    });
    return;
  }

  saveToken(data.access_token);
  res.json({
    success: true,
    tokenPrefix: data.access_token.slice(0, 12) + "…",
  });
});

/**
 * Direct token save — for users who have obtained a token directly from
 * Shopify Admin → Apps → Develop apps (custom app install token).
 */
router.post("/shopify/save-token", (req: Request, res: Response) => {
  const { token } = req.body as { token?: string };
  if (!token || token.trim().length < 10) {
    res.status(400).json({ error: "Invalid token" });
    return;
  }
  saveToken(token.trim());
  res.json({ success: true, tokenPrefix: token.trim().slice(0, 12) + "…" });
});

router.get("/shopify/token-status", async (_req: Request, res: Response) => {
  const token = loadSavedToken();
  if (!token) {
    res.json({ connected: false, tokenPrefix: null });
    return;
  }

  // Actually verify the token against Shopify — a stored token is useless if it's invalid
  try {
    const verify = await fetch(`https://${SHOP}/admin/api/2025-01/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({ query: "{ shop { name } }" }),
      signal: AbortSignal.timeout(5000),
    });

    if (!verify.ok) {
      res.json({ connected: false, tokenPrefix: token.slice(0, 12) + "…", error: `Shopify returned ${verify.status} — token is invalid` });
      return;
    }

    const data = (await verify.json()) as { data?: { shop?: { name?: string } }; errors?: unknown };
    if (data.errors) {
      res.json({ connected: false, tokenPrefix: token.slice(0, 12) + "…", error: "Token lacks required scopes" });
      return;
    }

    res.json({ connected: true, tokenPrefix: token.slice(0, 12) + "…", shopName: data.data?.shop?.name });
  } catch {
    res.json({ connected: false, tokenPrefix: token.slice(0, 12) + "…", error: "Could not reach Shopify to verify token" });
  }
});

export default router;
