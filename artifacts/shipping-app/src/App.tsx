import { useState, useEffect, useRef } from "react";

const API_BASE = "/api";
const CORRECT_PIN = "987654321";
const SESSION_KEY = "hf_auth";

function usePinAuth() {
  const [authed, setAuthed] = useState(() => sessionStorage.getItem(SESSION_KEY) === "1");
  const unlock = (pin: string) => {
    if (pin === CORRECT_PIN) {
      sessionStorage.setItem(SESSION_KEY, "1");
      setAuthed(true);
      return true;
    }
    return false;
  };
  const lock = () => {
    sessionStorage.removeItem(SESSION_KEY);
    setAuthed(false);
  };
  return { authed, unlock, lock };
}

function PinGate({ onUnlock }: { onUnlock: (pin: string) => boolean }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const ok = onUnlock(pin);
    if (!ok) {
      setError(true);
      setShake(true);
      setPin("");
      setTimeout(() => setShake(false), 600);
      setTimeout(() => setError(false), 2000);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f1117]" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div className="w-full max-w-sm px-6">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/5 border border-white/10 mb-6">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="8" fill="#2563EB"/>
              <path d="M8 10h10a6 6 0 0 1 0 12H8V10z" fill="white" opacity="0.9"/>
              <path d="M8 16h8" stroke="white" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-white mb-1">Hill Furnishings</h1>
          <p className="text-sm text-white/40">Shipping Rate Control Panel</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className={`mb-4 transition-transform duration-100 ${shake ? "animate-[shake_0.5s_ease-in-out]" : ""}`}>
            <label className="block text-xs font-medium text-white/40 uppercase tracking-widest mb-2 text-center">Enter PIN to continue</label>
            <input
              ref={inputRef}
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, ""))}
              placeholder="••••••••••"
              maxLength={12}
              className={`w-full text-center text-xl tracking-[0.5em] bg-white/5 border rounded-xl px-4 py-4 text-white placeholder-white/20 outline-none transition-all
                ${error ? "border-red-500/60 bg-red-500/5" : "border-white/10 focus:border-blue-500/60 focus:bg-white/8"}`}
            />
            {error && <p className="text-red-400 text-xs text-center mt-2">Incorrect PIN. Try again.</p>}
          </div>
          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-medium rounded-xl py-3.5 text-sm transition-colors"
          >
            Unlock Dashboard
          </button>
        </form>
      </div>

      <style>{`
        @keyframes shake {
          0%,100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-5px); }
          80% { transform: translateX(5px); }
        }
      `}</style>
    </div>
  );
}

interface Rate { service_name: string; total_price: string; description?: string; }

function StatusDot({ ok }: { ok: boolean | null }) {
  if (ok === null) return <span className="w-2 h-2 rounded-full bg-white/20 animate-pulse inline-block" />;
  return ok
    ? <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block shadow-[0_0_6px_rgba(52,211,153,0.6)]" />
    : <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />;
}

