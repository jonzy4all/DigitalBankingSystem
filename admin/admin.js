const ADMIN_KEY_STORAGE = "oma_bank_admin_key";
const THEME_KEY = "oma_bank_theme";
const app = document.getElementById("admin-app");
const toastRoot = document.getElementById("admin-toast-root");

const icons = {
  home: `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M3 10.8 12 3l9 7.8v9.7a.5.5 0 0 1-.5.5h-17a.5.5 0 0 1-.5-.5z"/><path d="M9 21v-7h6v7"/></svg>`,
  users: `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  account: `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h3"/></svg>`,
  shield: `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M20 13c0 5-3.5 7.5-8 9-4.5-1.5-8-4-8-9V5l8-3 8 3z"/></svg>`,
  list: `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/></svg>`,
  audit: `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`,
  logout: `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M10 17l5-5-5-5M15 12H3"/><path d="M13 3h7a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-7"/></svg>`,
  menu: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg>`,
  refresh: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M20 7h-6V1"/><path d="M20 7a9 9 0 1 0 1 7"/></svg>`,
  eye: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/></svg>`,
  eyeOff: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="m3 3 18 18"/><path d="M10.6 10.7a2 2 0 0 0 2.7 2.7"/><path d="M9.9 4.2A10.8 10.8 0 0 1 12 4c6.5 0 10 6 10 6a18 18 0 0 1-3 3.7"/><path d="M6.2 6.2C3.5 8 2 12 2 12s3.5 6 10 6c1.7 0 3.1-.4 4.4-1"/></svg>`,
};

const state = {
  key: sessionStorage.getItem(ADMIN_KEY_STORAGE),
  sidebarOpen: false,
};

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
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function statusBadge(status = "UNKNOWN") {
  const value = String(status).toUpperCase();
  const cls = value === "ACTIVE" || value === "SUCCESS"
    ? "badge-success"
    : value === "BLOCKED" || value === "FAILED" || value === "CLOSED"
      ? "badge-failed"
      : value === "PENDING"
        ? "badge-pending"
        : "badge-neutral";
  return `<span class="badge ${cls}">${escapeHtml(value)}</span>`;
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

function getTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === "dark" || saved === "light") return saved;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme) {
  const next = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = next;
  localStorage.setItem(THEME_KEY, next);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = next === "dark" ? "#08120f" : "#071a17";
  document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
    const switchingTo = next === "dark" ? "light" : "dark";
    button.setAttribute("aria-label", `Switch to ${switchingTo} theme`);
    button.setAttribute("title", `Switch to ${switchingTo} theme`);
    const symbol = button.querySelector("[data-theme-symbol]");
    const label = button.querySelector("[data-theme-label]");
    if (symbol) symbol.textContent = next === "dark" ? "☀" : "☾";
    if (label) label.textContent = next === "dark" ? "Light" : "Dark";
  });
}

function themeToggle(compact = false) {
  return `<button class="theme-toggle ${compact ? "theme-toggle-compact" : ""}" type="button" data-theme-toggle><span class="theme-symbol" data-theme-symbol></span><span data-theme-label></span></button>`;
}

function enhanceSecrets(root = document) {
  root.querySelectorAll?.('input[type="password"]:not([data-secret-enhanced])').forEach((input) => {
    input.dataset.secretEnhanced = "true";
    const wrapper = document.createElement("div");
    wrapper.className = "secret-field";
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "secret-toggle";
    button.innerHTML = icons.eye;
    button.setAttribute("aria-label", "Show value");
    button.addEventListener("click", () => {
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      button.innerHTML = show ? icons.eyeOff : icons.eye;
      button.setAttribute("aria-label", show ? "Hide value" : "Show value");
      input.focus({ preventScroll: true });
    });
    wrapper.appendChild(button);
  });
}

async function adminApi(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (!(options.body instanceof FormData) && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (state.key) headers.set("x-admin-key", state.key);

  let response;
  try {
    response = await fetch(path, { ...options, headers });
  } catch {
    throw new Error("Cannot reach the OMA Bank server.");
  }

  const type = response.headers.get("content-type") || "";
  const data = type.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok) {
    const message = data?.message || data?.error?.message || (typeof data === "string" ? data : "Request failed");
    if (response.status === 401 && state.key) {
      state.key = null;
      sessionStorage.removeItem(ADMIN_KEY_STORAGE);
      if (location.hash !== "#/login") location.hash = "#/login";
    }
    const error = new Error(message);
    error.status = response.status;
    error.payload = data;
    throw error;
  }
  return data;
}

