import { useState, useEffect, useRef, useCallback } from "react";

const API = "/api";
const PIN = "987654321";
const SESSION_KEY = "hf_auth";

function usePinAuth() {
  const [authed, setAuthed] = useState(() => sessionStorage.getItem(SESSION_KEY) === "1");
  const unlock = (p: string) => { if (p === PIN) { sessionStorage.setItem(SESSION_KEY, "1"); setAuthed(true); return true; } return false; };
  const lock = () => { sessionStorage.removeItem(SESSION_KEY); setAuthed(false); };
  return { authed, unlock, lock };
}

/* ── PIN Gate ─────────────────────────────────────────────── */
function PinGate({ onUnlock }: { onUnlock: (p: string) => boolean }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onUnlock(pin)) {
      setError(true); setShake(true); setPin("");
      setTimeout(() => setShake(false), 500);
      setTimeout(() => setError(false), 2500);
    }
  };

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif" }} className="min-h-screen bg-[#0a0b0f] flex items-center justify-center px-4">
      <div className="w-full max-w-[340px]">
        <div className="flex flex-col items-center mb-10">
          <div className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center mb-5 shadow-[0_0_40px_rgba(37,99,235,0.3)]">
            <svg width="28" height="20" viewBox="0 0 28 20" fill="none">
              <path d="M0 2C0 .9.9 0 2 0h14a8 8 0 0 1 0 16H2a2 2 0 0 1-2-2V2z" fill="white"/>
              <circle cx="22" cy="8" r="6" fill="white" fillOpacity=".15" stroke="white" strokeWidth="1.5"/>
            </svg>
          </div>
          <h1 className="text-[22px] font-semibold text-white tracking-tight">Hill Furnishings</h1>
          <p className="text-sm text-white/35 mt-1">Shipping Rate Control Panel</p>
        </div>

        <form onSubmit={submit}>
          <p className="text-[11px] font-medium text-white/30 uppercase tracking-[.15em] text-center mb-3">Enter PIN</p>
          <div className={shake ? "animate-[shake_.45s_ease-in-out]" : ""}>
            <input
              ref={ref}
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, ""))}
              placeholder="••••••••••"
              maxLength={12}
              className={`w-full text-center text-2xl tracking-[.6em] rounded-2xl px-4 py-4 text-white placeholder-white/15 outline-none border transition-all duration-200 bg-white/4
                ${error ? "border-red-500/50 bg-red-500/6" : "border-white/8 focus:border-blue-500/50 focus:bg-white/6"}`}
            />
            <div className={`overflow-hidden transition-all duration-300 ${error ? "max-h-10 mt-2" : "max-h-0"}`}>
              <p className="text-red-400/90 text-xs text-center">Incorrect PIN — try again</p>
            </div>
          </div>
          <button type="submit" className="mt-4 w-full bg-blue-600 hover:bg-blue-500 active:scale-[.98] text-white font-medium rounded-xl py-3.5 text-sm transition-all duration-150">
            Unlock
          </button>
        </form>
      </div>
      <style>{`@keyframes shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-7px)}40%{transform:translateX(7px)}60%{transform:translateX(-4px)}80%{transform:translateX(4px)}}`}</style>
    </div>
  );
}

/* ── Types ────────────────────────────────────────────────── */
interface Rate { service_name: string; total_price: string; description?: string; carrier?: string; }
interface CarrierService { id: number; name: string; active: boolean; callback_url?: string; }
interface CarrierStatus { found: boolean; service: CarrierService | null; error?: string; }

/* ── Micro components ─────────────────────────────────────── */
function Dot({ state }: { state: "ok" | "warn" | "loading" }) {
  if (state === "loading") return <span className="w-2 h-2 rounded-full bg-white/20 animate-pulse inline-block" />;
  if (state === "ok") return <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block shadow-[0_0_8px_rgba(52,211,153,.5)]" />;
  return <span className="w-2 h-2 rounded-full bg-amber-400 inline-block shadow-[0_0_6px_rgba(251,191,36,.4)]" />;
}

