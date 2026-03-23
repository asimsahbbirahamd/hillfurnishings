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
  if (process.env["SHOPIFY_ADMIN_ACCESS_TOKEN"]) {
    const t = process.env["SHOPIFY_ADMIN_ACCESS_TOKEN"];
    if (t.startsWith("shpat_")) return t;
  }
  try {
    const t = fs.readFileSync(TOKEN_FILE, "utf8").trim();
    if (t) {
      process.env["SHOPIFY_ADMIN_ACCESS_TOKEN"] = t;
      return t;
    }
  } catch {
    // file not found
  }
  return null;
}

export function getShopifyToken(): string | null {
  return loadSavedToken();
}

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

router.get("/shopify/token-status", (_req: Request, res: Response) => {
  const token = loadSavedToken();
  res.json({
    connected: !!token,
    tokenPrefix: token ? token.slice(0, 12) + "…" : null,
  });
});

export default router;