function navigate(route) {
  location.hash = `#/${route}`;
}

function currentRoute() {
  return location.hash.replace(/^#\/?/, "") || (state.key ? "dashboard" : "login");
}

function loginLayout(content) {
  return `<main class="admin-auth-shell">
    <section class="admin-auth-visual">
      <a class="brand" href="/app/"><span class="brand-mark">O</span><span>OMA Bank</span></a>
      <div class="admin-auth-copy">
        <div class="eyebrow">Internal administration</div>
        <h1>Control room for your digital bank.</h1>
        <p>Review customer accounts, banking activity and security events from one protected operations dashboard.</p>
      </div>
      <div class="auth-trust"><span><i></i>Protected admin API</span><span><i></i>Account controls</span><span><i></i>Audit visibility</span></div>
    </section>
    <section class="admin-auth-panel">
      <div class="auth-theme-control">${themeToggle()}</div>
      ${content}
    </section>
  </main>`;
}

function shell(content, active = "dashboard", title = "Admin dashboard") {
  const nav = [
    ["dashboard", "Dashboard", icons.home],
    ["customers", "Customers", icons.users],
    ["accounts", "Accounts", icons.account],
    ["blocked", "Blocked accounts", icons.shield],
    ["transactions", "Transactions", icons.list],
    ["audit", "Audit logs", icons.audit],
  ];
  return `<div class="app-shell">
    <aside class="sidebar admin-sidebar ${state.sidebarOpen ? "open" : ""}" id="admin-sidebar">
      <a class="brand" href="#/dashboard"><span class="brand-mark">O</span><span>OMA Bank</span></a>
      <span class="admin-badge">Administrator</span>
      <nav class="nav">${nav.map(([route,label,icon]) => `<a href="#/${route}" class="${active === route ? "active" : ""}">${icon}<span>${label}</span></a>`).join("")}</nav>
      <div class="sidebar-bottom">
        <div class="admin-user-label"><strong>Admin session</strong>Authenticated with your server-side admin key.</div>
        <a href="/app/" style="display:flex;align-items:center;gap:10px;color:rgba(255,255,255,.55);font-size:13px;padding:11px 9px">Customer app</a>
        <a href="#" id="admin-logout" style="display:flex;align-items:center;gap:10px;color:rgba(255,255,255,.55);font-size:13px;padding:11px 9px">${icons.logout} Sign out</a>
      </div>
    </aside>
    <section class="main admin-main">
      <header class="topbar">
        <div class="row">
          <button class="menu-btn" id="admin-menu" aria-label="Open menu">${icons.menu}</button>
          <div class="mobile-brand"><span class="brand-mark">O</span> OMA Admin</div>
          <strong class="topbar-title">${escapeHtml(title)}</strong>
        </div>
        <div class="row">${themeToggle(true)}<span class="muted small topbar-date">${new Intl.DateTimeFormat("en-NG", { weekday:"short", day:"numeric", month:"short" }).format(new Date())}</span><div class="avatar">AD</div></div>
      </header>
      <div class="page">${content}</div>
    </section>
  </div>`;
}

function bindShell() {
  applyTheme(document.documentElement.dataset.theme || getTheme());
  document.getElementById("admin-logout")?.addEventListener("click", (event) => {
    event.preventDefault();
    state.key = null;
    sessionStorage.removeItem(ADMIN_KEY_STORAGE);
    toast("Admin session ended.");
    navigate("login");
  });
  document.getElementById("admin-menu")?.addEventListener("click", () => {
    state.sidebarOpen = !state.sidebarOpen;
    document.getElementById("admin-sidebar")?.classList.toggle("open", state.sidebarOpen);
  });
  document.querySelectorAll(".admin-sidebar .nav a").forEach((link) => link.addEventListener("click", () => { state.sidebarOpen = false; }));
}

function paginationHtml(pagination, label = "records") {
  if (!pagination) return "";
  const current = Number(pagination.currentPage || 1);
  const totalPages = Math.max(1, Number(pagination.totalPages || 1));
  const total = pagination.totalCustomers ?? pagination.totalAccounts ?? pagination.totalTransactions ?? pagination.totalLogs ?? 0;
  return `<div class="admin-pagination"><span>Page ${current} of ${totalPages} · ${Number(total).toLocaleString()} ${label}</span><div class="row"><button class="btn btn-secondary btn-sm" data-page="${current - 1}" ${current <= 1 ? "disabled" : ""}>Previous</button><button class="btn btn-secondary btn-sm" data-page="${current + 1}" ${current >= totalPages ? "disabled" : ""}>Next</button></div></div>`;
}

function modal({ title, body, confirmText = "Confirm", danger = false, onConfirm }) {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `<div class="modal"><h3>${escapeHtml(title)}</h3>${body}<div class="row" style="justify-content:flex-end;margin-top:20px"><button class="btn btn-secondary" data-cancel>Cancel</button><button class="btn ${danger ? "btn-danger" : "btn-primary"}" data-confirm>${escapeHtml(confirmText)}</button></div></div>`;
  document.body.append(backdrop);
  backdrop.querySelector("[data-cancel]").onclick = () => backdrop.remove();
  backdrop.addEventListener("click", (event) => { if (event.target === backdrop) backdrop.remove(); });
  backdrop.querySelector("[data-confirm]").onclick = async () => {
    const button = backdrop.querySelector("[data-confirm]");
    try {
      setButtonLoading(button, true, "Working");
      const close = await onConfirm(backdrop);
      if (close !== false) backdrop.remove();
    } catch (error) {
      toast(error.message, "error");
      setButtonLoading(button, false);
    }
  };
  enhanceSecrets(backdrop);
  return backdrop;
}

function openBlockModal(accountNumber, accountName = "") {
  modal({
    title: "Block bank account",
    danger: true,
    confirmText: "Block account",
    body: `<p>Blocking immediately prevents normal customer banking activity.</p><div class="admin-modal-details"><strong>${escapeHtml(accountName || "Account")}</strong><br><span class="admin-account-number">${escapeHtml(accountNumber)}</span></div><div class="field"><label>Reason for blocking</label><textarea id="admin-block-reason" maxlength="300" placeholder="e.g. Suspicious activity under review"></textarea></div>`,
    onConfirm: async (backdrop) => {
      const reason = backdrop.querySelector("#admin-block-reason").value.trim();
      if (reason.length < 3) { toast("Enter a reason for blocking the account.", "error"); return false; }
      const result = await adminApi(`/admin/accounts/${encodeURIComponent(accountNumber)}/block`, { method:"PATCH", body:JSON.stringify({ reason }) });
      toast(result.message || "Account blocked.");
      await routeApp();
      return true;
    },
  });
}

function openUnblockModal(accountNumber, accountName = "") {
  modal({
    title: "Unblock bank account",
    confirmText: "Unblock account",
    body: `<p>Confirm that this account has been reviewed and can be reactivated.</p><div class="admin-modal-details"><strong>${escapeHtml(accountName || "Account")}</strong><br><span class="admin-account-number">${escapeHtml(accountNumber)}</span></div>`,
    onConfirm: async () => {
      const result = await adminApi(`/admin/accounts/${encodeURIComponent(accountNumber)}/unblock`, { method:"PATCH" });
      toast(result.message || "Account unblocked.");
      await routeApp();
      return true;
    },
  });
}

function bindAccountActions(root = document) {
  root.querySelectorAll("[data-block-account]").forEach((button) => button.addEventListener("click", () => openBlockModal(button.dataset.blockAccount, button.dataset.name || "")));
  root.querySelectorAll("[data-unblock-account]").forEach((button) => button.addEventListener("click", () => openUnblockModal(button.dataset.unblockAccount, button.dataset.name || "")));
}

function loginPage() {
  if (state.key) return navigate("dashboard");
  app.innerHTML = loginLayout(`<div class="admin-login-card">
    <h2>Admin sign in</h2>
    <p>Enter the <strong>ADMIN_API_KEY</strong> configured in your Render environment.</p>
    <form id="admin-login-form" class="stack">
      <div class="field"><label>Admin API key</label><input name="key" type="password" autocomplete="off" placeholder="Enter admin key" required></div>
      <button class="btn btn-primary full" type="submit">Open admin dashboard</button>
    </form>
    <div class="admin-security-note">The key is kept in browser <strong>session storage</strong>, not in this frontend source. Closing the tab/session removes it. For a real production bank, replace this demo admin-key flow with individual admin accounts, MFA and role-based authorization.</div>
    <p class="small" style="margin-top:20px"><a class="auth-link" href="/app/">← Back to customer banking</a></p>
  </div>`);
  applyTheme(document.documentElement.dataset.theme || getTheme());
  enhanceSecrets(document);
  document.getElementById("admin-login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.submitter;
    const key = new FormData(event.currentTarget).get("key").trim();
    if (!key) return toast("Enter the admin API key.", "error");
    try {
      setButtonLoading(button, true, "Checking access");
      state.key = key;
      const result = await adminApi("/admin/dashboard");
      if (!result.success) throw new Error(result.message || "Admin authentication failed");
      sessionStorage.setItem(ADMIN_KEY_STORAGE, key);
      toast("Admin access granted.");
      navigate("dashboard");
    } catch (error) {
      state.key = null;
      sessionStorage.removeItem(ADMIN_KEY_STORAGE);
      toast(error.message, "error");
    } finally {
      setButtonLoading(button, false);
    }
  });
}

