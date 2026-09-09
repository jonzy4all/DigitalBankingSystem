const API_BASE = "";
const TOKEN_KEY = "oma_bank_session_token";
const USER_KEY = "oma_bank_session_user";
const ONBOARDING_KEY = "oma_bank_onboarding";

const app = document.getElementById("app");
const toastRoot = document.getElementById("toast-root");

const icons = {
  home: `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M3 10.8 12 3l9 7.8v9.7a.5.5 0 0 1-.5.5h-17a.5.5 0 0 1-.5-.5z"/><path d="M9 21v-7h6v7"/></svg>`,
  send: `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>`,
  list: `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/></svg>`,
  file: `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h6"/></svg>`,
  shield: `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M20 13c0 5-3.5 7.5-8 9-4.5-1.5-8-4-8-9V5l8-3 8 3z"/><path d="m9 12 2 2 4-4"/></svg>`,
  user: `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><circle cx="12" cy="8" r="4"/><path d="M4 22c.7-4.2 3.4-6 8-6s7.3 1.8 8 6"/></svg>`,
  logout: `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M10 17l5-5-5-5M15 12H3"/><path d="M13 3h7a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-7"/></svg>`,
  eye: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/></svg>`,
  copy: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
  download: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>`,
  refresh: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M20 7h-6V1"/><path d="M20 7a9 9 0 1 0 1 7"/></svg>`,
  menu: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg>`,
  check: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m5 12 4 4L19 6"/></svg>`,
  arrowRight: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`,
  receipt: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M6 2h12v20l-3-2-3 2-3-2-3 2Z"/><path d="M9 7h6M9 11h6M9 15h4"/></svg>`,
};

const state = {
  token: sessionStorage.getItem(TOKEN_KEY),
  user: safeJson(sessionStorage.getItem(USER_KEY)),
  profile: null,
  balance: null,
  transactions: [],
  sidebarOpen: false,
};