function Dashboard({ onLock }: { onLock: () => void }) {
  const [health, setHealth] = useState<boolean | null>(null);
  const [shippit, setShippit] = useState<{ ok: boolean; detail: string } | null>(null);
  const [shopify, setShopify] = useState<{ connected: boolean; tokenPrefix: string | null } | null>(null);

  const [postcode, setPostcode] = useState("2000");
  const [suburb, setSuburb] = useState("Sydney");
  const [stateName, setStateName] = useState("NSW");
  const [weightKg, setWeightKg] = useState("22");
  const [lengthCm, setLengthCm] = useState("147");
  const [widthCm, setWidthCm] = useState("95");
  const [heightCm, setHeightCm] = useState("57");
  const [testing, setTesting] = useState(false);
  const [rates, setRates] = useState<Rate[] | null>(null);
  const [calcDetail, setCalcDetail] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  const [registering, setRegistering] = useState(false);
  const [registerResult, setRegisterResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const origin = window.location.origin;

  useEffect(() => {
    fetch(`${API_BASE}/healthz`).then(r => setHealth(r.ok)).catch(() => setHealth(false));
    fetch(`${API_BASE}/shipping/test`).then(async r => {
      const j = await r.json();
      setShippit({ ok: j.success, detail: j.success ? `${j.quoteCount} carriers active` : j.error });
    }).catch(() => setShippit({ ok: false, detail: "Unreachable" }));
    fetch(`${API_BASE}/shopify/token-status`).then(async r => {
      setShopify(await r.json());
    }).catch(() => setShopify({ connected: false, tokenPrefix: null }));
  }, []);

  async function runTest() {
    setTesting(true); setRates(null); setCalcDetail(null); setTestError(null);
    try {
      const res = await fetch(`${API_BASE}/shipping/rates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rate: {
            origin: { country: "AU", postal_code: "4562", province: "QLD", city: "Doonan" },
            destination: { country: "AU", postal_code: postcode, province: stateName, city: suburb, name: "Test" },
            items: [{
              name: "Item", sku: "TEST-001", quantity: 1,
              grams: Math.round(parseFloat(weightKg) * 1000),
              price: 50000, vendor: "Hill Furnishings", requires_shipping: true,
              taxable: true, fulfillment_service: "manual", properties: null,
              product_id: 1, variant_id: 1,
            }],
            currency: "AUD", locale: "en",
          },
        }),
      });
      const j = await res.json();
      // Shippit cubic weight: L_cm × W_cm × H_cm / 4000 (= volume m³ × 250 kg/m³)
      const vol = (parseFloat(lengthCm) * parseFloat(widthCm) * parseFloat(heightCm)) / 4000;
      const dead = parseFloat(weightKg);
      const charged = Math.max(dead, vol);
      setCalcDetail(`Dead ${dead} kg  ·  Volumetric ${vol.toFixed(2)} kg  →  Charged ${charged.toFixed(2)} kg`);
      setRates(j.rates ?? []);
    } catch (e) {
      setTestError(String(e));
    } finally {
      setTesting(false);
    }
  }

  async function registerCarrier() {
    setRegistering(true); setRegisterResult(null);
    try {
      const res = await fetch(`${API_BASE}/shipping/register`, { method: "POST" });
      const j = await res.json();
      setRegisterResult(j.success
        ? { ok: true, msg: `Registered successfully.\nCallback: ${j.callbackUrl}` }
        : { ok: false, msg: JSON.stringify(j.details ?? j.error, null, 2) }
      );
    } catch (e) {
      setRegisterResult({ ok: false, msg: String(e) });
    } finally {
      setRegistering(false);
    }
  }

  const inputCls = "w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-blue-500/60 focus:bg-white/8 transition-all";
  const labelCls = "block text-xs font-medium text-white/40 mb-1.5";

  return (
    <div className="min-h-screen bg-[#0f1117] text-white" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* Header */}
      <header className="border-b border-white/8 bg-white/2 backdrop-blur sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 32 32" fill="none">
                <path d="M6 10h11a6 6 0 0 1 0 12H6V10z" fill="white" opacity="0.95"/>
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-white leading-none">Hill Furnishings</p>
              <p className="text-[11px] text-white/35 mt-0.5">Shipping Rate Control Panel</p>
            </div>
          </div>
          <button onClick={onLock} className="text-xs text-white/30 hover:text-white/60 transition-colors px-3 py-1.5 rounded-lg border border-white/8 hover:border-white/20">
            Lock
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">

        {/* Status Row */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "API Server", sub: "Live endpoint", ok: health },
            { label: "Shippit", sub: shippit?.detail ?? "Checking…", ok: shippit?.ok ?? null },
            { label: "Shopify Admin", sub: shopify?.connected ? shopify.tokenPrefix ?? "Connected" : "Not connected", ok: shopify?.connected ?? null },
          ].map(({ label, sub, ok }) => (
            <div key={label} className="bg-white/4 border border-white/8 rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-white">{label}</p>
                <p className="text-xs text-white/35 mt-0.5 truncate max-w-[140px]">{sub}</p>
              </div>
              <StatusDot ok={ok} />
            </div>
          ))}
        </div>

        {/* Two column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

          {/* Left — Quote Tester (wider) */}
          <div className="lg:col-span-3 bg-white/4 border border-white/8 rounded-2xl p-6">
            <h2 className="text-sm font-semibold text-white mb-1">Live Quote Tester</h2>
            <p className="text-xs text-white/35 mb-5">Simulates a real Shopify checkout request with volumetric weight.</p>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className={labelCls}>Destination Postcode</label>
                <input className={inputCls} value={postcode} onChange={e => setPostcode(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Suburb</label>
                <input className={inputCls} value={suburb} onChange={e => setSuburb(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>State</label>
                <input className={inputCls} value={stateName} onChange={e => setStateName(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Weight (kg)</label>
                <input type="number" className={inputCls} value={weightKg} onChange={e => setWeightKg(e.target.value)} />
              </div>
            </div>

            <div className="border-t border-white/6 pt-3 mb-3">
              <p className="text-[11px] text-white/30 uppercase tracking-widest mb-3">Parcel Dimensions (cm)</p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={labelCls}>Length</label>
                  <input type="number" className={inputCls} value={lengthCm} onChange={e => setLengthCm(e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>Width</label>
                  <input type="number" className={inputCls} value={widthCm} onChange={e => setWidthCm(e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>Height</label>
                  <input type="number" className={inputCls} value={heightCm} onChange={e => setHeightCm(e.target.value)} />
                </div>
              </div>
            </div>

            <button
              onClick={runTest}
              disabled={testing}
              className="w-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-40 text-white font-medium rounded-xl py-3 text-sm transition-colors"
            >
              {testing ? "Fetching rates…" : "Calculate Shipping Rates"}
            </button>

            {testError && (
              <div className="mt-4 bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-xs text-red-300">{testError}</div>
            )}

            {calcDetail && (
              <div className="mt-4 bg-white/3 border border-white/8 rounded-xl p-3">
                <p className="text-[11px] text-white/35 uppercase tracking-widest mb-2">Weight Calculation</p>
                <p className="text-xs text-white/70 font-mono">{calcDetail}</p>
              </div>
            )}

            {rates !== null && (
              <div className="mt-3 space-y-2">
                <p className="text-[11px] text-white/35 uppercase tracking-widest">{rates.length} rate{rates.length !== 1 ? "s" : ""} returned</p>
                {rates.length === 0 && <p className="text-xs text-white/30 italic">No rates returned for this destination.</p>}
                {rates.map((r, i) => (
                  <div key={i} className="flex items-center justify-between bg-white/4 border border-white/8 rounded-xl px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-white">{r.service_name}</p>
                      {r.description && <p className="text-xs text-white/35 mt-0.5">{r.description}</p>}
                    </div>
                    <p className="text-sm font-semibold text-emerald-400">${(parseInt(r.total_price) / 100).toFixed(2)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right column */}
          <div className="lg:col-span-2 space-y-4">

            {/* Shopify Setup */}
            <div className="bg-white/4 border border-white/8 rounded-2xl p-6 space-y-5">
              <h2 className="text-sm font-semibold text-white">Shopify Connection</h2>

              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${shopify?.connected ? "bg-emerald-500/20 text-emerald-400" : "bg-white/10 text-white/40"}`}>
                    {shopify?.connected ? "✓" : "1"}
                  </div>
                  <p className="text-xs font-medium text-white/70">Connect Admin API</p>
                </div>
                {!shopify?.connected ? (
                  <>
                    <div className="bg-white/3 border border-white/8 rounded-lg p-3 mb-3 font-mono text-[11px] text-white/40 break-all leading-relaxed">
                      Redirect URL:<br/>
                      <span className="text-blue-400">{origin}/api/shopify/auth/callback</span>
                    </div>
                    <a
                      href={`${API_BASE}/shopify/auth`}
                      className="flex items-center justify-center gap-2 w-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg py-2.5 transition-colors no-underline"
                    >
                      Connect to Shopify →
                    </a>
                  </>
                ) : (
                  <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
                    <span>✓</span> Admin API connected
                  </div>
                )}
              </div>

              <div className="border-t border-white/6 pt-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-5 h-5 rounded-full bg-white/10 text-white/40 flex items-center justify-center text-[10px] font-bold flex-shrink-0">2</div>
                  <p className="text-xs font-medium text-white/70">Register Carrier Service</p>
                </div>
                <div className="bg-white/3 border border-white/8 rounded-lg p-3 mb-3 font-mono text-[11px] text-white/40 break-all leading-relaxed">
                  Callback URL:<br/>
                  <span className="text-blue-400">{origin}/api/shipping/rates</span>
                </div>
                <button
                  onClick={registerCarrier}
                  disabled={registering || !shopify?.connected}
                  className="w-full bg-white/8 hover:bg-white/12 disabled:opacity-30 border border-white/10 text-white text-xs font-medium rounded-lg py-2.5 transition-colors"
                >
                  {registering ? "Registering…" : "Register Carrier Service"}
                </button>
                {!shopify?.connected && <p className="text-[11px] text-white/25 mt-1.5 text-center">Complete step 1 first</p>}
                {registerResult && (
                  <div className={`mt-3 rounded-lg p-3 text-[11px] font-mono whitespace-pre-wrap ${registerResult.ok ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-300" : "bg-red-500/10 border border-red-500/20 text-red-300"}`}>
                    {registerResult.msg}
                  </div>
                )}
              </div>
            </div>

            {/* How it works */}
            <div className="bg-white/4 border border-white/8 rounded-2xl p-6">
              <h2 className="text-sm font-semibold text-white mb-4">How It Works</h2>
              <div className="space-y-4">
                {[
                  ["Checkout trigger", "Shopify calls the callback URL with cart items and destination."],
                  ["Fetch dimensions", "Metafields (custom.length/width/height) fetched per variant via GraphQL."],
                  ["Volumetric weight", "MAX(dead weight, L×W×H÷250) determines the carrier charge."],
                  ["Live Shippit quote", "Real-time rates returned and shown at checkout."],
                ].map(([title, desc], i) => (
                  <div key={i} className="flex gap-3">
                    <span className="w-5 h-5 rounded-full bg-blue-600/20 text-blue-400 text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                    <div>
                      <p className="text-xs font-medium text-white/80">{title}</p>
                      <p className="text-[11px] text-white/35 mt-0.5 leading-relaxed">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  const { authed, unlock, lock } = usePinAuth();
  if (!authed) return <PinGate onUnlock={unlock} />;
  return <Dashboard onLock={lock} />;
}