async function dashboardPage() {
  const [summary, recent] = await Promise.all([
    adminApi("/admin/dashboard"),
    adminApi("/admin/transactions?limit=6&page=1"),
  ]);
  const d = summary.data || {};
  const customer = d.customers || {};
  const accounts = d.accounts || {};
  const transactions = d.transactions || {};
  const transfers = d.transfers || {};
  app.innerHTML = shell(`
    <div class="page-head"><div><h1>Operations overview</h1><p>Live administrative view of customers, accounts, transfers and platform activity.</p></div><button class="btn btn-secondary" id="admin-refresh">${icons.refresh} Refresh</button></div>
    <div class="admin-metric-grid">
      <div class="admin-metric"><div class="admin-metric-icon">${icons.users}</div><span>Total customers</span><strong>${Number(customer.total || 0).toLocaleString()}</strong><small>${Number(customer.active || 0).toLocaleString()} active · ${Number(customer.blocked || 0).toLocaleString()} blocked</small></div>
      <div class="admin-metric"><div class="admin-metric-icon">${icons.account}</div><span>Bank accounts</span><strong>${Number(accounts.total || 0).toLocaleString()}</strong><small>${Number(accounts.active || 0).toLocaleString()} active · ${Number(accounts.blocked || 0).toLocaleString()} blocked</small></div>
      <div class="admin-metric"><div class="admin-metric-icon">${icons.list}</div><span>Transactions</span><strong>${Number(transactions.total || 0).toLocaleString()}</strong><small>${Number(transactions.successful || 0).toLocaleString()} successful · ${Number(transactions.failed || 0).toLocaleString()} failed</small></div>
      <div class="admin-metric"><div class="admin-metric-icon">₦</div><span>Successful transfer value</span><strong style="font-size:22px">${money(transfers.totalValue || 0)}</strong><small>${Number(transfers.successfulCount || 0).toLocaleString()} successful transfer debits</small></div>
    </div>
    <div class="admin-dashboard-grid">
      <section class="card table-card"><div class="table-toolbar"><div><h3 class="card-title">Recent transactions</h3><span class="muted small">Latest activity across customer accounts</span></div><a class="btn btn-secondary btn-sm" href="#/transactions">View all</a></div><div class="table-wrap"><table><thead><tr><th>Reference</th><th>Customer</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead><tbody>${(recent.data || []).map((tx) => `<tr><td><div class="admin-ref">${escapeHtml(tx.reference || "—")}</div></td><td><div class="admin-person"><strong>${escapeHtml(`${tx.customer?.firstName || ""} ${tx.customer?.lastName || ""}`.trim() || tx.account?.accountName || "—")}</strong><span>${escapeHtml(tx.account?.accountNumber || "")}</span></div></td><td class="${tx.direction === "CREDIT" ? "amount-credit" : "amount-debit"}">${money(tx.amount)}</td><td>${statusBadge(tx.status)}</td><td>${dateTime(tx.createdAt)}</td></tr>`).join("") || `<tr><td colspan="5"><div class="empty">No transactions found.</div></td></tr>`}</tbody></table></div></section>
      <section class="card card-pad"><h3 class="card-title">Today</h3><div class="admin-summary-list" style="margin-top:10px"><div class="admin-summary-row"><span>Successful transfers</span><strong>${Number(transfers.todayCount || 0).toLocaleString()}</strong></div><div class="admin-summary-row"><span>Transfer value</span><strong>${money(transfers.todayValue || 0)}</strong></div><div class="admin-summary-row"><span>Pending transactions</span><strong>${Number(transactions.pending || 0).toLocaleString()}</strong></div><div class="admin-summary-row"><span>Blocked accounts</span><strong>${Number(accounts.blocked || 0).toLocaleString()}</strong></div></div><a class="btn btn-primary full" href="#/blocked" style="margin-top:18px">Review blocked accounts</a></section>
    </div>`, "dashboard", "Admin dashboard");
  bindShell();
  document.getElementById("admin-refresh").addEventListener("click", () => routeApp());
}