function safeJson(value) {
  try { return value ? JSON.parse(value) : null; } catch { return null; }
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function money(value, currency = "NGN") {
  const amount = Number(value || 0);
  try {
    return new Intl.NumberFormat("en-NG", { style: "currency", currency, minimumFractionDigits: 2 }).format(amount);
  } catch {
    return `₦${amount.toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
  }
}

function dateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

function initials(first = "O", last = "M") {
  return `${String(first)[0] || "O"}${String(last)[0] || "M"}`.toUpperCase();
}

function getHashParts() {
  // Password reset emails use a real URL such as:
  // /app/reset-password?token=...
  // Handle that path before the normal hash-based SPA routes.
  const path = location.pathname.replace(/\/+$/, "");
  if (path.endsWith("/app/reset-password")) {
    return {
      route: "reset-password",
      params: new URLSearchParams(location.search),
    };
  }

  // Backward compatibility with links already sent in the old format:
  // /app/#/reset-password?token=...
  const raw = location.hash.replace(/^#\/?/, "") || (state.token ? "dashboard" : "login");
  const [pathPart, queryPart = ""] = raw.split("?");
  return { route: pathPart || "login", params: new URLSearchParams(queryPart) };
}

function navigate(route) {
  // If the user entered through the direct email reset URL, leave that
  // pathname before navigating to the normal hash-based application.
  if (location.pathname.replace(/\/+$/, "").endsWith("/app/reset-password")) {
    const appPath = location.pathname.replace(/reset-password\/?$/, "");
    history.replaceState(null, "", `${appPath}#/${route}`);
    routeApp();
    return;
  }

  location.hash = `#/${route}`;
}

function toast(message, type = "success") {
  const node = document.createElement("div");
  node.className = `toast ${type}`;
  node.innerHTML = `<span>${type === "success" ? "✓" : "!"}</span><div>${escapeHtml(message)}</div>`;
  toastRoot.append(node);
  setTimeout(() => node.remove(), 4500);
}

function setButtonLoading(button, loading, label = "Please wait") {
  if (!button) return;
  if (loading) {
    button.dataset.original = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `<span class="loader"></span>${escapeHtml(label)}`;
  } else {
    button.disabled = false;
    button.innerHTML = button.dataset.original || button.innerHTML;
  }
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (!(options.body instanceof FormData) && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (state.token && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${state.token}`);

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch (error) {
    throw new Error("Cannot reach OMA Bank API. Make sure the backend is running on port 8001.");
  }

  const type = response.headers.get("content-type") || "";
  const data = type.includes("application/json") ? await response.json() : await response.text();

  if (!response.ok) {
    const authFailureMessages = new Set([
      "Authorization token is required",
      "Invalid authorization format",
      "Customer account not found",
      "Password was recently changed. Please log in again.",
      "Linked bank account was not found",
      "Invalid or expired authentication token",
    ]);
    const responseMessage = data?.message || "";
    const isSessionFailure =
      state.token &&
      ((response.status === 401 && authFailureMessages.has(responseMessage)) ||
        (response.status === 403 && [
          "Customer account is not active",
          "Bank account is blocked or inactive",
        ].includes(responseMessage)));

    if (isSessionFailure) {
      clearSession(false);
      toast(responseMessage || "Your session has expired.", "error");
      navigate("login");
    }
    const message = responseMessage || data?.error?.message || (typeof data === "string" ? data : "Request failed");
    const error = new Error(message);
    error.status = response.status;
    error.payload = data;
    throw error;
  }
  return data;
}

async function downloadProtected(path, filename) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: state.token ? { Authorization: `Bearer ${state.token}` } : {},
  });
  if (!response.ok) {
    let message = "Download failed";
    try { const json = await response.json(); message = json.message || message; } catch {}
    throw new Error(message);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function saveSession(data) {
  state.token = data.token;
  state.user = data;
  sessionStorage.setItem(TOKEN_KEY, data.token);
  sessionStorage.setItem(USER_KEY, JSON.stringify(data));
}

function clearSession(showToast = true) {
  state.token = null;
  state.user = null;
  state.profile = null;
  state.balance = null;
  state.transactions = [];
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
  if (showToast) toast("You have been signed out.");
}

function authLayout(content, mode = "default") {
  const isOnboarding = mode === "onboarding";
  return `
    <main class="auth-shell">
      <section class="auth-visual">
        <a class="brand" href="#/login"><span class="brand-mark">O</span><span>OMA Bank</span></a>
        <div class="auth-copy">
          <h1>${isOnboarding ? "Your bank account, built around you." : "Banking that moves at your pace."}</h1>
          <p>${isOnboarding ? "Complete secure identity verification, create your account and start banking in a few steps." : "Check your live balance, transfer funds securely and keep track of every transaction from one clean dashboard."}</p>
        </div>
        <div class="auth-trust"><span><i></i>Secure sign in</span><span><i></i>NIBSS-powered banking</span><span><i></i>Protected transfers</span></div>
      </section>
      <section class="auth-panel">${content}</section>
    </main>`;
}

function appShell(content, active = "dashboard", title = "Dashboard") {
  const first = state.profile?.firstName || state.user?.firstName || "Customer";
  const last = state.profile?.lastName || state.user?.lastName || "";
  const email = state.profile?.email || state.user?.email || "";
  const navItems = [
    ["dashboard", "Dashboard", icons.home],
    ["transfer", "Send money", icons.send],
    ["transactions", "Transactions", icons.list],
    ["statement", "Statements", icons.file],
    ["security", "Security", icons.shield],
    ["settings", "Profile & settings", icons.user],
  ];
  return `
    <div class="app-shell">
      <aside class="sidebar ${state.sidebarOpen ? "open" : ""}" id="sidebar">
        <a class="brand" href="#/dashboard"><span class="brand-mark">O</span><span>OMA Bank</span></a>
        <nav class="nav">
          ${navItems.map(([route,label,icon]) => `<a href="#/${route}" class="${active === route ? "active" : ""}">${icon}<span>${label}</span></a>`).join("")}
        </nav>
        <div class="sidebar-bottom">
          <div class="user-mini">
            <div class="avatar">${initials(first,last)}</div>
            <div><strong>${escapeHtml(`${first} ${last}`.trim())}</strong><span>${escapeHtml(email)}</span></div>
          </div>
          <a class="nav-logout" href="#" id="logout-link" style="display:flex;align-items:center;gap:10px;color:rgba(255,255,255,.55);font-size:13px;padding:11px 9px;margin-top:7px">${icons.logout} Sign out</a>
        </div>
      </aside>
      <section class="main">
        <header class="topbar">
          <div class="row">
            <button class="menu-btn" id="menu-btn" aria-label="Open menu">${icons.menu}</button>
            <div class="mobile-brand"><span class="brand-mark">O</span> OMA</div>
            <strong class="topbar-title">${escapeHtml(title)}</strong>
          </div>
          <div class="row">
            <span class="muted small">${new Intl.DateTimeFormat("en-NG", { weekday: "short", day: "numeric", month: "short" }).format(new Date())}</span>
            <div class="avatar">${initials(first,last)}</div>
          </div>
        </header>
        <div class="page">${content}</div>
      </section>
    </div>`;
}

async function ensureProfile() {
  if (!state.token) return false;
  if (state.profile) return true;
  try {
    const response = await api("/auth/me");
    state.profile = response.data;
    return true;
  } catch { return false; }
}

function bindShell() {
  document.getElementById("logout-link")?.addEventListener("click", (e) => {
    e.preventDefault(); clearSession(); navigate("login");
  });
  document.getElementById("menu-btn")?.addEventListener("click", () => {
    state.sidebarOpen = !state.sidebarOpen;
    document.getElementById("sidebar")?.classList.toggle("open", state.sidebarOpen);
  });
  document.querySelectorAll(".sidebar .nav a").forEach(a => a.addEventListener("click", () => { state.sidebarOpen = false; }));
}

function loginPage() {
  if (state.token) return navigate("dashboard");
  app.innerHTML = authLayout(`
    <div class="auth-card">
      <h2>Welcome back</h2>
      <p>Sign in to your OMA Bank account.</p>
      <form id="login-form" class="stack">
        <div class="field"><label for="email">Email address</label><input id="email" name="email" type="email" autocomplete="email" placeholder="you@example.com" required></div>
        <div class="field"><div class="row-between"><label for="password">Password</label><a href="#/forgot-password" class="auth-link small">Forgot password?</a></div><input id="password" name="password" type="password" autocomplete="current-password" placeholder="Enter your password" required></div>
        <button class="btn btn-primary full" type="submit">Sign in ${icons.arrowRight}</button>
      </form>
      <p class="small" style="margin:24px 0 0;text-align:center">New to OMA Bank? <a href="#/onboarding" class="auth-link">Open an account</a></p>
    </div>`);

  document.getElementById("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const button = e.submitter;
    const form = new FormData(e.currentTarget);
    try {
      setButtonLoading(button, true, "Signing in");
      const response = await api("/auth/login", { method: "POST", body: JSON.stringify({ email: form.get("email"), password: form.get("password") }) });
      saveSession(response.data);
      toast(`Welcome back, ${response.data.firstName}.`);
      navigate("dashboard");
    } catch (error) { toast(error.message, "error"); }
    finally { setButtonLoading(button, false); }
  });
}

function forgotPasswordPage() {
  if (state.token) return navigate("dashboard");
  app.innerHTML = authLayout(`
    <div class="auth-card">
      <a href="#/login" class="auth-link small">← Back to sign in</a>
      <h2 style="margin-top:20px">Reset your password</h2>
      <p>Enter the email address attached to your account. We’ll send reset instructions if the account exists.</p>
      <form id="forgot-form" class="stack">
        <div class="field"><label>Email address</label><input name="email" type="email" required placeholder="you@example.com"></div>
        <button class="btn btn-primary" type="submit">Send reset instructions</button>
      </form>
    </div>`);
  document.getElementById("forgot-form").addEventListener("submit", async (e) => {
    e.preventDefault(); const button = e.submitter; const email = new FormData(e.currentTarget).get("email");
    try { setButtonLoading(button,true,"Sending"); const r=await api("/auth/forgot-password",{method:"POST",body:JSON.stringify({email})}); toast(r.message); }
    catch(err){ toast(err.message,"error"); } finally { setButtonLoading(button,false); }
  });
}

function resetPasswordPage(params) {
  const token = params.get("token");
  app.innerHTML = authLayout(`
    <div class="auth-card">
      <h2>Create a new password</h2>
      <p>${token ? "Choose a strong password with at least 8 characters." : "This reset link does not contain a token. Request a new reset email."}</p>
      ${token ? `<form id="reset-form" class="stack">
        <div class="field"><label>New password</label><input name="newPassword" type="password" minlength="8" required></div>
        <div class="field"><label>Confirm new password</label><input name="confirmPassword" type="password" minlength="8" required></div>
        <button class="btn btn-primary" type="submit">Reset password</button>
      </form>` : `<a class="btn btn-primary" href="#/forgot-password">Request a new link</a>`}
    </div>`);
  document.getElementById("reset-form")?.addEventListener("submit", async (e) => {
    e.preventDefault(); const button=e.submitter; const f=new FormData(e.currentTarget);
    try {
      setButtonLoading(button,true,"Resetting");
      const r=await api(`/auth/reset-password/${encodeURIComponent(token)}`,{method:"POST",body:JSON.stringify({newPassword:f.get("newPassword"),confirmPassword:f.get("confirmPassword")})});
      saveSession({ ...(state.user || {}), token: r.data.token });
      toast(r.message); navigate("dashboard");
    } catch(err){ toast(err.message,"error"); } finally { setButtonLoading(button,false); }
  });
}

function onboardingPage() {
  if (state.token) return navigate("dashboard");
  const saved = safeJson(sessionStorage.getItem(ONBOARDING_KEY)) || {};
  const step = saved.account?.accountNumber ? 3 : saved.onboardingId ? 2 : 1;

  app.innerHTML = authLayout(`
    <div class="onboard-panel">
      <div class="row-between wrap"><div><h2 style="margin:0;font-size:32px;letter-spacing:-.04em">Open your OMA account</h2><p class="muted" style="margin:8px 0 0">Complete these three steps to start banking.</p></div><a class="auth-link small" href="#/login">Already registered? Sign in</a></div>
      <div class="steps">
        <div class="step ${step===1?"active":step>1?"done":""}"><div class="step-bar"></div><span>1. Verify identity</span></div>
        <div class="step ${step===2?"active":step>2?"done":""}"><div class="step-bar"></div><span>2. Create account</span></div>
        <div class="step ${step===3?"active":""}"><div class="step-bar"></div><span>3. Register login</span></div>
      </div>
      <div id="onboarding-stage"></div>
    </div>`, "onboarding");

  renderOnboardingStage(step, saved);
}

function renderOnboardingStage(step, saved) {
  const stage = document.getElementById("onboarding-stage");
  if (!stage) return;
  if (step === 1) {
    stage.innerHTML = `<form id="kyc-form" class="stack">
      <div class="form-grid">
        <div class="field"><label>KYC type</label><select name="kycType"><option value="NIN">NIN</option><option value="BVN">BVN</option></select></div>
        <div class="field"><label>NIN / BVN number</label><input name="kycID" inputmode="numeric" maxlength="11" pattern="[0-9]{11}" placeholder="11 digits" required></div>
        <div class="field"><label>First name</label><input name="firstName" required autocomplete="given-name"></div>
        <div class="field"><label>Last name</label><input name="lastName" required autocomplete="family-name"></div>
        <div class="field"><label>Date of birth</label><input name="dob" type="date" required></div>
        <div class="field"><label>Phone number</label><input name="phone" type="tel" required autocomplete="tel" placeholder="08012345678"></div>
      </div>
      <p class="input-note">For this training project, use only test BVN/NIN data accepted by NIBSS by Phoenix — never enter a real identity number.</p>
      <button class="btn btn-primary" type="submit">Verify identity ${icons.arrowRight}</button>
    </form>`;
    stage.querySelector("form").addEventListener("submit", async (e) => {
      e.preventDefault(); const button=e.submitter; const f=new FormData(e.currentTarget);
      const payload=Object.fromEntries(f.entries());
      try {
        setButtonLoading(button,true,"Verifying");
        const r=await api("/onboarding/kyc",{method:"POST",body:JSON.stringify(payload)});
        const data={...saved,...payload,onboardingId:r.data.onboardingId};
        sessionStorage.setItem(ONBOARDING_KEY,JSON.stringify(data));
        toast(r.message); onboardingPage();
      } catch(err){
        if (err.status===409 && err.payload?.data?.onboardingId) {
          const data={...saved,...payload,onboardingId:err.payload.data.onboardingId};
          sessionStorage.setItem(ONBOARDING_KEY,JSON.stringify(data));
          toast("This identity was already onboarded. Continuing with the existing onboarding record.");
          onboardingPage();
        } else toast(err.message,"error");
      } finally { setButtonLoading(button,false); }
    });
  } else if (step === 2) {
    stage.innerHTML = `<div class="success-panel stack">
      <div class="row"><div class="success-icon">${icons.check}</div><div><strong>Identity verified</strong><div class="muted small">Your onboarding record is ready for account creation.</div></div></div>
      <div><div class="small muted" style="margin-bottom:6px">Onboarding ID</div><div class="code-chip">${escapeHtml(saved.onboardingId)}</div></div>
      <button id="create-account" class="btn btn-primary">Create my bank account ${icons.arrowRight}</button>
      <button id="restart-onboarding" class="btn btn-ghost btn-sm">Start over with different test data</button>
    </div>`;
    document.getElementById("create-account").addEventListener("click", async (e) => {
      const button=e.currentTarget;
      try {
        setButtonLoading(button,true,"Creating account");
        const r=await api("/account/create",{method:"POST",body:JSON.stringify({onboardingId:saved.onboardingId})});
        sessionStorage.setItem(ONBOARDING_KEY,JSON.stringify({...saved,account:r.account}));
        toast(r.message); onboardingPage();
      } catch(err){ toast(err.message,"error"); } finally { setButtonLoading(button,false); }
    });
    document.getElementById("restart-onboarding").addEventListener("click",()=>{sessionStorage.removeItem(ONBOARDING_KEY);onboardingPage();});
  } else {
    stage.innerHTML = `<div class="success-panel" style="margin-bottom:20px">
      <div class="row"><div class="success-icon">${icons.check}</div><div><strong>Account created</strong><div class="muted small">${escapeHtml(saved.account?.accountName || "OMA Bank customer")} · ${escapeHtml(saved.account?.accountNumber || "")}</div></div></div>
    </div>
    <form id="register-form" class="stack">
      <div class="field"><label>Email address</label><input name="email" type="email" required autocomplete="email"></div>
      <div class="field"><label>Create password</label><input name="password" type="password" minlength="8" required autocomplete="new-password"><span class="input-note">Use at least 8 characters.</span></div>
      <button class="btn btn-primary" type="submit">Finish registration ${icons.arrowRight}</button>
    </form>`;
    document.getElementById("register-form").addEventListener("submit", async (e)=>{
      e.preventDefault(); const button=e.submitter; const f=new FormData(e.currentTarget);
      try {
        setButtonLoading(button,true,"Registering");
        const r=await api("/auth/register",{method:"POST",body:JSON.stringify({onboardingId:saved.onboardingId,email:f.get("email"),password:f.get("password")})});
        saveSession(r.data); sessionStorage.removeItem(ONBOARDING_KEY); toast(r.message); navigate("dashboard");
      } catch(err){ toast(err.message,"error"); } finally { setButtonLoading(button,false); }
    });
  }
}

async function dashboardPage() {
  if (!state.token) return navigate("login");
  await ensureProfile();
  app.innerHTML = appShell(`
    <div class="page-head"><div><h1>Good ${greeting()}, ${escapeHtml(state.profile?.firstName || state.user?.firstName || "there")}</h1><p>Here’s what’s happening with your account today.</p></div><button class="btn btn-secondary btn-sm" id="refresh-dashboard">${icons.refresh} Refresh</button></div>
    <div class="dashboard-grid">
      <div>
        <section class="balance-card" id="balance-card">
          <span class="label">Available balance</span>
          <div class="balance-value"><span class="skeleton" style="display:inline-block;width:220px;height:52px"></span></div>
          <div class="balance-meta"><div><span>Account name</span><strong>${escapeHtml(state.profile?.account?.accountName || state.user?.accountName || "—")}</strong></div><div><span>Account number</span><strong id="account-number">${escapeHtml(state.profile?.account?.accountNumber || state.user?.accountNumber || "—")}</strong></div></div>
        </section>
        <div class="quick-grid">
          <button class="quick-action" data-route="transfer"><div class="quick-icon">${icons.send}</div><strong>Send money</strong><span>Transfer to another account</span></button>
          <button class="quick-action" data-route="statement"><div class="quick-icon">${icons.file}</div><strong>Statement</strong><span>View or download PDF</span></button>
          <button class="quick-action" data-copy-account><div class="quick-icon">${icons.copy}</div><strong>Copy account</strong><span>Share your account number</span></button>
        </div>
      </div>
      <section class="card card-pad">
        <div class="row-between"><h3 class="card-title">Account details</h3><span class="badge badge-success">ACTIVE</span></div>
        <div class="detail-list">
          <div class="detail-row"><span>Bank</span><strong>${escapeHtml(state.profile?.account?.bankName || "OMA Bank")}</strong></div>
          <div class="detail-row"><span>Currency</span><strong>${escapeHtml(state.profile?.account?.currency || state.user?.currency || "NGN")}</strong></div>
          <div class="detail-row"><span>KYC</span><strong>${escapeHtml(state.profile?.kycType || "—")}</strong></div>
          <div class="detail-row"><span>Phone</span><strong>${escapeHtml(state.profile?.phone || "—")}</strong></div>
        </div>
      </section>
    </div>
    <section style="margin-top:26px">
      <div class="row-between" style="margin-bottom:13px"><h3 class="card-title">Recent transactions</h3><a class="auth-link small" href="#/transactions">View all</a></div>
      <div class="card table-card" id="recent-transactions"><div class="empty"><span class="loader" style="margin:auto"></span></div></div>
    </section>`, "dashboard", "Dashboard");
  bindShell();
  bindQuickActions();
  document.getElementById("refresh-dashboard").addEventListener("click",()=>loadDashboardData(true));
  await loadDashboardData();
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
}

function bindQuickActions() {
  document.querySelectorAll("[data-route]").forEach(el=>el.addEventListener("click",()=>navigate(el.dataset.route)));
  document.querySelector("[data-copy-account]")?.addEventListener("click",async()=>{
    const number=state.balance?.accountNumber || state.profile?.account?.accountNumber || state.user?.accountNumber;
    if (!number) return toast("Account number is not available yet.","error");
    try { await navigator.clipboard.writeText(number); toast("Account number copied."); } catch { toast(`Account number: ${number}`); }
  });
}

async function loadDashboardData(showToast=false) {
  try {
    const [balanceRes, txRes] = await Promise.all([api("/banking/balance"), api("/banking/transactions")]);
    state.balance = balanceRes.data; state.transactions = txRes.data || [];
    const card=document.getElementById("balance-card");
    if(card){
      card.querySelector(".balance-value").textContent=money(state.balance.balance,state.balance.currency);
      const num=card.querySelector("#account-number"); if(num) num.textContent=state.balance.accountNumber;
    }
    renderTxTable(document.getElementById("recent-transactions"), state.transactions.slice(0,5), false);
    if(showToast) toast("Dashboard refreshed.");
  } catch(err){
    const card=document.getElementById("balance-card"); if(card) card.querySelector(".balance-value").textContent="Unavailable";
    const tx=document.getElementById("recent-transactions"); if(tx) tx.innerHTML=`<div class="empty">${escapeHtml(err.message)}</div>`;
    toast(err.message,"error");
  }
}

function txStatusBadge(status) {
  const s=String(status||"").toUpperCase();
  return `<span class="badge ${s==="SUCCESS"?"badge-success":s==="FAILED"?"badge-failed":"badge-pending"}">${escapeHtml(s||"UNKNOWN")}</span>`;
}

function renderTxTable(container, transactions, showActions=true) {
  if (!container) return;
  if (!transactions?.length) {
    container.innerHTML=`<div class="empty"><div class="empty-icon">${icons.list}</div><strong>No transactions yet</strong><div class="small" style="margin-top:6px">Your completed transactions will appear here.</div></div>`; return;
  }
  container.innerHTML=`<div class="table-wrap"><table><thead><tr><th>Transaction</th><th>Date</th><th>Status</th><th>Amount</th>${showActions?"<th></th>":""}</tr></thead><tbody>${transactions.map(tx=>`<tr>
    <td><div class="tx-title">${escapeHtml(tx.description || tx.type || "Transaction")}</div><div class="tx-ref">${escapeHtml(tx.reference || "")}</div></td>
    <td>${dateTime(tx.createdAt || tx.date)}</td>
    <td>${txStatusBadge(tx.status)}</td>
    <td class="${tx.direction==="CREDIT"?"amount-credit":"amount-debit"}">${tx.direction==="CREDIT"?"+":"-"}${money(tx.amount, state.balance?.currency || "NGN")}</td>
    ${showActions?`<td class="text-right"><button class="btn btn-secondary btn-sm" data-receipt="${escapeHtml(tx.reference)}">${icons.receipt} Receipt</button></td>`:""}
  </tr>`).join("")}</tbody></table></div>`;
  container.querySelectorAll("[data-receipt]").forEach(btn=>btn.addEventListener("click",async()=>{
    try { setButtonLoading(btn,true,"Downloading"); await downloadProtected(`/banking/transactions/${encodeURIComponent(btn.dataset.receipt)}/receipt`,`OMA-receipt-${btn.dataset.receipt}.pdf`); }
    catch(err){ toast(err.message,"error"); } finally { setButtonLoading(btn,false); }
  }));
}

async function transferPage() {
  if(!state.token) return navigate("login");
  await ensureProfile();
  app.innerHTML=appShell(`
    <div class="page-head"><div><h1>Send money</h1><p>Verify the beneficiary before you authorize the transfer.</p></div></div>
    <div class="transfer-layout">
      <section class="card card-pad">
        <form id="transfer-form" class="stack">
          <div class="field"><label>Beneficiary account number</label><div class="row"><input name="to" id="beneficiary-account" inputmode="numeric" maxlength="10" pattern="[0-9]{10}" placeholder="10-digit account number" required><button type="button" id="verify-beneficiary" class="btn btn-secondary" style="white-space:nowrap">Verify</button></div></div>
          <div id="beneficiary-result"></div>
          <div class="field"><label>Amount (NGN)</label><input name="amount" id="transfer-amount" type="number" min="0.01" step="0.01" placeholder="0.00" required></div>
          <div class="field"><label>Description</label><textarea name="description" maxlength="120" placeholder="What is this transfer for?"></textarea></div>
          <div class="field"><label>4-digit transfer PIN</label><input name="pin" inputmode="numeric" maxlength="4" pattern="[0-9]{4}" type="password" placeholder="••••" required><span class="input-note">Your PIN is checked securely by the backend and is never stored in this browser.</span></div>
          <button class="btn btn-primary" type="submit">Review & send ${icons.arrowRight}</button>
        </form>
      </section>
      <aside class="card card-pad transfer-summary">
        <h3 class="card-title">Transfer summary</h3>
        <div class="detail-list">
          <div class="detail-row"><span>From</span><strong>${escapeHtml(state.profile?.account?.accountNumber || state.user?.accountNumber || "—")}</strong></div>
          <div class="detail-row"><span>Available balance</span><strong id="transfer-balance">Loading…</strong></div>
          <div class="detail-row"><span>Beneficiary</span><strong id="summary-beneficiary">Not verified</strong></div>
        </div>
        <div class="amount-box" style="margin-top:18px"><span class="muted small">You are sending</span><div class="total" id="summary-amount">₦0.00</div></div>
        <p class="input-note" style="margin-top:16px">OMA Bank uses an idempotency key on each transfer to reduce the risk of duplicate debits.</p>
      </aside>
    </div>`,"transfer","Send money");
  bindShell();
  let beneficiary=null;
  try { const r=await api("/banking/balance"); state.balance=r.data; document.getElementById("transfer-balance").textContent=money(r.data.balance,r.data.currency); }
  catch(err){ document.getElementById("transfer-balance").textContent="Unavailable"; toast(err.message,"error"); }
  document.getElementById("transfer-amount").addEventListener("input",e=>{document.getElementById("summary-amount").textContent=money(e.target.value||0,"NGN");});
  document.getElementById("verify-beneficiary").addEventListener("click",async(e)=>{
    const btn=e.currentTarget; const number=document.getElementById("beneficiary-account").value.trim();
    if(!/^\d{10}$/.test(number)) return toast("Enter a valid 10-digit account number.","error");
    try {
      setButtonLoading(btn,true,"Checking");
      const r=await api(`/banking/name-enquiry/${encodeURIComponent(number)}`);
      beneficiary=r.data;
      const name=beneficiary.accountName || beneficiary.name || beneficiary.account_name || "Verified beneficiary";
      document.getElementById("beneficiary-result").innerHTML=`<div class="account-preview"><div class="row"><div class="success-icon" style="width:35px;height:35px;font-size:15px">${icons.check}</div><div><strong>${escapeHtml(name)}</strong><span class="muted small">Account verified by NIBSS</span></div></div></div>`;
      document.getElementById("summary-beneficiary").textContent=name;
    } catch(err){ beneficiary=null; document.getElementById("beneficiary-result").innerHTML=""; document.getElementById("summary-beneficiary").textContent="Not verified"; toast(err.message,"error"); }
    finally { setButtonLoading(btn,false); }
  });
  document.getElementById("transfer-form").addEventListener("submit",async(e)=>{
    e.preventDefault(); const f=new FormData(e.currentTarget); const to=String(f.get("to")||"").trim();
    if(!beneficiary) return toast("Verify the beneficiary account first.","error");
    const amount=Number(f.get("amount"));
    const beneficiaryName=beneficiary.accountName || beneficiary.name || "the beneficiary";
    openConfirmModal(`Send ${money(amount,"NGN")} to ${beneficiaryName}?`, async()=>{
      const button=e.submitter;
      try {
        setButtonLoading(button,true,"Sending");
        const idempotencyKey=`oma-${Date.now()}-${crypto.randomUUID()}`;
        const r=await api("/banking/transfer",{method:"POST",headers:{"Idempotency-Key":idempotencyKey},body:JSON.stringify({to,amount,description:f.get("description"),pin:f.get("pin")})});
        toast(r.message || "Transfer completed successfully.");
        navigate("transactions");
      } catch(err){ toast(err.message,"error"); } finally { setButtonLoading(button,false); }
    });
  });
}

function openConfirmModal(message, onConfirm) {
  const backdrop=document.createElement("div"); backdrop.className="modal-backdrop";
  backdrop.innerHTML=`<div class="modal"><h3>Confirm transfer</h3><p>${escapeHtml(message)}</p><p class="small">Check the account details carefully before continuing. Completed bank transfers may not be reversible.</p><div class="row" style="justify-content:flex-end;margin-top:20px"><button class="btn btn-secondary" data-cancel>Cancel</button><button class="btn btn-primary" data-confirm>Confirm & send</button></div></div>`;
  document.body.append(backdrop);
  backdrop.querySelector("[data-cancel]").addEventListener("click",()=>backdrop.remove());
  backdrop.addEventListener("click",e=>{if(e.target===backdrop) backdrop.remove();});
  backdrop.querySelector("[data-confirm]").addEventListener("click",async()=>{backdrop.remove(); await onConfirm();});
}

async function transactionsPage() {
  if(!state.token) return navigate("login"); await ensureProfile();
  app.innerHTML=appShell(`
    <div class="page-head"><div><h1>Transactions</h1><p>Review your latest account activity and download receipts.</p></div><button class="btn btn-secondary btn-sm" id="refresh-tx">${icons.refresh} Refresh</button></div>
    <div class="stat-grid" id="tx-stats"><div class="stat"><span>Total shown</span><strong>—</strong></div><div class="stat"><span>Credits</span><strong>—</strong></div><div class="stat"><span>Debits</span><strong>—</strong></div></div>
    <section class="card table-card" id="transactions-table"><div class="empty"><span class="loader" style="margin:auto"></span></div></section>`,"transactions","Transactions"); bindShell();
  const load=async()=>{try{const r=await api("/banking/transactions");state.transactions=r.data||[];renderTxTable(document.getElementById("transactions-table"),state.transactions,true);const cr=state.transactions.filter(t=>t.direction==="CREDIT").reduce((s,t)=>s+Number(t.amount||0),0);const dr=state.transactions.filter(t=>t.direction==="DEBIT").reduce((s,t)=>s+Number(t.amount||0),0);document.getElementById("tx-stats").innerHTML=`<div class="stat"><span>Total shown</span><strong>${state.transactions.length}</strong></div><div class="stat"><span>Credits</span><strong>${money(cr)}</strong></div><div class="stat"><span>Debits</span><strong>${money(dr)}</strong></div>`;}catch(err){toast(err.message,"error");}};
  document.getElementById("refresh-tx").addEventListener("click",load); await load();
}

async function statementPage() {
  if(!state.token) return navigate("login"); await ensureProfile();
  const today=new Date(); const start=new Date(today); start.setDate(today.getDate()-30);
  const iso=d=>d.toISOString().slice(0,10);
  app.innerHTML=appShell(`
    <div class="page-head"><div><h1>Account statement</h1><p>Filter your posted transactions and download a PDF statement.</p></div></div>
    <section class="card card-pad" style="margin-bottom:20px">
      <form id="statement-form" class="stack">
        <div class="form-grid">
          <div class="field"><label>From</label><input name="from" type="date" value="${iso(start)}" required></div>
          <div class="field"><label>To</label><input name="to" type="date" value="${iso(today)}" required></div>
          <div class="field"><label>Direction</label><select name="direction"><option value="">All</option><option>CREDIT</option><option>DEBIT</option></select></div>
          <div class="field"><label>Transaction type</label><select name="type"><option value="">All</option><option>INITIAL_FUNDING</option><option>TRANSFER</option><option>CREDIT</option><option>DEBIT</option></select></div>
        </div>
        <div class="row wrap"><button class="btn btn-primary" type="submit">Generate statement</button><button class="btn btn-secondary" type="button" id="download-statement">${icons.download} Download PDF</button></div>
      </form>
    </section>
    <div id="statement-summary"></div>
    <section class="card table-card" id="statement-table"><div class="empty">Choose a date range and generate your statement.</div></section>`,"statement","Statements"); bindShell();
  let currentQuery="";
  const form=document.getElementById("statement-form");
  const load=async(e)=>{
    e?.preventDefault(); const button=e?.submitter; const f=new FormData(form); const q=new URLSearchParams();
    for(const [k,v] of f.entries()) if(v) q.set(k,v); q.set("page","1");q.set("limit","100"); currentQuery=q.toString();
    try{if(button)setButtonLoading(button,true,"Generating");const r=await api(`/banking/statement?${currentQuery}`); const d=r.data;document.getElementById("statement-summary").innerHTML=`<div class="stat-grid"><div class="stat"><span>Opening balance</span><strong>${money(d.summary.openingBalance,d.account.currency)}</strong></div><div class="stat"><span>Total credits</span><strong>${money(d.summary.totalCredits,d.account.currency)}</strong></div><div class="stat"><span>Total debits</span><strong>${money(d.summary.totalDebits,d.account.currency)}</strong></div></div>`;renderTxTable(document.getElementById("statement-table"),d.transactions,false);}catch(err){toast(err.message,"error");}finally{if(button)setButtonLoading(button,false);}
  };
  form.addEventListener("submit",load);
  document.getElementById("download-statement").addEventListener("click",async(e)=>{const f=new FormData(form);const from=f.get("from"),to=f.get("to");if(!from||!to)return toast("Choose both statement dates.","error");const btn=e.currentTarget;try{setButtonLoading(btn,true,"Downloading");await downloadProtected(`/banking/statement/pdf?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,`OMA-statement-${from}-to-${to}.pdf`);}catch(err){toast(err.message,"error");}finally{setButtonLoading(btn,false);}});
  await load();
}

