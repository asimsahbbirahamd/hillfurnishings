import { logger } from "./logger";

const SHIPPIT_API_URL = process.env["SHIPPIT_API_URL"] ?? "https://app.shippit.com/api/3";
const SHIPPIT_API_KEY = process.env["SHIPPIT_API_KEY"]!;

const PICKUP_SUBURB = process.env["PICKUP_SUBURB"] ?? "Doonan";
const PICKUP_POSTCODE = process.env["PICKUP_POSTCODE"] ?? "4562";
const PICKUP_STATE = process.env["PICKUP_STATE"] ?? "QLD";

export interface ParcelAttributes {
  qty: number;
  weight: number;
  length?: number;
  width?: number;
  depth?: number;
}

export interface ShippitQuoteRequest {
  dropoff_postcode: string;
  dropoff_state: string;
  dropoff_suburb: string;
  dropoff_country_code?: string;
  parcel_attributes: ParcelAttributes[];
  return_all_quotes?: boolean;
}

export interface ShippitQuote {
  courier_type: string;
  courier_name?: string;
  service_level: string;
  price: number;
  estimated_transit_time?: string;
  estimated_delivery?: string;
}

export interface ShippitQuoteResponseItem {
  courier_type: string;
  service_level?: string;
  quotes: ShippitQuote[] | null;
  success?: boolean;
  error?: string | null;
  failures?: ShippitQuoteResponseItem[];
}

export function calculateChargedWeight(
  weightKg: number,
  lengthM: number | null,
  widthM: number | null,
  heightM: number | null
): number {
  if (lengthM !== null && widthM !== null && heightM !== null) {
    // Shippit cubic weight: volume (m³) × 250 kg/m³
    // Equivalent to: L_cm × W_cm × H_cm / 4000
    const volumetricKg = lengthM * widthM * heightM * 250;
    return Math.max(weightKg, volumetricKg);
  }
  return weightKg;
}

export async function getShippitQuotes(
  quoteRequest: ShippitQuoteRequest
): Promise<ShippitQuoteResponseItem[]> {
  const url = `${SHIPPIT_API_URL}/quotes`;

  const body = {
    quote: {
      dropoff_postcode: quoteRequest.dropoff_postcode,
      dropoff_state: quoteRequest.dropoff_state,
      dropoff_suburb: quoteRequest.dropoff_suburb,
      dropoff_country_code: quoteRequest.dropoff_country_code ?? "AU",
      pickup_suburb: PICKUP_SUBURB,
      pickup_postcode: PICKUP_POSTCODE,
      pickup_state: PICKUP_STATE,
      parcel_attributes: quoteRequest.parcel_attributes,
      return_all_quotes: quoteRequest.return_all_quotes ?? true,
    },
  };

  logger.info({ url, parcelCount: quoteRequest.parcel_attributes.length }, "Calling Shippit quotes API");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: SHIPPIT_API_KEY,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    logger.error({ status: response.status, body: text }, "Shippit API error");
    throw new Error(`Shippit API error: ${response.status} - ${text}`);
  }

  const json = (await response.json()) as { response?: ShippitQuoteResponseItem[] } | ShippitQuoteResponseItem[];

  if (Array.isArray(json)) return json;
  if (json && typeof json === "object" && "response" in json) {
    return (json as { response: ShippitQuoteResponseItem[] }).response ?? [];
  }

  return [];
}

export { PICKUP_SUBURB, PICKUP_POSTCODE, PICKUP_STATE };