function Banner({ type, message, onDismiss }: { type: "error" | "success" | "info"; message: string; onDismiss?: () => void }) {
  const styles = {
    error:   "bg-red-500/8 border-red-500/25 text-red-300",
    success: "bg-emerald-500/8 border-emerald-500/25 text-emerald-300",
    info:    "bg-blue-500/8 border-blue-500/25 text-blue-300",
  };
  const icons = { error: "✕", success: "✓", info: "i" };
  return (
    <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${styles[type]}`}>
      <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5 bg-current/10">{icons[type]}</span>
      <p className="flex-1 leading-relaxed opacity-90 font-mono text-xs whitespace-pre-wrap">{message}</p>
      {onDismiss && <button onClick={onDismiss} className="text-current/50 hover:text-current/80 flex-shrink-0 text-xs mt-0.5">✕</button>}
    </div>
  );
}

/* ── Toggle Switch ────────────────────────────────────────── */
function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative w-12 h-6 rounded-full transition-all duration-300 outline-none flex-shrink-0
        ${checked ? "bg-emerald-500 shadow-[0_0_16px_rgba(52,211,153,.35)]" : "bg-white/12"}
        ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer hover:opacity-90"}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-300 ${checked ? "translate-x-6" : "translate-x-0"}`} />
    </button>
  );
}