async function securityPage() {
  if(!state.token) return navigate("login"); await ensureProfile();
  app.innerHTML=appShell(`
    <div class="page-head"><div><h1>Security</h1><p>Manage your transfer PIN and review recent account security activity.</p></div></div>
    <div class="settings-grid">
      <section class="card card-pad">
        <h3 class="card-title">Transfer PIN</h3><p class="muted small">Create a 4-digit PIN before making transfers. If one already exists, use the change form.</p>
        <form id="pin-form" class="stack" style="margin-top:18px">
          <div class="field"><label>Login password</label><input name="password" type="password" required></div>
          <div class="form-grid"><div class="field"><label>New PIN</label><input name="pin" type="password" inputmode="numeric" maxlength="4" pattern="[0-9]{4}" required></div><div class="field"><label>Confirm PIN</label><input name="confirmPin" type="password" inputmode="numeric" maxlength="4" pattern="[0-9]{4}" required></div></div>
          <button class="btn btn-primary" type="submit">Create transfer PIN</button>
        </form>
        <hr style="border:0;border-top:1px solid var(--line);margin:24px 0">
        <form id="change-pin-form" class="stack">
          <div class="form-grid"><div class="field"><label>Current PIN</label><input name="currentPin" type="password" inputmode="numeric" maxlength="4" required></div><div class="field"><label>New PIN</label><input name="newPin" type="password" inputmode="numeric" maxlength="4" required></div></div>
          <div class="field"><label>Confirm new PIN</label><input name="confirmPin" type="password" inputmode="numeric" maxlength="4" required></div>
          <button class="btn btn-secondary" type="submit">Change transfer PIN</button>
        </form>
      </section>
      <section class="card card-pad"><div class="row-between"><h3 class="card-title">Recent security activity</h3><button class="btn btn-secondary btn-sm" id="refresh-security">${icons.refresh}</button></div><div id="security-list" style="margin-top:12px"><div class="empty"><span class="loader" style="margin:auto"></span></div></div></section>
    </div>`,"security","Security");bindShell();
  const load=async()=>{try{const r=await api("/auth/security-activity");const list=document.getElementById("security-list");if(!r.data?.length){list.innerHTML=`<div class="empty">No security activity found.</div>`;return;}list.innerHTML=r.data.map(log=>`<div class="security-log ${log.status==="FAILED"?"failed":""}"><div class="log-dot"></div><div><strong>${escapeHtml(log.action?.replaceAll("_"," ")||"Account activity")}</strong><p>${escapeHtml(log.message||"")}<br>${dateTime(log.createdAt)}${log.ipAddress?` · ${escapeHtml(log.ipAddress)}`:""}</p></div></div>`).join("");}catch(err){toast(err.message,"error");}};
  document.getElementById("refresh-security").addEventListener("click",load); await load();
  document.getElementById("pin-form").addEventListener("submit",async(e)=>{e.preventDefault();const btn=e.submitter;const f=new FormData(e.currentTarget);try{setButtonLoading(btn,true,"Saving");const r=await api("/auth/transfer-pin",{method:"POST",body:JSON.stringify(Object.fromEntries(f.entries()))});toast(r.message);e.currentTarget.reset();}catch(err){toast(err.message,"error");}finally{setButtonLoading(btn,false);}});
  document.getElementById("change-pin-form").addEventListener("submit",async(e)=>{e.preventDefault();const btn=e.submitter;const f=new FormData(e.currentTarget);try{setButtonLoading(btn,true,"Changing");const r=await api("/auth/transfer-pin",{method:"PUT",body:JSON.stringify(Object.fromEntries(f.entries()))});toast(r.message);e.currentTarget.reset();}catch(err){toast(err.message,"error");}finally{setButtonLoading(btn,false);}});
}