async function customersPage(query = {}) {
  const params = new URLSearchParams({ page: query.page || 1, limit: 20 });
  if (query.search) params.set("search", query.search);
  if (query.status) params.set("status", query.status);
  const result = await adminApi(`/admin/customers?${params}`);
  app.innerHTML = shell(`
    <div class="page-head"><div><h1>Customers</h1><p>Search registered customers and review their linked bank accounts.</p></div></div>
    <section class="card table-card">
      <div class="table-toolbar"><form id="customer-filter" class="admin-toolbar"><input name="search" value="${escapeHtml(query.search || "")}" placeholder="Search name, email or phone"><select name="status"><option value="">All statuses</option><option value="ACTIVE" ${query.status === "ACTIVE" ? "selected" : ""}>Active</option><option value="BLOCKED" ${query.status === "BLOCKED" ? "selected" : ""}>Blocked</option><option value="CLOSED" ${query.status === "CLOSED" ? "selected" : ""}>Closed</option></select><button class="btn btn-secondary" type="submit">Search</button></form></div>
      <div class="table-wrap"><table><thead><tr><th>Customer</th><th>Contact</th><th>Account</th><th>Balance</th><th>Status</th><th>Joined</th><th>Action</th></tr></thead><tbody>${(result.data || []).map((c) => { const a = c.account || {}; const number = a.accountNumber || ""; return `<tr><td><div class="admin-person"><strong>${escapeHtml(`${c.firstName || ""} ${c.lastName || ""}`.trim())}</strong><span>${escapeHtml(c.kycType || "")}</span></div></td><td><div class="admin-person"><strong>${escapeHtml(c.email || "—")}</strong><span>${escapeHtml(c.phone || "")}</span></div></td><td><div class="admin-account-number">${escapeHtml(number || "—")}</div><span class="muted small">${escapeHtml(a.accountName || "")}</span></td><td>${number ? money(a.balance, a.currency || "NGN") : "—"}</td><td>${statusBadge(c.status)}</td><td>${dateTime(c.createdAt)}</td><td><div class="admin-table-actions">${number && a.status === "BLOCKED" ? `<button class="btn btn-secondary" data-unblock-account="${escapeHtml(number)}" data-name="${escapeHtml(a.accountName || "")}">Unblock</button>` : number && a.status === "ACTIVE" ? `<button class="btn btn-danger" data-block-account="${escapeHtml(number)}" data-name="${escapeHtml(a.accountName || "")}">Block</button>` : "—"}</div></td></tr>`; }).join("") || `<tr><td colspan="7"><div class="empty">No customers matched your filters.</div></td></tr>`}</tbody></table></div>
      ${paginationHtml(result.pagination, "customers")}
    </section>`, "customers", "Customers");
  bindShell(); bindAccountActions();
  document.getElementById("customer-filter").addEventListener("submit", (event) => { event.preventDefault(); const f = new FormData(event.currentTarget); customersPage({ page:1, search:f.get("search").trim(), status:f.get("status") }); });
  document.querySelectorAll("[data-page]").forEach((button) => button.addEventListener("click", () => customersPage({ ...query, page:Number(button.dataset.page) })));
}