/* ── Dashboard ────────────────────────────────────────────── */
function Dashboard({ onLock }: { onLock: () => void }) {
  const [health, setHealth] = useState<boolean | null>(null);
  const [shippit, setShippit] = useState<{ ok: boolean; detail: string } | null>(null);
  const [shopify, setShopify] = useState<{ connected: boolean; tokenPrefix: string | null; error?: string; shopName?: string } | null>(null);
  const [carrier, setCarrier] = useState<CarrierStatus | null>(null);
  const [togglingCarrier, setTogglingCarrier] = useState(false);
  const [carrierToggleMsg, setCarrierToggleMsg] = useState<{ type: "error" | "success"; text: string } | null>(null);

  const [postcode, setPostcode] = useState("2000");
  const [suburb, setSuburb] = useState("Sydney");
  const [stateName, setStateName] = useState("NSW");
  const [weightKg, setWeightKg] = useState("12");
  const [lengthCm, setLengthCm] = useState("127");
  const [widthCm, setWidthCm] = useState("102");
  const [heightCm, setHeightCm] = useState("8");
  const [testing, setTesting] = useState(false);
  const [rates, setRates] = useState<Rate[] | null>(null);
  const [calcDetail, setCalcDetail] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  const [registering, setRegistering] = useState(false);
  const [registerMsg, setRegisterMsg] = useState<{ type: "error" | "success"; text: string } | null>(null);

  const [tokenInput, setTokenInput] = useState("");
  const [savingToken, setSavingToken] = useState(false);
  const [tokenMsg, setTokenMsg] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [redirectUri, setRedirectUri] = useState<string | null>(null);
  const [copiedUri, setCopiedUri] = useState(false);

  async function saveDirectToken() {
    if (!tokenInput.trim()) return;
    setSavingToken(true); setTokenMsg(null);
    try {
      const r = await fetch(`${API}/shopify/save-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: tokenInput.trim() }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Save failed");
      setTokenMsg({ type: "success", text: `Token saved (${j.tokenPrefix})` });
      setTokenInput("");
      const status = await fetch(`${API}/shopify/token-status`).then(x => x.json());
      setShopify(status);
    } catch (e) {
      setTokenMsg({ type: "error", text: String(e) });
    } finally { setSavingToken(false); }
  }

  const origin = window.location.origin;

  const loadCarrierStatus = useCallback(async () => {
    try {
      const r = await fetch(`${API}/shipping/carrier-status`);
      setCarrier(await r.json());
    } catch { setCarrier({ found: false, service: null, error: "Could not reach API" }); }
  }, []);

  useEffect(() => {
    fetch(`${API}/healthz`).then(r => setHealth(r.ok)).catch(() => setHealth(false));
    fetch(`${API}/shipping/test`).then(async r => {
      const j = await r.json();
      setShippit({ ok: j.success, detail: j.success ? `${j.quoteCount} carriers active` : j.error });
    }).catch(() => setShippit({ ok: false, detail: "Unreachable" }));
    fetch(`${API}/shopify/token-status`).then(async r => setShopify(await r.json())).catch(() => setShopify({ connected: false, tokenPrefix: null }));
    fetch(`${API}/shopify/redirect-uri`).then(async r => { const j = await r.json(); setRedirectUri(j.redirectUri); }).catch(() => {});
    loadCarrierStatus();
  }, [loadCarrierStatus]);

  async function toggleCarrier(active: boolean) {
    setTogglingCarrier(true); setCarrierToggleMsg(null);
    try {
      const r = await fetch(`${API}/shipping/carrier-set-active`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      });
      const j = await r.json();
      if (j.success) {
        setCarrierToggleMsg({ type: "success", text: active ? "Carrier service enabled — live rates active at checkout." : "Carrier service disabled — checkout will not show live rates." });
        await loadCarrierStatus();
      } else {
        setCarrierToggleMsg({ type: "error", text: j.error ?? "Toggle failed" });
      }
    } catch (e) { setCarrierToggleMsg({ type: "error", text: String(e) }); }
    finally { setTogglingCarrier(false); }
  }

  async function runTest() {
    setTesting(true); setRates(null); setCalcDetail(null); setTestError(null);
    try {
      const res = await fetch(`${API}/shipping/quote-test`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weightKg: parseFloat(weightKg),
          lengthCm: parseFloat(lengthCm),
          widthCm: parseFloat(widthCm),
          heightCm: parseFloat(heightCm),
          destPostcode: postcode,
          destSuburb: suburb,
          destState: stateName,
        }),
      });
      const j = await res.json();
      if (j.error) { setTestError(j.error); return; }
      const { calc } = j;
      setCalcDetail(
        `Dead weight: ${calc.deadKg} kg\nVolumetric: ${calc.volumetricKg} kg  (${lengthCm}×${widthCm}×${heightCm} cm ÷ 4,000)\nCharged: ${calc.chargedKg} kg  ← ${calc.method}`
      );
      setRates(j.rates ?? []);
      if (!j.rates?.length) setTestError("Shippit returned no rates for this destination. The postcode may not be serviceable or the parcel may exceed carrier limits.");
    } catch (e) { setTestError(String(e)); }
    finally { setTesting(false); }
  }

  async function registerCarrier() {
    setRegistering(true); setRegisterMsg(null);
    try {
      const r = await fetch(`${API}/shipping/register`, { method: "POST" });
      const j = await r.json();
      if (j.success) {
        setRegisterMsg({ type: "success", text: `Registered.\nCallback URL: ${j.callbackUrl}` });
        loadCarrierStatus();
      } else {
        setRegisterMsg({ type: "error", text: JSON.stringify(j.details ?? j.error, null, 2) });
      }
    } catch (e) { setRegisterMsg({ type: "error", text: String(e) }); }
    finally { setRegistering(false); }
  }

  const inp = "w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-blue-500/50 transition-colors";
  const lbl = "block text-[11px] font-medium text-white/35 uppercase tracking-wide mb-1.5";

  const carrierActive = carrier?.service?.active ?? false;
  const carrierFound = carrier?.found ?? false;

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif" }} className="min-h-screen bg-[#0a0b0f] text-white">

      {/* ── Header ── */}
      <header className="border-b border-white/6 bg-white/[.015] sticky top-0 z-20 backdrop-blur-sm">
        <div className="max-w-[1100px] mx-auto px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
              <svg width="14" height="10" viewBox="0 0 28 20" fill="none">
                <path d="M0 2C0 .9.9 0 2 0h14a8 8 0 0 1 0 16H2a2 2 0 0 1-2-2V2z" fill="white"/>
              </svg>
            </div>
            <span className="text-sm font-semibold text-white tracking-tight">Hill Furnishings</span>
            <span className="hidden sm:block text-white/15">·</span>
            <span className="hidden sm:block text-xs text-white/30">Shipping Rate Control</span>
          </div>

          {/* Live rates toggle — centre of header */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2.5 bg-white/4 border border-white/8 rounded-xl px-4 py-2">
              <div className="flex flex-col items-end">
                <span className="text-[11px] font-semibold text-white/70 leading-none">
                  {carrier === null ? "Checking…" : carrierFound ? (carrierActive ? "Live Rates ON" : "Live Rates OFF") : "Not Registered"}
                </span>
                <span className="text-[10px] text-white/25 mt-0.5 leading-none">
                  {carrier === null ? "loading" : carrierFound ? (carrierActive ? "showing at checkout" : "hidden at checkout") : "register below"}
                </span>
              </div>
              <Toggle
                checked={carrierActive}
                disabled={!carrierFound || togglingCarrier || carrier === null}
                onChange={toggleCarrier}
              />
            </div>
          </div>

          <button onClick={onLock} className="text-[11px] text-white/25 hover:text-white/50 transition-colors px-3 py-1.5 rounded-lg border border-white/6 hover:border-white/15 flex-shrink-0">
            Lock
          </button>
        </div>
      </header>

      <main className="max-w-[1100px] mx-auto px-6 py-7 space-y-5">

        {/* Toggle feedback */}
        {carrierToggleMsg && (
          <Banner type={carrierToggleMsg.type} message={carrierToggleMsg.text} onDismiss={() => setCarrierToggleMsg(null)} />
        )}

        {/* ── Status Row ── */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "API Server", sub: "Express / Node.js", state: health === null ? "loading" : health ? "ok" : "warn" },
            { label: "Shippit API", sub: shippit?.detail ?? "Connecting…", state: shippit === null ? "loading" : shippit.ok ? "ok" : "warn" },
            { label: "Shopify Admin", sub: shopify === null ? "Checking…" : shopify.connected ? (shopify.shopName ?? shopify.tokenPrefix ?? "Connected") : (shopify.error ? "Token invalid — see below" : "Not connected"), state: shopify === null ? "loading" : shopify.connected ? "ok" : "warn" },
          ].map(({ label, sub, state }) => (
            <div key={label} className="bg-white/[.025] border border-white/7 rounded-xl px-4 py-3.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-white leading-none">{label}</p>
                <p className="text-[11px] text-white/30 mt-1 truncate">{sub}</p>
              </div>
              <Dot state={state as "ok" | "warn" | "loading"} />
            </div>
          ))}
        </div>

        {/* ── Two-column layout ── */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-5">

          {/* LEFT — Quote Tester */}
          <div className="bg-white/[.025] border border-white/7 rounded-2xl p-6 space-y-5">
            <div>
              <h2 className="text-sm font-semibold text-white">Live Quote Tester</h2>
              <p className="text-[11px] text-white/30 mt-1">Simulates a Shopify checkout request. Dimensions drive volumetric weight.</p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div><label className={lbl}>Postcode</label><input className={inp} value={postcode} onChange={e => setPostcode(e.target.value)} /></div>
              <div><label className={lbl}>Suburb</label><input className={inp} value={suburb} onChange={e => setSuburb(e.target.value)} /></div>
              <div><label className={lbl}>State</label><input className={inp} value={stateName} onChange={e => setStateName(e.target.value)} /></div>
              <div><label className={lbl}>Weight (kg)</label><input type="number" className={inp} value={weightKg} onChange={e => setWeightKg(e.target.value)} /></div>
            </div>

            <div>
              <p className="text-[10px] font-medium text-white/20 uppercase tracking-[.15em] mb-3">Parcel dimensions (cm)</p>
              <div className="grid grid-cols-3 gap-3">
                <div><label className={lbl}>Length</label><input type="number" className={inp} value={lengthCm} onChange={e => setLengthCm(e.target.value)} /></div>
                <div><label className={lbl}>Width</label><input type="number" className={inp} value={widthCm} onChange={e => setWidthCm(e.target.value)} /></div>
                <div><label className={lbl}>Height</label><input type="number" className={inp} value={heightCm} onChange={e => setHeightCm(e.target.value)} /></div>
              </div>
            </div>

            <button
              onClick={runTest} disabled={testing}
              className="w-full bg-blue-600 hover:bg-blue-500 active:scale-[.99] disabled:opacity-40 text-white font-medium rounded-xl py-3 text-sm transition-all duration-150"
            >
              {testing ? "Fetching rates…" : "Calculate Shipping Rates"}
            </button>

            {/* Errors */}
            {testError && <Banner type="error" message={testError} onDismiss={() => setTestError(null)} />}

            {/* Weight breakdown */}
            {calcDetail && (
              <div className="bg-white/3 border border-white/6 rounded-xl px-4 py-3">
                <p className="text-[10px] font-medium text-white/25 uppercase tracking-[.15em] mb-1.5">Weight Calculation</p>
                <p className="text-xs text-white/60 font-mono">{calcDetail}</p>
              </div>
            )}

            {/* Rates */}
            {rates !== null && rates.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-medium text-white/25 uppercase tracking-[.15em]">{rates.length} rate{rates.length !== 1 ? "s" : ""} returned</p>
                {rates.map((r, i) => (
                  <div key={i} className="flex items-center justify-between bg-white/3 border border-white/7 rounded-xl px-4 py-3 hover:bg-white/5 transition-colors">
                    <div>
                      <p className="text-sm font-medium text-white">{r.service_name}</p>
                      {r.description && <p className="text-[11px] text-white/30 mt-0.5">{r.description}</p>}
                    </div>
                    <p className="text-sm font-semibold text-emerald-400 ml-4 flex-shrink-0">${(parseInt(r.total_price) / 100).toFixed(2)}</p>
                  </div>
                ))}
              </div>
            )}

            {rates !== null && rates.length === 0 && !testError && (
              <Banner type="info" message="No rates returned for this destination. Shippit may not service this area, or the parcel may exceed carrier limits." />
            )}
          </div>

          {/* RIGHT column */}
          <div className="space-y-4">

            {/* Carrier Control Card */}
            <div className="bg-white/[.025] border border-white/7 rounded-2xl p-5">
              <h2 className="text-sm font-semibold text-white mb-4">Carrier Service</h2>

              <div className={`rounded-xl border px-4 py-4 mb-4 ${
                carrier === null ? "border-white/8 bg-white/2" :
                !carrierFound ? "border-amber-500/20 bg-amber-500/5" :
                carrierActive ? "border-emerald-500/20 bg-emerald-500/5" : "border-white/8 bg-white/2"
              }`}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-medium text-white">
                    {carrier === null ? "Loading…" : !carrierFound ? "Not Registered" : "Shippit Live Rates"}
                  </p>
                  <Dot state={carrier === null ? "loading" : carrierActive ? "ok" : "warn"} />
                </div>
                <p className="text-[11px] text-white/35">
                  {carrier === null ? "Fetching status from Shopify…"
                    : !carrierFound ? "Register the carrier service below first."
                    : carrierActive ? "Checkout is calling this middleware for live rates."
                    : "Carrier is inactive — checkout uses default shipping."}
                </p>
                {carrier?.error && <p className="text-[11px] text-red-400/80 mt-2 font-mono">{carrier.error}</p>}
              </div>

              {carrierFound && (
                <div className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm text-white/70">{carrierActive ? "Disable" : "Enable"} live rates</p>
                    <p className="text-[11px] text-white/25 mt-0.5">{carrierActive ? "Pause Shippit at checkout" : "Activate Shippit at checkout"}</p>
                  </div>
                  <Toggle checked={carrierActive} disabled={togglingCarrier} onChange={toggleCarrier} />
                </div>
              )}

              {!carrierFound && carrier !== null && (
                <div className="space-y-3">
                  <div className="bg-white/3 border border-white/6 rounded-lg p-3 font-mono text-[11px] text-blue-400/80 break-all">
                    {origin}/api/shipping/rates
                  </div>
                  <button
                    onClick={registerCarrier} disabled={registering || !shopify?.connected}
                    className="w-full bg-white/6 hover:bg-white/10 disabled:opacity-30 border border-white/8 text-white/80 text-xs font-medium rounded-lg py-2.5 transition-colors"
                  >
                    {registering ? "Registering…" : "Register Carrier Service"}
                  </button>
                  {!shopify?.connected && <p className="text-[11px] text-white/20 text-center">Connect Shopify Admin first</p>}
                </div>
              )}

              {registerMsg && <div className="mt-3"><Banner type={registerMsg.type} message={registerMsg.text} onDismiss={() => setRegisterMsg(null)} /></div>}
            </div>

            {/* Shopify Connection */}
            <div className="bg-white/[.025] border border-white/7 rounded-2xl p-5 space-y-4">
              <h2 className="text-sm font-semibold text-white">Shopify Admin</h2>

              {shopify?.connected && (
                <Banner type="success" message={`Connected to ${shopify.shopName ?? "Shopify"} — ${shopify.tokenPrefix}`} />
              )}

              {!shopify?.connected && shopify?.error && (
                <Banner type="error" message={shopify.error} />
              )}

              {tokenMsg && <Banner type={tokenMsg.type} message={tokenMsg.text} onDismiss={() => setTokenMsg(null)} />}

              {!shopify?.connected && (
                <div className="space-y-4">
                  {/* Step 1 */}
                  <div className="space-y-2">
                    <p className="text-[11px] font-semibold text-white/70">Step 1 — Register the callback URL</p>
                    <p className="text-[11px] text-white/35 leading-relaxed">
                      In your <strong className="text-white/50">Shopify Partner Dashboard</strong> → Apps → your app → <strong className="text-white/50">App setup</strong> → scroll to <strong className="text-white/50">Allowed redirection URL(s)</strong> and add:
                    </p>
                    <div
                      className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2 cursor-pointer hover:bg-white/8 transition-colors"
                      onClick={() => { if (redirectUri) { navigator.clipboard.writeText(redirectUri); setCopiedUri(true); setTimeout(() => setCopiedUri(false), 2000); } }}
                      title="Click to copy"
                    >
                      <span className="font-mono text-[10px] text-blue-400/80 break-all flex-1">
                        {redirectUri ?? "Loading…"}
                      </span>
                      <span className="text-[10px] text-white/30 flex-shrink-0">{copiedUri ? "✓ Copied" : "Copy"}</span>
                    </div>
                  </div>

                  {/* Step 2 */}
                  <div className="space-y-2">
                    <p className="text-[11px] font-semibold text-white/70">Step 2 — Install the app on your store</p>
                    <p className="text-[11px] text-white/35 leading-relaxed">
                      Once the URL is registered, click below. You'll be taken to Shopify to approve access, then automatically redirected back with your token saved.
                    </p>
                    <a
                      href={`${API}/shopify/auth`}
                      className="flex items-center justify-center gap-2 w-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg py-3 transition-colors no-underline"
                    >
                      Connect to Shopify →
                    </a>
                  </div>

                  {/* Or paste manually */}
                  <div className="border-t border-white/5 pt-3 space-y-2">
                    <p className="text-[10px] text-white/25">Or paste a token directly if you already have one:</p>
                    <input
                      type="password"
                      value={tokenInput}
                      onChange={e => setTokenInput(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && saveDirectToken()}
                      placeholder="shpat_…"
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white/80 placeholder-white/20 font-mono focus:outline-none focus:border-blue-500/50"
                    />
                    <button
                      onClick={saveDirectToken}
                      disabled={savingToken || !tokenInput.trim()}
                      className="w-full bg-white/8 hover:bg-white/12 disabled:opacity-40 text-white/70 text-xs font-medium rounded-lg py-2.5 transition-colors border border-white/8"
                    >
                      {savingToken ? "Saving…" : "Save Token"}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* How it works */}
            <div className="bg-white/[.025] border border-white/7 rounded-2xl p-5">
              <h2 className="text-sm font-semibold text-white mb-4">How It Works</h2>
              <div className="space-y-3.5">
                {[
                  ["Checkout trigger", "Shopify calls /api/shipping/rates with cart items and destination."],
                  ["Fetch dimensions", "custom.length, width, height (cm) fetched per variant via GraphQL."],
                  ["Volumetric weight", "MAX(dead wt, L×W×H÷4000) — carrier charges by whichever is greater."],
                  ["Live quote", "Shippit returns real-time rates per carrier, shown at checkout."],
                ].map(([t, d], i) => (
                  <div key={i} className="flex gap-3">
                    <span className="w-5 h-5 rounded-full bg-blue-600/20 text-blue-400 text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                    <div>
                      <p className="text-xs font-medium text-white/75">{t}</p>
                      <p className="text-[11px] text-white/30 mt-0.5 leading-relaxed">{d}</p>
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

/* ── App root ─────────────────────────────────────────────── */
export default function App() {
  const { authed, unlock, lock } = usePinAuth();
  return authed ? <Dashboard onLock={lock} /> : <PinGate onUnlock={unlock} />;
}