async function settingsPage() {
  if(!state.token) return navigate("login"); await ensureProfile();
  const p=state.profile||{}; const a=p.account||{};
  app.innerHTML=appShell(`
    <div class="page-head"><div><h1>Profile & settings</h1><p>Review your customer details and update your account password.</p></div></div>
    <div class="settings-grid">
      <section class="card profile-card"><div class="avatar">${initials(p.firstName,p.lastName)}</div><h3>${escapeHtml(`${p.firstName||""} ${p.lastName||""}`.trim())}</h3><p>${escapeHtml(p.email||"")}</p><span class="badge badge-success">${escapeHtml(a.status||"ACTIVE")}</span><div class="detail-list"><div class="detail-row"><span>Account</span><strong>${escapeHtml(a.accountNumber||"—")}</strong></div><div class="detail-row"><span>Phone</span><strong>${escapeHtml(p.phone||"—")}</strong></div><div class="detail-row"><span>KYC type</span><strong>${escapeHtml(p.kycType||"—")}</strong></div><div class="detail-row"><span>Bank</span><strong>${escapeHtml(a.bankName||"OMA Bank")}</strong></div></div></section>
      <div class="stack">
        <section class="card card-pad"><h3 class="card-title">Change password</h3><p class="muted small">Changing your password issues a fresh login token.</p><form id="password-form" class="stack" style="margin-top:18px"><div class="field"><label>Current password</label><input name="currentPassword" type="password" required></div><div class="form-grid"><div class="field"><label>New password</label><input name="newPassword" type="password" minlength="8" required></div><div class="field"><label>Confirm password</label><input name="confirmPassword" type="password" minlength="8" required></div></div><button class="btn btn-primary" type="submit">Update password</button></form></section>
        <section class="card card-pad" style="border-color:#f0c5c5"><h3 class="card-title" style="color:var(--danger)">Block account</h3><p class="muted small">Use this only if you believe your account is compromised. Blocking prevents normal account use and may require administrator review to restore access.</p><button class="btn btn-danger" id="block-account">Block my account</button></section>
      </div>
    </div>`,"settings","Profile & settings");bindShell();
  document.getElementById("password-form").addEventListener("submit",async(e)=>{e.preventDefault();const btn=e.submitter;const f=new FormData(e.currentTarget);try{setButtonLoading(btn,true,"Updating");const r=await api("/auth/change-password",{method:"POST",body:JSON.stringify(Object.fromEntries(f.entries()))});if(r.data?.token){state.token=r.data.token;sessionStorage.setItem(TOKEN_KEY,r.data.token);}toast(r.message);e.currentTarget.reset();}catch(err){toast(err.message,"error");}finally{setButtonLoading(btn,false);}});
  document.getElementById("block-account").addEventListener("click",()=>openBlockModal());
}

