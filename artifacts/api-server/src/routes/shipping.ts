import { Router, type IRouter, type Request, type Response } from "express";
import { fetchVariantDimensions } from "../lib/shopify";
import { getShippitQuotes, calculateChargedWeight } from "../lib/shippit";
import type { ParcelAttributes } from "../lib/shippit";

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

function normalisedServiceCode(courierType: string, serviceLevel: string): string {
  return `SHIPPIT_${courierType.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_${serviceLevel.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
}

function normalisedServiceName(courierType: string, serviceLevel: string): string {
  const level = serviceLevel.charAt(0).toUpperCase() + serviceLevel.slice(1).toLowerCase();
  return `${courierType} – ${level}`;
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
      const weightKg = (item.grams * item.quantity) / 1000;
      const dims = dimensionsMap.get(item.variant_id);

      const chargedWeight = calculateChargedWeight(
        weightKg,
        dims?.length ?? null,
        dims?.width ?? null,
        dims?.height ?? null
      );

      log.info(
        {
          variantId: item.variant_id,
          sku: item.sku,
          deadWeightKg: weightKg,
          chargedWeightKg: chargedWeight,
          dimensions: dims ?? "not found",
        },
        "Parcel weight calculation"
      );

      const parcel: ParcelAttributes = {
        qty: item.quantity,
        weight: Math.max(chargedWeight, 0.1),
      };

      if (dims?.length !== null && dims?.length !== undefined) parcel.length = dims.length;
      if (dims?.width !== null && dims?.width !== undefined) parcel.width = dims.width;
      if (dims?.height !== null && dims?.height !== undefined) parcel.depth = dims.height;

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
      });
    } catch (err) {
      log.error({ err }, "Shippit quotes API failed");
      res.json({ rates: [] });
      return;
    }

    const rates: ShopifyRate[] = [];

    for (const carrier of shippitQuotes) {
      if (!carrier.success || !Array.isArray(carrier.quotes) || carrier.quotes.length === 0) continue;
      const carrierServiceLevel = carrier.service_level as string | undefined;
      for (const quote of carrier.quotes) {
        if (!quote.price || quote.price <= 0) continue;
        const serviceLevel = quote.service_level ?? carrierServiceLevel ?? "standard";
        const priceCents = Math.round(quote.price * 100).toString();
        rates.push({
          service_name: normalisedServiceName(carrier.courier_type, serviceLevel),
          service_code: normalisedServiceCode(carrier.courier_type, serviceLevel),
          total_price: priceCents,
          description: quote.estimated_transit_time ? `Est. ${quote.estimated_transit_time}` : `Shipped via ${carrier.courier_type}`,
          currency: currency ?? "AUD",
        });
      }
    }

    log.info({ rateCount: rates.length }, "Returning shipping rates to Shopify");
    res.json({ rates });
  } catch (err) {
    req.log.error({ err }, "Unexpected error in shipping/rates");
    res.json({ rates: [] });
  }
});

router.post("/shipping/register", async (_req: Request, res: Response) => {
  const SHOPIFY_STORE_DOMAIN = process.env["SHOPIFY_STORE_DOMAIN"]!;
  const SHOPIFY_ADMIN_ACCESS_TOKEN = process.env["SHOPIFY_ADMIN_ACCESS_TOKEN"]!;
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
        "X-Shopify-Access-Token": SHOPIFY_ADMIN_ACCESS_TOKEN,
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

export default router;