async function accountsPage(query = {}) {
  const params = new URLSearchParams({ page: query.page || 1, limit: 20 });
  if (query.search) params.set("search", query.search);
  if (query.status) params.set("status", query.status);
  const result = await adminApi(`/admin/accounts?${params}`);
  app.innerHTML = shell(`
    <div class="page-head"><div><h1>Accounts</h1><p>Review balances, status and ownership. Block or reactivate accounts after review.</p></div></div>
    <section class="card table-card">
      <div class="admin-action-panel"><div><strong>Recover an existing NIBSS account</strong><p>Use this only when NIBSS created the account but local linking did not complete.</p></div><form id="reconcile-form" class="row wrap"><div class="field"><label>Onboarding ID</label><input name="onboardingId" placeholder="Enter onboarding ID" required></div><button class="btn btn-secondary" type="submit">Reconcile</button></form></div>
      <div class="table-toolbar"><form id="account-filter" class="admin-toolbar"><input name="search" value="${escapeHtml(query.search || "")}" placeholder="Search account number or name"><select name="status"><option value="">All statuses</option><option value="ACTIVE" ${query.status === "ACTIVE" ? "selected" : ""}>Active</option><option value="BLOCKED" ${query.status === "BLOCKED" ? "selected" : ""}>Blocked</option><option value="CLOSED" ${query.status === "CLOSED" ? "selected" : ""}>Closed</option></select><button class="btn btn-secondary" type="submit">Search</button></form></div>
      <div class="table-wrap"><table><thead><tr><th>Account</th><th>Customer</th><th>Bank</th><th>Balance</th><th>Status</th><th>Created</th><th>Action</th></tr></thead><tbody>${(result.data || []).map((a) => `<tr><td><div class="admin-person"><strong>${escapeHtml(a.accountName || "—")}</strong><span class="admin-account-number">${escapeHtml(a.accountNumber || "")}</span></div></td><td><div class="admin-person"><strong>${escapeHtml(`${a.customer?.firstName || ""} ${a.customer?.lastName || ""}`.trim() || "Not linked")}</strong><span>${escapeHtml(a.customer?.email || "")}</span></div></td><td><div class="admin-person"><strong>${escapeHtml(a.bankName || "OMA Bank")}</strong><span>${escapeHtml(a.bankCode || "")}</span></div></td><td>${money(a.balance, a.currency || "NGN")}</td><td>${statusBadge(a.status)}</td><td>${dateTime(a.createdAt)}</td><td><div class="admin-table-actions">${a.status === "BLOCKED" ? `<button class="btn btn-secondary" data-unblock-account="${escapeHtml(a.accountNumber)}" data-name="${escapeHtml(a.accountName || "")}">Unblock</button>` : a.status === "ACTIVE" ? `<button class="btn btn-danger" data-block-account="${escapeHtml(a.accountNumber)}" data-name="${escapeHtml(a.accountName || "")}">Block</button>` : "—"}</div></td></tr>`).join("") || `<tr><td colspan="7"><div class="empty">No accounts matched your filters.</div></td></tr>`}</tbody></table></div>
      ${paginationHtml(result.pagination, "accounts")}
    </section>`, "accounts", "Accounts");
  bindShell(); bindAccountActions();
  document.getElementById("account-filter").addEventListener("submit", (event) => { event.preventDefault(); const f = new FormData(event.currentTarget); accountsPage({ page:1, search:f.get("search").trim(), status:f.get("status") }); });
  document.getElementById("reconcile-form").addEventListener("submit", async (event) => { event.preventDefault(); const button=event.submitter; const onboardingId=new FormData(event.currentTarget).get("onboardingId").trim(); try { setButtonLoading(button,true,"Reconciling"); const r=await adminApi("/admin/accounts/reconcile",{method:"POST",body:JSON.stringify({onboardingId})}); toast(r.message || "Reconciliation completed."); event.currentTarget.reset(); await accountsPage(query); } catch(error){ toast(error.message,"error"); } finally { setButtonLoading(button,false); } });
  document.querySelectorAll("[data-page]").forEach((button) => button.addEventListener("click", () => accountsPage({ ...query, page:Number(button.dataset.page) })));
}