function openBlockModal(){
  const backdrop=document.createElement("div");backdrop.className="modal-backdrop";backdrop.innerHTML=`<div class="modal"><h3>Block your account?</h3><p>This is a security action. Confirm your login password and enter the reason for blocking your account.</p><div class="stack"><div class="field"><label>Login password</label><input id="block-password" type="password" autocomplete="current-password" placeholder="Enter your password"></div><div class="field"><label>Reason</label><textarea id="block-reason" placeholder="e.g. I suspect unauthorized access"></textarea></div></div><div class="row" style="justify-content:flex-end;margin-top:20px"><button class="btn btn-secondary" data-cancel>Cancel</button><button class="btn btn-danger" data-confirm>Block account</button></div></div>`;document.body.append(backdrop);backdrop.querySelector("[data-cancel]").onclick=()=>backdrop.remove();backdrop.querySelector("[data-confirm]").onclick=async()=>{const password=document.getElementById("block-password").value;const reason=document.getElementById("block-reason").value.trim();if(!password)return toast("Enter your login password.","error");if(!reason)return toast("Enter a reason for blocking the account.","error");const btn=backdrop.querySelector("[data-confirm]");try{setButtonLoading(btn,true,"Blocking");const r=await api("/auth/block-account",{method:"POST",body:JSON.stringify({password,reason})});backdrop.remove();clearSession(false);toast(r.message||"Account blocked.");navigate("login");}catch(err){toast(err.message,"error");setButtonLoading(btn,false);}};
}

