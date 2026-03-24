import { Router, type IRouter, type Request, type Response } from "express";
import fs from "fs";
import path from "path";
import { fetchVariantDimensions } from "../lib/shopify";
import { getShippitQuotes, calculateChargedWeight } from "../lib/shippit";
import type { ParcelAttributes } from "../lib/shippit";

const TOKEN_FILE = path.join(process.cwd(), ".shopify-token");

function getAdminToken(): string {
  try {
    const t = fs.readFileSync(TOKEN_FILE, "utf8").trim();
    if (t) return t;
  } catch { /* file not present */ }
  return process.env["SHOPIFY_ADMIN_ACCESS_TOKEN"] ?? "";
}

const router: IRouter = Router();

interface ShopifyCartItem {
  name: string;
  sku: string;
  quantity: number;
  grams: number;
  price: number;
  vendor: string;
  requires_shipping: boolean;
  taxable: boolean;
  fulfillment_service: string;
  properties: Record<string, unknown> | null;
  product_id: number;
  variant_id: number;
}

interface ShopifyRateRequest {
  rate: {
    origin: {
      country: string;
      postal_code: string;
      province: string;
      city: string;
    };
    destination: {
      country: string;
      postal_code: string;
      province: string;
      city: string;
      name: string;
    };
    items: ShopifyCartItem[];
    currency: string;
    locale: string;
  };
}

interface ShopifyRate {
  service_name: string;
  service_code: string;
  total_price: string;
  description: string;
  currency: string;
  min_delivery_date?: string;
  max_delivery_date?: string;
}

// Service levels to hide from customers
// - express: too fast / premium pricing not relevant for furniture
// - priority / on_demand: same-day carriers with erratic/extreme prices
// - click_and_collect: pickup only, not relevant for online checkout
const SKIP_LEVELS = new Set(["express", "priority", "on_demand", "click_and_collect"]);

