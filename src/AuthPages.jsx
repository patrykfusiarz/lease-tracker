import { useState } from "react";
import { useAuth } from "./auth";

const authCss = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body { background: #eceef2; }

  .auth-root {
    min-height: 100vh;
    background: #eceef2;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    position: relative;
  }

  /* ── Top nav ── */
  .auth-nav {
    position: fixed;
    top: 0; left: 0; right: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 24px;
    z-index: 10;
  }

  .auth-nav-logo {
    width: 32px; height: 32px;
    border-radius: 50%;
    border: 1.5px solid #c8cad0;
    display: flex; align-items: center; justify-content: center;
    background: transparent;
  }

  .auth-nav-right {
    font-size: 13px;
    color: #1a1a2e;
    letter-spacing: -0.1px;
    display: flex; align-items: center; gap: 3px;
    cursor: pointer;
    background: none; border: none;
    font-family: inherit;
  }

  /* ── Two-panel card ── */
  .auth-card-wrap {
    display: flex;
    background: #fff;
    border-radius: 10px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.08), 0 0 1px rgba(0,0,0,0.06);
    overflow: hidden;
    width: 740px;
    min-height: 340px;
    animation: cardIn 0.3s cubic-bezier(0.16,1,0.3,1) both;
  }

  /* ── Left: form panel ── */
  .auth-left {
    flex: 1;
    padding: 36px 40px 40px;
    display: flex;
    flex-direction: column;
    border-right: 1px solid #eceef2;
  }

  .auth-heading {
    font-size: 18px;
    font-weight: 500;
    color: #0f0f1a;
    letter-spacing: -0.3px;
    margin-bottom: 20px;
  }

  .auth-field {
    margin-bottom: 14px;
  }

  .auth-field-label {
    font-size: 12px;
    font-weight: 400;
    color: #5a5c6e;
    margin-bottom: 5px;
    display: block;
    letter-spacing: -0.1px;
  }

  .auth-field-wrap {
    position: relative;
  }

  .auth-input {
    width: 100%;
    height: 34px;
    background: #fff;
    border: 1px solid #dddfe6;
    border-radius: 6px;
    padding: 0 11px;
    font-size: 13px;
    font-family: inherit;
    color: #0f0f1a;
    outline: none;
    transition: border-color 0.15s, box-shadow 0.15s;
    -webkit-appearance: none;
  }

  .auth-input::placeholder { color: #c0c2cc; }

  .auth-input:focus {
    border-color: #a0a4cc;
    box-shadow: 0 0 0 3px rgba(140,144,204,0.15);
  }

  .auth-eye {
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    cursor: pointer;
    color: #a0a2b0;
    display: flex;
    align-items: center;
    padding: 3px;
    transition: color 0.15s;
  }
  .auth-eye:hover { color: #5a5c6e; }

  .auth-forgot {
    display: block;
    font-size: 12px;
    color: #8a8ca0;
    background: none;
    border: none;
    cursor: pointer;
    font-family: inherit;
    padding: 0;
    margin-top: 5px;
    margin-bottom: 16px;
    text-align: left;
    transition: color 0.15s;
  }
  .auth-forgot:hover { color: #5a5c6e; }

  /* Log in button — pill, muted periwinkle, not full width */
  .auth-btn-primary {
    height: 34px;
    background: #8c90cc;
    color: #fff;
    border: none;
    border-radius: 20px;
    font-size: 13px;
    font-family: inherit;
    font-weight: 500;
    cursor: pointer;
    padding: 0 22px;
    transition: background 0.15s, transform 0.08s, opacity 0.15s;
    display: inline-flex;
    align-items: center;
    margin-bottom: 20px;
  }
  .auth-btn-primary:hover    { background: #7b80bc; }
  .auth-btn-primary:active   { transform: scale(0.98); }
  .auth-btn-primary:disabled { opacity: 0.45; cursor: not-allowed; }

  /* Secondary button — "Continue with passkey" style */
  .auth-btn-secondary {
    height: 34px;
    background: #fff;
    color: #3a3c50;
    border: 1px solid #dddfe6;
    border-radius: 20px;
    font-size: 13px;
    font-family: inherit;
    font-weight: 400;
    cursor: pointer;
    padding: 0 18px;
    transition: background 0.15s, border-color 0.15s;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    margin-bottom: 14px;
  }
  .auth-btn-secondary:hover { background: #f5f6f8; border-color: #c8cad0; }

  .auth-passkey-note {
    font-size: 11.5px;
    color: #9a9cac;
    line-height: 1.6;
    max-width: 240px;
  }

  .auth-passkey-note a {
    color: #6a6cb0;
    text-decoration: underline;
    cursor: pointer;
  }

  /* ── Right: info panel ── */
  .auth-right {
    width: 220px;
    flex-shrink: 0;
    background: #f2f4f0;
    padding: 28px 24px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .auth-right-heading {
    font-size: 14px;
    font-weight: 500;
    color: #1a1a2e;
    letter-spacing: -0.2px;
    margin-bottom: 4px;
  }

  .auth-right-body {
    font-size: 12px;
    color: #6a6c7e;
    line-height: 1.65;
  }

  .auth-right-card {
    background: #fff;
    border: 1px solid #e2e4e0;
    border-radius: 8px;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .auth-right-stat {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .auth-right-stat-num {
    font-size: 18px;
    font-weight: 500;
    color: #1a1a2e;
    letter-spacing: -0.5px;
  }

  .auth-right-stat-lbl {
    font-size: 11px;
    color: #9a9cac;
  }

  .auth-right-divider {
    height: 1px;
    background: #e8eae6;
  }

  /* gradient preview card */
  .auth-preview {
    border-radius: 8px;
    height: 130px;
    background: linear-gradient(135deg, #c8b4d8 0%, #a8b4d0 40%, #b0c4c8 70%, #d4c0cc 100%);
    position: relative;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .auth-preview::before {
    content: "";
    position: absolute;
    inset: 0;
    background: url("data:image/svg+xml,%3Csvg width='200' height='130' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 65 Q50 20 100 65 T200 65' stroke='rgba(255,255,255,0.3)' stroke-width='1' fill='none'/%3E%3Cpath d='M0 75 Q50 30 100 75 T200 75' stroke='rgba(255,255,255,0.2)' stroke-width='1' fill='none'/%3E%3Cpath d='M0 55 Q50 10 100 55 T200 55' stroke='rgba(255,255,255,0.2)' stroke-width='1' fill='none'/%3E%3C/svg%3E") center/cover;
  }

  /* error / timeout */
  .auth-error {
    background: #fff5f5;
    border: 1px solid #ffd0d0;
    border-radius: 6px;
    padding: 8px 11px;
    font-size: 12px;
    color: #c0302a;
    margin-bottom: 14px;
    line-height: 1.5;
  }

  .auth-timeout {
    background: #f0f2ff;
    border: 1px solid #d0d4f0;
    border-radius: 6px;
    padding: 8px 11px;
    font-size: 12px;
    color: #5058a0;
    margin-bottom: 14px;
    line-height: 1.5;
  }

  /* remember me */
  .auth-remember {
    display: flex; align-items: center;
    gap: 7px; font-size: 12px;
    color: #6a6c7e; cursor: pointer;
    user-select: none; margin-bottom: 16px;
  }
  .auth-remember input[type="checkbox"] {
    width: 13px; height: 13px;
    accent-color: #8c90cc;
    cursor: pointer; margin: 0;
  }

  /* password strength */
  .auth-strength-bars { display: flex; gap: 3px; margin-top: 5px; }
  .auth-bar { flex: 1; height: 2px; border-radius: 2px; background: #eee; transition: background 0.2s; }
  .auth-bar.weak   { background: #f87171; }
  .auth-bar.medium { background: #fbbf24; }
  .auth-bar.strong { background: #34d399; }

  /* switch link */
  .auth-switch { font-size: 12px; color: #9a9cac; margin-top: 8px; }
  .auth-switch button {
    background: none; border: none;
    color: #7070b8; font-size: 12px;
    font-family: inherit; font-weight: 500;
    cursor: pointer; padding: 0;
    transition: color 0.15s;
  }
  .auth-switch button:hover { color: #5050a0; }

  @keyframes cardIn {
    from { opacity: 0; transform: translateY(10px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  @media (max-width: 780px) {
    .auth-card-wrap { width: 100%; min-height: 100vh; border-radius: 0; flex-direction: column; }
    .auth-right { width: 100%; }
  }
`;

function EyeIcon({ open }) {
  return open ? (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
    </svg>
  ) : (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  );
}

function passwordStrength(pw) {
  if (!pw) return 0;
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(3, Math.ceil(s / 1.5));
}

function RightPanel() {
  return (
    <div className="auth-right">
      <div>
        <div className="auth-right-heading">Track your leases</div>
        <div className="auth-right-body">
          Monitor every maturity, incentive, and mileage milestone in one place.
        </div>
      </div>
      <div className="auth-right-card">
        <div className="auth-right-stat">
          <span className="auth-right-stat-num">100%</span>
          <span className="auth-right-stat-lbl">Data retained</span>
        </div>
        <div className="auth-right-divider" />
        <div className="auth-right-stat">
          <span className="auth-right-stat-num">1-click</span>
          <span className="auth-right-stat-lbl">DMS import</span>
        </div>
      </div>
      <div className="auth-preview" />
    </div>
  );
}

export function AuthPage() {
  const { signIn, signUp, timedOut } = useAuth();
  const [rememberMe,   setRememberMe]   = useState(false);
  const [view,         setView]         = useState("signin");
  const [name,         setName]         = useState("");
  const [email,        setEmail]        = useState("");
  const [password,     setPassword]     = useState("");
  const [confirm,      setConfirm]      = useState("");
  const [showPw,       setShowPw]       = useState(false);
  const [error,        setError]        = useState("");
  const [loading,      setLoading]      = useState(false);

  const strength      = passwordStrength(password);
  const strengthClass = ["","weak","medium","strong"][strength];

  const switchView = (v) => {
    setView(v); setError("");
    setName(""); setEmail(""); setPassword(""); setConfirm("");
  };

  const handleSignIn = async (e) => {
    e.preventDefault(); setError("");
    if (!email || !password) return;
    setLoading(true);
    const r = await signIn(email.trim().toLowerCase(), password, rememberMe);
    setLoading(false);
    if (r.error) setError(r.error);
  };

  const handleSignUp = async (e) => {
    e.preventDefault(); setError("");
    if (!name.trim())        return setError("Please enter your full name");
    if (!email.trim())       return setError("Please enter your email");
    if (password.length < 6) return setError("Password must be at least 6 characters");
    if (password !== confirm) return setError("Passwords do not match");
    setLoading(true);
    const r = await signUp(email.trim().toLowerCase(), password, name.trim());
    setLoading(false);
    if (r.error) setError(r.error);
  };

  return (
    <>
      <style>{authCss}</style>
      <div className="auth-root">

        {/* Nav */}
        <nav className="auth-nav">
          <div className="auth-nav-logo">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
          </div>
          <button className="auth-nav-right" onClick={() => switchView(view === "signin" ? "signup" : "signin")}>
            {view === "signin" ? "Create Account" : "Sign In"} &rsaquo;
          </button>
        </nav>

        {/* Card */}
        <div className="auth-card-wrap">

          {/* Left — form */}
          <div className="auth-left">
            <div className="auth-heading">{view === "signin" ? "Log in" : "Create account"}</div>

            {timedOut && <div className="auth-timeout">🔒 Signed out after 20 min of inactivity.</div>}
            {error    && <div className="auth-error">{error}</div>}

            {view === "signin" ? (
              <form onSubmit={handleSignIn}>
                <div className="auth-field">
                  <label className="auth-field-label">Email</label>
                  <input className="auth-input" type="email" value={email}
                    onChange={e => setEmail(e.target.value)} autoFocus autoComplete="email" />
                </div>

                <div className="auth-field">
                  <label className="auth-field-label">Password</label>
                  <div className="auth-field-wrap">
                    <input className="auth-input" type={showPw ? "text" : "password"}
                      value={password} onChange={e => setPassword(e.target.value)}
                      autoComplete="current-password" style={{ paddingRight: 32 }} />
                    <button type="button" className="auth-eye" onClick={() => setShowPw(v => !v)}>
                      <EyeIcon open={showPw} />
                    </button>
                  </div>
                  <button type="button" className="auth-forgot">Forgot password?</button>
                </div>

                <label className="auth-remember">
                  <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} />
                  Remember me
                </label>

                <button className="auth-btn-primary" type="submit" disabled={loading || !email || !password}>
                  {loading ? "Signing in…" : "Log in"}
                </button>

                <div style={{ height: 1, background: "#eceef2", margin: "4px 0 16px" }} />

                <button type="button" className="auth-btn-secondary">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
                  </svg>
                  Continue with passkey
                </button>
                <div className="auth-passkey-note">
                  Log in securely using one click, your face, or your fingerprint.
                </div>

                <div className="auth-switch" style={{ marginTop: 16 }}>
                  Don't have an account? <button onClick={() => switchView("signup")}>Sign up</button>
                </div>
              </form>

            ) : (
              <form onSubmit={handleSignUp}>
                <div className="auth-field">
                  <label className="auth-field-label">Full Name</label>
                  <input className="auth-input" type="text" value={name}
                    onChange={e => setName(e.target.value)} autoFocus autoComplete="name" />
                </div>
                <div className="auth-field">
                  <label className="auth-field-label">Email</label>
                  <input className="auth-input" type="email" value={email}
                    onChange={e => setEmail(e.target.value)} autoComplete="email" />
                </div>
                <div className="auth-field">
                  <label className="auth-field-label">Password</label>
                  <div className="auth-field-wrap">
                    <input className="auth-input" type={showPw ? "text" : "password"}
                      value={password} onChange={e => setPassword(e.target.value)}
                      autoComplete="new-password" style={{ paddingRight: 32 }} />
                    <button type="button" className="auth-eye" onClick={() => setShowPw(v => !v)}>
                      <EyeIcon open={showPw} />
                    </button>
                  </div>
                  {password && (
                    <div className="auth-strength-bars">
                      {[1,2,3].map(i => <div key={i} className={`auth-bar ${i <= strength ? strengthClass : ""}`} />)}
                    </div>
                  )}
                </div>
                <div className="auth-field" style={{ marginBottom: 20 }}>
                  <label className="auth-field-label">Confirm Password</label>
                  <input className="auth-input" type="password" value={confirm}
                    onChange={e => setConfirm(e.target.value)} autoComplete="new-password" />
                </div>

                <button className="auth-btn-primary" type="submit"
                  disabled={loading || !name || !email || !password || !confirm}>
                  {loading ? "Creating…" : "Create Account"}
                </button>

                <div className="auth-switch" style={{ marginTop: 16 }}>
                  Already have an account? <button onClick={() => switchView("signin")}>Log in</button>
                </div>
              </form>
            )}
          </div>

          {/* Right — info */}
          <RightPanel />
        </div>

      </div>
    </>
  );
}