function notFoundPage() {
  app.innerHTML = state.token ? appShell(`<div class="empty"><div class="empty-icon">?</div><h2>Page not found</h2><a class="btn btn-primary" href="#/dashboard">Back to dashboard</a></div>`) : authLayout(`<div class="auth-card"><h2>Page not found</h2><p>The page you requested does not exist.</p><a class="btn btn-primary" href="#/login">Go to sign in</a></div>`);
  if(state.token) bindShell();
}

async function routeApp() {
  const { route, params } = getHashParts();
  const publicRoutes = new Set(["login","forgot-password","reset-password","onboarding"]);
  if (!state.token && !publicRoutes.has(route)) return navigate("login");
  if (state.token && publicRoutes.has(route) && route !== "reset-password") return navigate("dashboard");
  window.scrollTo(0,0);
  try {
    switch(route){
      case "login": return loginPage();
      case "forgot-password": return forgotPasswordPage();
      case "reset-password": return resetPasswordPage(params);
      case "onboarding": return onboardingPage();
      case "dashboard": return await dashboardPage();
      case "transfer": return await transferPage();
      case "transactions": return await transactionsPage();
      case "statement": return await statementPage();
      case "security": return await securityPage();
      case "settings": return await settingsPage();
      default: return notFoundPage();
    }
  } catch(error) {
    console.error(error);
    toast(error.message || "Something went wrong.","error");
  }
}

window.addEventListener("hashchange", routeApp);
window.addEventListener("DOMContentLoaded", () => {
  const directResetPath =
    location.pathname.replace(/\/+$/, "").endsWith("/app/reset-password");

  if (directResetPath) {
    routeApp();
    return;
  }

  if (!location.hash) {
    navigate(state.token ? "dashboard" : "login");
    return;
  }

  routeApp();
});