function cleanCourierName(courierType: string): string {
  return courierType
    .replace(/AuNz$/i, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

function normalisedServiceCode(courierType: string, serviceLevel: string): string {
  return `SHIPPIT_${courierType.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_${serviceLevel.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
}

/**
 * Expand all successful Shippit carrier quotes into individual rate entries,
 * skipping express and click-and-collect service levels.
 */
function expandRates(shippitQuotes: ShippitQuoteResponseItem[]) {
  const results: { serviceName: string; serviceCode: string; price: number; transitTime?: string; carrier: string }[] = [];

  for (const carrier of shippitQuotes) {
    if (!carrier.success || !Array.isArray(carrier.quotes) || carrier.quotes.length === 0) continue;
    const carrierLevel = (carrier.service_level as string | undefined) ?? "standard";

    for (const quote of carrier.quotes) {
      if (!quote.price || quote.price <= 0) continue;
      const level = (quote.service_level ?? carrierLevel).toLowerCase();
      if (SKIP_LEVELS.has(level)) continue;
      results.push({
        serviceName: cleanCourierName(carrier.courier_type),
        serviceCode: normalisedServiceCode(carrier.courier_type, level),
        price: quote.price,
        transitTime: quote.estimated_transit_time,
        carrier: carrier.courier_type,
      });
    }
  }

  return results;
}

router.post("/shipping/rates", async (req: Request, res: Response) => {
  const log = req.log;

  try {
    const body = req.body as ShopifyRateRequest;

    if (!body?.rate) {
      res.status(400).json({ error: "Missing rate payload" });
      return;
    }

    const { rate } = body;
    const { destination, items, currency } = rate;

    const shippableItems = items.filter((i) => i.requires_shipping);

    if (shippableItems.length === 0) {
      res.json({ rates: [] });
      return;
    }

    const uniqueVariantIds = [...new Set(shippableItems.map((i) => i.variant_id))];

    log.info({ variantIds: uniqueVariantIds }, "Fetching variant dimensions from Shopify");

    let dimensionsMap: Awaited<ReturnType<typeof fetchVariantDimensions>>;
    try {
      dimensionsMap = await fetchVariantDimensions(uniqueVariantIds);
    } catch (err) {
      log.error({ err }, "Failed to fetch variant dimensions — falling back to weight only");
      dimensionsMap = new Map();
    }

    const parcels: ParcelAttributes[] = shippableItems.map((item) => {
      // Per-item dead weight — Shippit's qty field means "number of identical parcels",
      // so weight must be PER PARCEL, not the total across all quantities.
      const deadWeightPerItemKg = item.grams / 1000;
      const dims = dimensionsMap.get(item.variant_id);

      // Only use dimensions if ALL THREE are present — partial dims cause carrier errors.
      const allDimsPresent =
        dims?.length != null && dims?.width != null && dims?.height != null;

      const chargedWeightPerItemKg = calculateChargedWeight(
        deadWeightPerItemKg,
        allDimsPresent ? (dims!.length!) : null,
        allDimsPresent ? (dims!.width!) : null,
        allDimsPresent ? (dims!.height!) : null,
      );

      log.info(
        {
          variantId: item.variant_id,
          sku: item.sku,
          quantity: item.quantity,
          deadWeightPerItemKg,
          chargedWeightPerItemKg,
          volumetricKg: allDimsPresent
            ? +(dims!.length! * dims!.width! * dims!.height! * 250).toFixed(3)
            : null,
          dimensions: allDimsPresent
            ? { length: dims!.length, width: dims!.width, height: dims!.height }
            : "not found",
        },
        "Parcel weight calculation"
      );

      const parcel: ParcelAttributes = {
        qty: item.quantity,
        weight: Math.max(chargedWeightPerItemKg, 0.1),
      };

      // Only attach dimensions when the full set is available
      if (allDimsPresent) {
        parcel.length = dims!.length!;
        parcel.width  = dims!.width!;
        parcel.depth  = dims!.height!;
      }

      return parcel;
    });

    log.info(
      {
        dropoff: {
          postcode: destination.postal_code,
          suburb: destination.city,
          state: destination.province,
        },
        parcelCount: parcels.length,
        parcels,
      },
      "Calling Shippit for quotes"
    );

    let shippitQuotes: Awaited<ReturnType<typeof getShippitQuotes>>;
    try {
      shippitQuotes = await getShippitQuotes({
        dropoff_postcode: destination.postal_code,
        dropoff_state: destination.province,
        dropoff_suburb: destination.city,
        dropoff_country_code: destination.country,
        parcel_attributes: parcels,
        return_all_quotes: true,
        service_levels: ["standard"],
      });
    } catch (err) {
      log.error({ err }, "Shippit quotes API failed");
      res.json({ rates: [] });
      return;
    }

    const expanded = expandRates(shippitQuotes);

    const rates: ShopifyRate[] = expanded.map(r => {
      const transitNote = r.transitTime ? `Est. ${r.transitTime}` : "";
      return {
        service_name: r.serviceName,
        service_code: r.serviceCode,
        total_price: Math.round(r.price * 100).toString(),
        description: transitNote ? `${transitNote} · Calculated by Hill Furnishings` : "Calculated by Hill Furnishings",
        currency: currency ?? "AUD",
      };
    });

    log.info({ rateCount: rates.length }, "Returning shipping rates to Shopify");
    res.json({ rates });
  } catch (err) {
    req.log.error({ err }, "Unexpected error in shipping/rates");
    res.json({ rates: [] });
  }
});

async function shopifyRequest(urlPath: string, method = "GET", body?: unknown) {
  const SHOPIFY_STORE_DOMAIN = process.env["SHOPIFY_STORE_DOMAIN"]!;
  const res = await fetch(`https://${SHOPIFY_STORE_DOMAIN}/admin/api/2025-01${urlPath}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": getAdminToken(),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) throw new Error(`Shopify API ${res.status}: ${await res.text()}`);
  return res.json();
}

router.get("/shipping/carrier-status", async (_req: Request, res: Response) => {
  try {
    const json = await shopifyRequest("/carrier_services.json") as {
      carrier_services?: { id: number; name: string; active: boolean; callback_url: string }[];
    };
    const services = json.carrier_services ?? [];
    const ours = services.find(s => s.name === "Shippit Live Rates") ?? null;
    res.json({ found: !!ours, service: ours });
  } catch (err) {
    res.status(500).json({ found: false, error: String(err) });
  }
});

router.post("/shipping/carrier-set-active", async (req: Request, res: Response) => {
  try {
    const { active } = req.body as { active: boolean };
    const listJson = await shopifyRequest("/carrier_services.json") as {
      carrier_services?: { id: number; name: string; active: boolean }[];
    };
    const ours = (listJson.carrier_services ?? []).find(s => s.name === "Shippit Live Rates");
    if (!ours) {
      res.status(404).json({ error: "Carrier service 'Shippit Live Rates' not found. Register it first." });
      return;
    }
    const updated = await shopifyRequest(`/carrier_services/${ours.id}.json`, "PUT", {
      carrier_service: { id: ours.id, active },
    }) as { carrier_service?: { id: number; name: string; active: boolean } };
    res.json({ success: true, service: updated.carrier_service });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

router.post("/shipping/register", async (_req: Request, res: Response) => {
  const SHOPIFY_STORE_DOMAIN = process.env["SHOPIFY_STORE_DOMAIN"]!;
  const REPLIT_DOMAINS = process.env["REPLIT_DOMAINS"] ?? "";
  const primaryDomain = REPLIT_DOMAINS.split(",")[0]?.trim();

  if (!primaryDomain) {
    res.status(500).json({ error: "REPLIT_DOMAINS not set — cannot determine callback URL" });
    return;
  }

  const callbackUrl = `https://${primaryDomain}/api/shipping/rates`;

  const mutation = `
    mutation {
      carrierServiceCreate(input: {
        name: "Shippit Live Rates"
        callbackUrl: "${callbackUrl}"
        active: true
        supportsServiceDiscovery: true
      }) {
        carrierService {
          id
          name
          callbackUrl
          active
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const response = await fetch(
    `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2025-01/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": getAdminToken(),
      },
      body: JSON.stringify({ query: mutation }),
    }
  );

  const json = (await response.json()) as {
    data?: { carrierServiceCreate?: { carrierService?: unknown; userErrors?: { field: string; message: string }[] } };
    errors?: unknown[];
  };

  if (json.errors || json.data?.carrierServiceCreate?.userErrors?.length) {
    res.status(400).json({
      error: "Failed to register carrier service",
      details: json.errors ?? json.data?.carrierServiceCreate?.userErrors,
    });
    return;
  }

  res.json({
    success: true,
    callbackUrl,
    carrierService: json.data?.carrierServiceCreate?.carrierService,
  });
});

router.get("/shipping/test", async (req: Request, res: Response) => {
  const log = req.log;

  try {
    log.info("Running Shippit test quote");
    const quotes = await getShippitQuotes({
      dropoff_postcode: "2000",
      dropoff_state: "NSW",
      dropoff_suburb: "Sydney",
      dropoff_country_code: "AU",
      parcel_attributes: [{ qty: 1, weight: 22, length: 1.47, width: 0.95, depth: 0.57 }],
      return_all_quotes: true,
    });

    res.json({
      success: true,
      message: "Shippit API connection OK",
      quoteCount: quotes.reduce((sum, c) => sum + (c.quotes?.length ?? 0), 0),
      quotes,
    });
  } catch (err) {
    log.error({ err }, "Shippit test failed");
    res.status(500).json({ success: false, error: String(err) });
  }
});

// Dedicated tester endpoint — accepts dimensions directly, bypasses Shopify variant lookup
router.post("/shipping/quote-test", async (req: Request, res: Response) => {
  const log = req.log;
  try {
    const {
      weightKg,
      lengthCm,
      widthCm,
      heightCm,
      destPostcode,
      destSuburb,
      destState,
    } = req.body as {
      weightKg: number;
      lengthCm: number;
      widthCm: number;
      heightCm: number;
      destPostcode: string;
      destSuburb: string;
      destState: string;
    };

    const lengthM = lengthCm / 100;
    const widthM = widthCm / 100;
    const heightM = heightCm / 100;

    // Shippit cubic weight: volume (m³) × 250 kg/m³  =  L_cm × W_cm × H_cm / 4000
    const volumetricKg = lengthM * widthM * heightM * 250;
    const chargedKg = Math.max(weightKg, volumetricKg);

    log.info(
      { weightKg, lengthCm, widthCm, heightCm, volumetricKg: +volumetricKg.toFixed(3), chargedKg: +chargedKg.toFixed(3) },
      "quote-test weight calculation"
    );

    const quotes = await getShippitQuotes({
      dropoff_postcode: destPostcode,
      dropoff_state: destState,
      dropoff_suburb: destSuburb,
      dropoff_country_code: "AU",
      parcel_attributes: [{
        qty: 1,
        weight: +chargedKg.toFixed(3),
        length: +lengthM.toFixed(4),
        width: +widthM.toFixed(4),
        depth: +heightM.toFixed(4),
      }],
      return_all_quotes: true,
    });

    const expanded = expandRates(quotes);
    const rates = expanded.map(r => {
      const transit = r.transitTime ? `Est. ${r.transitTime}` : "";
      return {
        service_name: r.serviceName,
        service_code: r.serviceCode,
        total_price: Math.round(r.price * 100).toString(),
        description: transit ? `${transit} · Calculated by Hill Furnishings` : "Calculated by Hill Furnishings",
        currency: "AUD",
        carrier: r.carrier,
      };
    });

    res.json({
      rates,
      calc: {
        deadKg: weightKg,
        volumetricKg: +volumetricKg.toFixed(3),
        chargedKg: +chargedKg.toFixed(3),
        method: volumetricKg > weightKg ? "volumetric" : "dead weight",
      },
    });
  } catch (err) {
    log.error({ err }, "quote-test failed");
    res.status(500).json({ rates: [], error: String(err) });
  }
});

// Debug: returns full raw Shippit response including failures
router.post("/shipping/debug-raw", async (req: Request, res: Response) => {
  try {
    const { weightKg, lengthCm, widthCm, heightCm, destPostcode, destSuburb, destState } =
      req.body as { weightKg: number; lengthCm: number; widthCm: number; heightCm: number; destPostcode: string; destSuburb: string; destState: string };

    const lM = lengthCm / 100, wM = widthCm / 100, hM = heightCm / 100;
    const volKg = lM * wM * hM * 250;
    const chargedKg = Math.max(weightKg, volKg);

    const raw = await getShippitQuotes({
      dropoff_postcode: destPostcode,
      dropoff_state: destState,
      dropoff_suburb: destSuburb,
      dropoff_country_code: "AU",
      parcel_attributes: [{ qty: 1, weight: +chargedKg.toFixed(3), length: +lM.toFixed(4), width: +wM.toFixed(4), depth: +hM.toFixed(4) }],
      return_all_quotes: true,
    });

    res.json({ calc: { deadKg: weightKg, volumetricKg: +volKg.toFixed(3), chargedKg: +chargedKg.toFixed(3) }, raw });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