async function blockedPage() {
  const result = await adminApi("/admin/blocked-accounts");
  app.innerHTML = shell(`
    <div class="page-head"><div><h1>Blocked accounts</h1><p>Review why accounts were blocked and reactivate them after verification.</p></div><button class="btn btn-secondary" id="refresh-blocked">${icons.refresh} Refresh</button></div>
    <section class="card table-card"><div class="table-wrap"><table><thead><tr><th>Account</th><th>Customer</th><th>Reason</th><th>Blocked by</th><th>Blocked</th><th>Action</th></tr></thead><tbody>${(result.data || []).map((a) => `<tr><td><div class="admin-person"><strong>${escapeHtml(a.accountName || "—")}</strong><span class="admin-account-number">${escapeHtml(a.accountNumber || "")}</span></div></td><td><div class="admin-person"><strong>${escapeHtml(`${a.customer?.firstName || ""} ${a.customer?.lastName || ""}`.trim() || "—")}</strong><span>${escapeHtml(a.customer?.email || "")}</span></div></td><td class="admin-reason">${escapeHtml(a.blockReason || a.customer?.blockReason || "No reason recorded")}</td><td>${escapeHtml(a.blockedBy || a.customer?.blockedBy || "—")}</td><td>${dateTime(a.blockedAt || a.customer?.blockedAt)}</td><td><button class="btn btn-secondary btn-sm" data-unblock-account="${escapeHtml(a.accountNumber)}" data-name="${escapeHtml(a.accountName || "")}">Unblock</button></td></tr>`).join("") || `<tr><td colspan="6"><div class="empty">There are no blocked accounts.</div></td></tr>`}</tbody></table></div></section>`, "blocked", "Blocked accounts");
  bindShell(); bindAccountActions();
  document.getElementById("refresh-blocked").addEventListener("click", () => blockedPage());
}

