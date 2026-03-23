import { useState, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router as WouterRouter, Route, Switch } from "wouter";

const queryClient = new QueryClient();

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
const API_BASE = "/api";

interface StatusResult {
  ok: boolean;
  label: string;
  detail?: string;
}

function StatusBadge({ ok }: { ok: boolean | null }) {
  if (ok === null)
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
        <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-pulse inline-block" />
        Checking…
      </span>
    );
  return ok ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
      <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
      Connected
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
      <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 inline-block" />
      Not set up
    </span>
  );
}

function Dashboard() {
  const [health, setHealth] = useState<boolean | null>(null);
  const [shippit, setShippit] = useState<StatusResult | null>(null);
  const [shopify, setShopify] = useState<{ connected: boolean; tokenPrefix: string | null } | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [registerResult, setRegisterResult] = useState<string | null>(null);

  const [postcode, setPostcode] = useState("2000");
  const [suburb, setSuburb] = useState("Sydney");
  const [state, setState] = useState("NSW");
  const [weightKg, setWeightKg] = useState("22");
  const [lengthCm, setLengthCm] = useState("147");
  const [widthCm, setWidthCm] = useState("95");
  const [heightCm, setHeightCm] = useState("57");

  useEffect(() => {
    fetch(`${API_BASE}/healthz`)
      .then((r) => r.ok ? setHealth(true) : setHealth(false))
      .catch(() => setHealth(false));

    fetch(`${API_BASE}/shipping/test`)
      .then(async (r) => {
        const j = await r.json();
        if (j.success) {
          setShippit({ ok: true, label: "Shippit API", detail: `${j.quoteCount} quotes returned` });
        } else {
          setShippit({ ok: false, label: "Shippit API", detail: j.error });
        }
      })
      .catch((e) => setShippit({ ok: false, label: "Shippit API", detail: String(e) }));

    fetch(`${API_BASE}/shopify/token-status`)
      .then(async (r) => {
        const j = await r.json();
        setShopify(j);
      })
      .catch(() => setShopify({ connected: false, tokenPrefix: null }));
  }, []);

  async function runQuoteTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const payload = {
        rate: {
          origin: { country: "AU", postal_code: "4562", province: "QLD", city: "Doonan" },
          destination: { country: "AU", postal_code: postcode, province: state, city: suburb, name: "Test Customer" },
          items: [
            {
              name: "Furniture Item",
              sku: "TEST-001",
              quantity: 1,
              grams: Math.round(parseFloat(weightKg) * 1000),
              price: 50000,
              vendor: "Hill Furnishings",
              requires_shipping: true,
              taxable: true,
              fulfillment_service: "manual",
              properties: null,
              product_id: 1,
              variant_id: 1,
            },
          ],
          currency: "AUD",
          locale: "en",
        },
      };
      const res = await fetch(`${API_BASE}/shipping/rates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json();

      const volKg = (parseFloat(lengthCm) * parseFloat(widthCm) * parseFloat(heightCm)) / 250 / 1000;
      const deadKg = parseFloat(weightKg);
      const charged = Math.max(deadKg, volKg).toFixed(1);

      const lines = [
        `Dead weight: ${deadKg} kg`,
        `Volumetric weight: ${volKg.toFixed(1)} kg  (${lengthCm}×${widthCm}×${heightCm} cm ÷ 250,000)`,
        `Charged weight: ${charged} kg`,
        "",
        `Rates returned: ${j.rates?.length ?? 0}`,
        "",
        ...(j.rates ?? []).map(
          (r: { service_name: string; total_price: string }) =>
            `  ${r.service_name}: $${(parseInt(r.total_price) / 100).toFixed(2)}`
        ),
      ];
      setTestResult(lines.join("\n"));
    } catch (e) {
      setTestResult(`Error: ${e}`);
    } finally {
      setTesting(false);
    }
  }

  async function registerCarrierService() {
    setRegistering(true);
    setRegisterResult(null);
    try {
      const res = await fetch(`${API_BASE}/shipping/register`, { method: "POST" });
      const j = await res.json();
      if (j.success) {
        setRegisterResult(`✓ Carrier service registered!\nCallback URL: ${j.callbackUrl}`);
      } else {
        setRegisterResult(`✗ Failed: ${JSON.stringify(j.details ?? j.error, null, 2)}`);
      }
    } catch (e) {
      setRegisterResult(`Error: ${e}`);
    } finally {
      setRegistering(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-sm">HF</div>
        <div>
          <h1 className="text-base font-semibold text-gray-900">Hill Furnishings — Shipping Rate API</h1>
          <p className="text-xs text-gray-500">Shippit × Shopify integration middleware</p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-6">

        {/* Status Cards */}
        <section>
          <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">System Status</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-800">API Server</p>
                <p className="text-xs text-gray-400 mt-0.5">Express + Node.js</p>
              </div>
              <StatusBadge ok={health} />
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-800">Shippit API</p>
                <p className="text-xs text-gray-400 mt-0.5">{shippit?.detail ?? "Connecting…"}</p>
              </div>
              <StatusBadge ok={shippit ? shippit.ok : null} />
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-800">Shopify Admin</p>
                <p className="text-xs text-gray-400 mt-0.5">{shopify?.connected ? shopify.tokenPrefix : "Not connected"}</p>
              </div>
              <StatusBadge ok={shopify ? shopify.connected : null} />
            </div>
          </div>
        </section>

        {/* Quote Tester */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-1">Live Quote Tester</h2>
          <p className="text-xs text-gray-500 mb-4">
            Test the full rate calculation pipeline. Dimensions are used for volumetric weight.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Postcode</label>
              <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={postcode} onChange={e => setPostcode(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Suburb</label>
              <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={suburb} onChange={e => setSuburb(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">State</label>
              <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={state} onChange={e => setState(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Weight (kg)</label>
              <input type="number" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={weightKg} onChange={e => setWeightKg(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Length (cm)</label>
              <input type="number" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={lengthCm} onChange={e => setLengthCm(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Width (cm)</label>
              <input type="number" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={widthCm} onChange={e => setWidthCm(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Height (cm)</label>
              <input type="number" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={heightCm} onChange={e => setHeightCm(e.target.value)} />
            </div>
            <div className="flex items-end">
              <button
                onClick={runQuoteTest}
                disabled={testing}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg px-4 py-2 disabled:opacity-50 transition-colors"
              >
                {testing ? "Getting rates…" : "Get Rates"}
              </button>
            </div>
          </div>
          {testResult && (
            <pre className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-xs text-gray-700 whitespace-pre-wrap font-mono">
              {testResult}
            </pre>
          )}
        </section>

        {/* How It Works */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">How It Works</h2>
          <div className="space-y-3">
            {[
              ["1", "Shopify sends checkout request", "When a customer reaches checkout, Shopify calls our /api/shipping/rates endpoint with cart items and delivery destination."],
              ["2", "Fetch variant dimensions", "We look up each product variant's custom metafields (custom.length, custom.width, custom.height in cm) via the Shopify Admin GraphQL API."],
              ["3", "Calculate volumetric weight", "Charged Weight = MAX(dead weight, L×W×H÷250). This is what carriers actually charge — not just the dead weight."],
              ["4", "Get real Shippit quotes", "We call Shippit's POST /api/3/quotes with the correct parcel data (weight + dimensions in metres)."],
              ["5", "Return accurate rates", "Shopify displays the real shipping cost at checkout — no more undercharging or misdeclaration fees."],
            ].map(([num, title, desc]) => (
              <div key={num} className="flex gap-3">
                <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{num}</div>
                <div>
                  <p className="text-sm font-medium text-gray-800">{title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Setup Section */}
        <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
          <h2 className="text-sm font-semibold text-gray-900">Shopify Setup</h2>

          {/* Step 1 — Connect */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center flex-shrink-0">1</span>
              <p className="text-sm font-medium text-gray-800">Connect Shopify Admin</p>
              {shopify?.connected && <span className="text-xs text-green-600 font-medium">✓ Done</span>}
            </div>
            <p className="text-xs text-gray-500 mb-3 ml-7">
              Before connecting, go to your Shopify Dev Dashboard app → Configuration → add the redirect URL below, then click Connect.
            </p>
            <div className="bg-gray-50 rounded-lg p-3 mb-3 font-mono text-xs text-gray-600 border border-gray-200 ml-7">
              Redirect URL to add in Shopify:<br />
              <span className="text-indigo-600 break-all">{window.location.origin.replace(/:[0-9]+$/, "")}/api/shopify/auth/callback</span>
            </div>
            {!shopify?.connected && (
              <div className="ml-7">
                <a
                  href={`${API_BASE}/shopify/auth`}
                  className="inline-block bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors no-underline"
                >
                  Connect to Shopify →
                </a>
              </div>
            )}
          </div>

          {/* Step 2 — Register carrier service */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center flex-shrink-0">2</span>
              <p className="text-sm font-medium text-gray-800">Register Carrier Service</p>
            </div>
            <p className="text-xs text-gray-500 mb-3 ml-7">
              Once connected, register this middleware as a carrier service so Shopify calls it at checkout.
            </p>
            <div className="bg-gray-50 rounded-lg p-3 mb-3 font-mono text-xs text-gray-600 border border-gray-200 ml-7">
              Carrier callback URL:<br />
              <span className="text-indigo-600 break-all">{window.location.origin.replace(/:[0-9]+$/, "")}/api/shipping/rates</span>
            </div>
            <div className="ml-7">
              <button
                onClick={registerCarrierService}
                disabled={registering || !shopify?.connected}
                className="bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium rounded-lg px-4 py-2 disabled:opacity-50 transition-colors"
              >
                {registering ? "Registering…" : "Register Carrier Service in Shopify"}
              </button>
              {!shopify?.connected && (
                <p className="text-xs text-gray-400 mt-1">Complete Step 1 first.</p>
              )}
            </div>
            {registerResult && (
              <pre className="mt-3 bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-700 whitespace-pre-wrap font-mono ml-7">
                {registerResult}
              </pre>
            )}
          </div>
        </section>

      </main>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={BASE}>
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route>
            <div className="min-h-screen flex items-center justify-center text-gray-500">404 — Not found</div>
          </Route>
        </Switch>
      </WouterRouter>
    </QueryClientProvider>
  );
}

export default App;
