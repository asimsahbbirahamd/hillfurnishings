import { logger } from "./logger";
import fs from "fs";
import path from "path";

const SHOPIFY_STORE_DOMAIN = process.env["SHOPIFY_STORE_DOMAIN"]!;
const SHOPIFY_API_VERSION = "2025-01";
const NAMESPACE = process.env["SHOPIFY_METAFIELD_NAMESPACE"] ?? "custom";
const LENGTH_KEY = process.env["SHOPIFY_METAFIELD_LENGTH_KEY"] ?? "length";
const WIDTH_KEY = process.env["SHOPIFY_METAFIELD_WIDTH_KEY"] ?? "width";
const HEIGHT_KEY = process.env["SHOPIFY_METAFIELD_HEIGHT_KEY"] ?? "height";
const DIMENSION_UNIT = process.env["DIMENSION_UNIT"] ?? "cm";

const TOKEN_FILE = path.join(process.cwd(), ".shopify-token");

/**
 * Get the Shopify Admin API token. Priority order:
 * 1. File saved by OAuth callback (most authoritative — overrides env var)
 * 2. SHOPIFY_ADMIN_ACCESS_TOKEN env var / secret
 */
function getToken(): string {
  try {
    const fileToken = fs.readFileSync(TOKEN_FILE, "utf8").trim();
    if (fileToken) return fileToken;
  } catch {
    // file not present — fall through
  }
  return process.env["SHOPIFY_ADMIN_ACCESS_TOKEN"] ?? "";
}

export interface VariantDimensions {
  variantId: number;
  weightGrams: number;
  length: number | null;
  width: number | null;
  height: number | null;
}

function toMetres(value: number): number {
  if (DIMENSION_UNIT === "cm") return value / 100;
  if (DIMENSION_UNIT === "mm") return value / 1000;
  return value;
}

export function parseMetafieldNumber(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const n = parseFloat(raw);
  return isNaN(n) ? null : n;
}

const QUERY = `
  query getVariantDimensions($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on ProductVariant {
        id
        ${LENGTH_KEY}: metafield(namespace: "${NAMESPACE}", key: "${LENGTH_KEY}") { value }
        ${WIDTH_KEY}: metafield(namespace: "${NAMESPACE}", key: "${WIDTH_KEY}") { value }
        ${HEIGHT_KEY}: metafield(namespace: "${NAMESPACE}", key: "${HEIGHT_KEY}") { value }
      }
    }
  }
`;

interface GraphQLVariantNode {
  id: string;
  [key: string]: { value: string } | string | null | undefined;
}

export async function fetchVariantDimensions(
  variantIds: number[]
): Promise<Map<number, { length: number | null; width: number | null; height: number | null }>> {
  const token = getToken();
  const gids = variantIds.map((id) => `gid://shopify/ProductVariant/${id}`);

  const response = await fetch(
    `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({ query: QUERY, variables: { ids: gids } }),
    }
  );

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    if (response.status === 401) {
      logger.error(
        { status: 401 },
        "Shopify Admin API 401 — token is invalid or expired. " +
        "Complete the OAuth flow via the dashboard 'Connect Shopify' button to fix this."
      );
    } else {
      logger.error({ status: response.status, body }, "Shopify GraphQL request failed");
    }
    throw new Error(`Shopify Admin API error: ${response.status}`);
  }

  const json = (await response.json()) as { data?: { nodes?: GraphQLVariantNode[] }; errors?: unknown[] };

  if (json.errors) {
    logger.error({ errors: json.errors }, "Shopify GraphQL errors");
    throw new Error("Shopify GraphQL returned errors");
  }

  const result = new Map<number, { length: number | null; width: number | null; height: number | null }>();

  for (const node of json.data?.nodes ?? []) {
    if (!node) continue;
    const numericId = parseInt(node.id.replace("gid://shopify/ProductVariant/", ""), 10);
    const rawLength = (node[LENGTH_KEY] as { value: string } | null)?.value;
    const rawWidth = (node[WIDTH_KEY] as { value: string } | null)?.value;
    const rawHeight = (node[HEIGHT_KEY] as { value: string } | null)?.value;

    const lengthParsed = parseMetafieldNumber(rawLength);
    const widthParsed = parseMetafieldNumber(rawWidth);
    const heightParsed = parseMetafieldNumber(rawHeight);

    result.set(numericId, {
      length: lengthParsed !== null ? toMetres(lengthParsed) : null,
      width: widthParsed !== null ? toMetres(widthParsed) : null,
      height: heightParsed !== null ? toMetres(heightParsed) : null,
    });
  }

  return result;
}