async function transactionsPage(query = {}) {
  const params = new URLSearchParams({ page: query.page || 1, limit: 20 });
  if (query.status) params.set("status", query.status);
  if (query.direction) params.set("direction", query.direction);
  if (query.reference) params.set("reference", query.reference);
  const result = await adminApi(`/admin/transactions?${params}`);
  app.innerHTML = shell(`
    <div class="page-head"><div><h1>Transactions</h1><p>Inspect transfers, credits, debits and their processing status.</p></div></div>
    <section class="card table-card"><div class="table-toolbar"><form id="transaction-filter" class="admin-toolbar"><input name="reference" value="${escapeHtml(query.reference || "")}" placeholder="Reference / NIBSS reference"><select name="status"><option value="">All statuses</option><option value="SUCCESS" ${query.status === "SUCCESS" ? "selected" : ""}>Success</option><option value="PENDING" ${query.status === "PENDING" ? "selected" : ""}>Pending</option><option value="FAILED" ${query.status === "FAILED" ? "selected" : ""}>Failed</option></select><select name="direction"><option value="">All directions</option><option value="DEBIT" ${query.direction === "DEBIT" ? "selected" : ""}>Debit</option><option value="CREDIT" ${query.direction === "CREDIT" ? "selected" : ""}>Credit</option></select><button class="btn btn-secondary" type="submit">Filter</button></form></div><div class="table-wrap"><table><thead><tr><th>Reference</th><th>Customer / Account</th><th>Description</th><th>Amount</th><th>Direction</th><th>Status</th><th>Date</th></tr></thead><tbody>${(result.data || []).map((tx) => `<tr><td><div class="admin-ref">${escapeHtml(tx.reference || "—")}</div>${tx.nibssReference ? `<div class="admin-ref" style="margin-top:4px">NIBSS: ${escapeHtml(tx.nibssReference)}</div>` : ""}</td><td><div class="admin-person"><strong>${escapeHtml(`${tx.customer?.firstName || ""} ${tx.customer?.lastName || ""}`.trim() || tx.account?.accountName || "—")}</strong><span>${escapeHtml(tx.account?.accountNumber || "")}</span></div></td><td class="admin-description">${escapeHtml(tx.description || "—")}</td><td class="${tx.direction === "CREDIT" ? "amount-credit" : "amount-debit"}">${money(tx.amount)}</td><td>${escapeHtml(tx.direction || "—")}</td><td>${statusBadge(tx.status)}</td><td>${dateTime(tx.createdAt)}</td></tr>`).join("") || `<tr><td colspan="7"><div class="empty">No transactions matched your filters.</div></td></tr>`}</tbody></table></div>${paginationHtml(result.pagination, "transactions")}</section>`, "transactions", "Transactions");
  bindShell();
  document.getElementById("transaction-filter").addEventListener("submit", (event) => { event.preventDefault(); const f=new FormData(event.currentTarget); transactionsPage({ page:1, reference:f.get("reference").trim(), status:f.get("status"), direction:f.get("direction") }); });
  document.querySelectorAll("[data-page]").forEach((button) => button.addEventListener("click", () => transactionsPage({ ...query, page:Number(button.dataset.page) })));
}

async function auditPage(query = {}) {
  const params = new URLSearchParams({ page: query.page || 1, limit: 30 });
  if (query.action) params.set("action", query.action);
  if (query.status) params.set("status", query.status);
  const result = await adminApi(`/admin/audit-logs?${params}`);
  app.innerHTML = shell(`
    <div class="page-head"><div><h1>Audit logs</h1><p>Review security-sensitive actions recorded by the backend.</p></div></div>
    <section class="card table-card"><div class="table-toolbar"><form id="audit-filter" class="admin-toolbar"><input name="action" value="${escapeHtml(query.action || "")}" placeholder="Action e.g. ACCOUNT_BLOCK"><select name="status"><option value="">All statuses</option><option value="SUCCESS" ${query.status === "SUCCESS" ? "selected" : ""}>Success</option><option value="FAILED" ${query.status === "FAILED" ? "selected" : ""}>Failed</option></select><button class="btn btn-secondary" type="submit">Filter</button></form></div><div class="table-wrap"><table><thead><tr><th>Action</th><th>Customer / Account</th><th>Message</th><th>Request</th><th>Status</th><th>Date</th></tr></thead><tbody>${(result.data || []).map((log) => `<tr><td><strong>${escapeHtml(log.action || "—")}</strong></td><td><div class="admin-person"><strong>${escapeHtml(`${log.customer?.firstName || ""} ${log.customer?.lastName || ""}`.trim() || log.account?.accountName || "System")}</strong><span>${escapeHtml(log.customer?.email || log.account?.accountNumber || "")}</span></div></td><td class="admin-description">${escapeHtml(log.message || "—")}</td><td><div class="admin-person"><strong>${escapeHtml(log.method || "—")}</strong><span>${escapeHtml(log.path || "")}</span></div></td><td>${statusBadge(log.status)}</td><td>${dateTime(log.createdAt)}</td></tr>`).join("") || `<tr><td colspan="6"><div class="empty">No audit logs matched your filters.</div></td></tr>`}</tbody></table></div>${paginationHtml(result.pagination, "logs")}</section>`, "audit", "Audit logs");
  bindShell();
  document.getElementById("audit-filter").addEventListener("submit", (event) => { event.preventDefault(); const f=new FormData(event.currentTarget); auditPage({ page:1, action:f.get("action").trim(), status:f.get("status") }); });
  document.querySelectorAll("[data-page]").forEach((button) => button.addEventListener("click", () => auditPage({ ...query, page:Number(button.dataset.page) })));
}

function notFoundPage() {
  app.innerHTML = state.key ? shell(`<div class="empty"><div class="empty-icon">?</div><h2>Admin page not found</h2><a class="btn btn-primary" href="#/dashboard">Back to dashboard</a></div>`) : loginLayout(`<div class="admin-login-card"><h2>Page not found</h2><p>The requested admin page does not exist.</p><a class="btn btn-primary" href="#/login">Admin sign in</a></div>`);
  if (state.key) bindShell();
}

async function routeApp() {
  const route = currentRoute();
  if (!state.key && route !== "login") return navigate("login");
  if (state.key && route === "login") return navigate("dashboard");
  window.scrollTo(0,0);
  try {
    switch (route) {
      case "login": return loginPage();
      case "dashboard": return await dashboardPage();
      case "customers": return await customersPage();
      case "accounts": return await accountsPage();
      case "blocked": return await blockedPage();
      case "transactions": return await transactionsPage();
      case "audit": return await auditPage();
      default: return notFoundPage();
    }
  } catch (error) {
    console.error(error);
    toast(error.message || "Something went wrong.", "error");
    if (!state.key) loginPage();
  }
}

applyTheme(getTheme());
document.addEventListener("click", (event) => {
  const toggle = event.target.closest?.("[data-theme-toggle]");
  if (!toggle) return;
  applyTheme((document.documentElement.dataset.theme || "light") === "dark" ? "light" : "dark");
});

const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      enhanceSecrets(node);
      if (node.matches?.("[data-theme-toggle]") || node.querySelector?.("[data-theme-toggle]")) applyTheme(document.documentElement.dataset.theme || getTheme());
    }
  }
});
observer.observe(document.body, { childList:true, subtree:true });

window.addEventListener("hashchange", routeApp);
window.addEventListener("DOMContentLoaded", () => {
  if (!location.hash) return navigate(state.key ? "dashboard" : "login");
  routeApp();
});
