import { useState } from "react";
import { useAuth } from "./auth";

const authCss = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;1,9..40,300&family=DM+Mono:wght@400;500&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg:        #0d1018;
    --bg-panel:  #111520;
    --border:    #1c2235;
    --accent:    #3b6fd4;
    --accent-hi: #4d83f0;
    --text-1:    #e8ecf8;
    --text-2:    #5a6a8a;
    --text-3:    #2e3a52;
    --input-bg:  #0d1220;
  }

  .auth-root {
    min-height: 100vh;
    background: var(--bg);
    display: flex;
    align-items: stretch;
    font-family: 'DM Sans', sans-serif;
    overflow: hidden;
  }

  .auth-left {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 48px 56px;
    position: relative;
    overflow: hidden;
    border-right: 1px solid var(--border);
  }

  .auth-left::before {
    content: "";
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(var(--border) 1px, transparent 1px),
      linear-gradient(90deg, var(--border) 1px, transparent 1px);
    background-size: 48px 48px;
    opacity: 0.35;
    pointer-events: none;
    z-index: 0;
  }

  .auth-orb1 {
    position: absolute;
    width: 600px;
    height: 600px;
    border-radius: 50%;
    background: radial-gradient(circle at center, rgba(59,111,212,0.22) 0%, rgba(59,111,212,0.08) 40%, transparent 70%);
    top: 10%;
    left: -5%;
    pointer-events: none;
    z-index: 1;
    animation: authDrift1 10s ease-in-out infinite;
  }

  .auth-orb2 {
    position: absolute;
    width: 340px;
    height: 340px;
    border-radius: 50%;
    background: radial-gradient(circle at center, rgba(100,160,255,0.15) 0%, rgba(80,130,240,0.05) 50%, transparent 70%);
    top: 45%;
    left: 35%;
    pointer-events: none;
    z-index: 1;
    animation: authDrift2 7s ease-in-out infinite;
    animation-delay: -3s;
  }

  .auth-orb3 {
    position: absolute;
    width: 200px;
    height: 200px;
    border-radius: 50%;
    background: radial-gradient(circle at center, rgba(130,180,255,0.12) 0%, transparent 70%);
    top: 65%;
    left: 10%;
    pointer-events: none;
    z-index: 1;
    animation: authDrift3 13s ease-in-out infinite;
    animation-delay: -6s;
  }

  @keyframes authDrift1 {
    0%   { transform: translate(0px,   0px)   scale(1);    }
    25%  { transform: translate(30px, -25px)  scale(1.06); }
    50%  { transform: translate(10px,  30px)  scale(0.96); }
    75%  { transform: translate(-20px, 10px)  scale(1.03); }
    100% { transform: translate(0px,   0px)   scale(1);    }
  }

  @keyframes authDrift2 {
    0%   { transform: translate(0px,   0px)   scale(1);    }
    30%  { transform: translate(-25px, 20px)  scale(1.08); }
    60%  { transform: translate(20px, -15px)  scale(0.94); }
    100% { transform: translate(0px,   0px)   scale(1);    }
  }

  @keyframes authDrift3 {
    0%   { transform: translate(0px,  0px)   scale(1);   }
    40%  { transform: translate(18px, 22px)  scale(1.1); }
    70%  { transform: translate(-10px,-18px) scale(0.9); }
    100% { transform: translate(0px,  0px)   scale(1);   }
  }

  .auth-left-content {
    position: relative;
    z-index: 2;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    height: 100%;
  }

  .auth-brand-name {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-1);
    animation: authFadeUp 0.6s cubic-bezier(0.16,1,0.3,1) both;
  }

  .auth-hero { animation: authFadeUp 0.6s 0.08s cubic-bezier(0.16,1,0.3,1) both; }

  .auth-hero-label {
    font-family: 'DM Mono', monospace;
    font-size: 10px;
    color: var(--accent);
    letter-spacing: 2.5px;
    text-transform: uppercase;
    margin-bottom: 18px;
    opacity: 0.75;
  }

  .auth-hero-title {
    font-size: clamp(30px, 2.8vw, 42px);
    font-weight: 300;
    color: var(--text-1);
    letter-spacing: -1.5px;
    line-height: 1.18;
    margin-bottom: 20px;
  }

  .auth-hero-title strong { font-weight: 500; color: #fff; }

  .auth-hero-sub {
    font-size: 14px;
    color: var(--text-2);
    line-height: 1.75;
    max-width: 320px;
    font-weight: 300;
  }

  .auth-stats {
    display: flex;
    gap: 36px;
    animation: authFadeUp 0.6s 0.18s cubic-bezier(0.16,1,0.3,1) both;
  }

  .auth-stat { display: flex; flex-direction: column; gap: 4px; }

  .auth-stat-num {
    font-family: 'DM Mono', monospace;
    font-size: 22px;
    font-weight: 500;
    color: var(--text-1);
    letter-spacing: -0.5px;
  }

  .auth-stat-lbl { font-size: 11px; color: var(--text-2); font-weight: 300; }

  /* Right panel */
  .auth-right {
    width: 420px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    background: var(--bg-panel);
    position: relative;
    overflow: hidden;
  }

  .auth-form-panel {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 56px 48px;
    transition: opacity 0.22s ease, transform 0.22s cubic-bezier(0.16,1,0.3,1);
    overflow-y: auto;
  }

  .auth-form-panel.hidden {
    opacity: 0;
    transform: translateY(10px);
    pointer-events: none;
  }

  .auth-form-heading {
    font-size: 23px;
    font-weight: 400;
    color: var(--text-1);
    letter-spacing: -0.7px;
    margin-bottom: 6px;
  }

  .auth-form-sub {
    font-size: 13px;
    color: var(--text-2);
    margin-bottom: 32px;
    font-weight: 300;
  }

  .auth-field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }

  .auth-field label {
    font-family: 'DM Mono', monospace;
    font-size: 9px;
    color: var(--text-2);
    letter-spacing: 1.8px;
    text-transform: uppercase;
  }

  .auth-field input {
    background: var(--input-bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0 14px;
    height: 42px;
    font-size: 13.5px;
    font-family: 'DM Sans', sans-serif;
    color: var(--text-1);
    outline: none;
    transition: border-color 0.15s, box-shadow 0.15s;
    width: 100%;
  }

  .auth-field input:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px rgba(59,111,212,0.12);
  }

  .auth-field input::placeholder { color: var(--text-3); }

  .auth-strength-bars { display: flex; gap: 4px; margin-top: 6px; }
  .auth-bar { flex: 1; height: 2px; border-radius: 2px; background: var(--border); transition: background 0.2s; }
  .auth-bar.weak   { background: #7a2a2a; }
  .auth-bar.medium { background: #7a5a1a; }
  .auth-bar.strong { background: #2a6a4a; }

  .auth-error {
    background: #1a0e0e;
    border: 1px solid #3a1a1a;
    border-radius: 7px;
    padding: 10px 12px;
    font-size: 12px;
    color: #f0a0a0;
    margin-bottom: 14px;
    line-height: 1.5;
  }

  .auth-submit-btn {
    width: 100%;
    height: 42px;
    background: var(--accent);
    color: #fff;
    border: none;
    border-radius: 8px;
    font-size: 13.5px;
    font-family: 'DM Sans', sans-serif;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s, transform 0.1s;
    margin-top: 8px;
  }

  .auth-submit-btn:hover    { background: var(--accent-hi); }
  .auth-submit-btn:active   { transform: scale(0.99); }
  .auth-submit-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .auth-divider { display: flex; align-items: center; gap: 12px; margin: 22px 0; }
  .auth-divider-line { flex: 1; height: 1px; background: var(--border); }
  .auth-divider-text { font-size: 11px; color: var(--text-2); white-space: nowrap; font-weight: 300; }

  .auth-switch { font-size: 13px; color: var(--text-2); text-align: center; font-weight: 300; }

  .auth-switch button {
    background: none;
    border: none;
    color: var(--accent-hi);
    font-size: 13px;
    font-family: 'DM Sans', sans-serif;
    font-weight: 500;
    cursor: pointer;
    padding: 0;
    transition: color 0.1s;
  }

  .auth-switch button:hover { color: #6b9af8; }

  @keyframes authFadeUp {
    from { opacity: 0; transform: translateY(10px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  @media (max-width: 768px) {
    .auth-left { display: none; }
    .auth-right { width: 100%; min-height: 100vh; }
    .auth-form-panel { position: relative; inset: auto; }
    .auth-form-panel.hidden { display: none; opacity: 1; transform: none; }
  }
`;

function passwordStrength(pw) {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return Math.min(3, Math.ceil(score / 1.5));
}

const LeftPanel = () => (
  <div className="auth-left">
    <div className="auth-orb1" />
    <div className="auth-orb2" />
    <div className="auth-orb3" />
    <div className="auth-left-content">
      <div className="auth-brand-name">Lease Tracker</div>
      <div className="auth-hero">
        <div className="auth-hero-label">Maturity Management</div>
        <h1 className="auth-hero-title">
          Stay ahead of<br />every <strong>lease maturity</strong>
        </h1>
        <p className="auth-hero-sub">
          Track incentives, monitor mileage pace, and manage every customer's lease in one place.
        </p>
      </div>
      <div className="auth-stats">
        <div className="auth-stat">
          <span className="auth-stat-num">100%</span>
          <span className="auth-stat-lbl">Data retained</span>
        </div>
        <div className="auth-stat">
          <span className="auth-stat-num">∞</span>
          <span className="auth-stat-lbl">Customers</span>
        </div>
        <div className="auth-stat">
          <span className="auth-stat-num">1</span>
          <span className="auth-stat-lbl">Click to access</span>
        </div>
      </div>
    </div>
  </div>
);

export function AuthPage() {
  const { signIn, signUp, timedOut } = useAuth();
  const [rememberMe, setRememberMe] = useState(false);
  const [view,      setView]      = useState("signin");
  const [name,      setName]      = useState("");
  const [email,     setEmail]     = useState("");
  const [password,  setPassword]  = useState("");
  const [confirm,   setConfirm]   = useState("");
  const [error,     setError]     = useState("");
  const [loading,   setLoading]   = useState(false);

  const strength = passwordStrength(password);
  const strengthClass = ["", "weak", "medium", "strong"][strength];

  const switchView = (v) => {
    setView(v);
    setError("");
    setName(""); setEmail(""); setPassword(""); setConfirm("");
  };

  const handleSignIn = async (e) => {
    e.preventDefault();
    setError("");
    if (!email || !password) return;
    setLoading(true);
    const result = await signIn(email.trim().toLowerCase(), password, rememberMe);
    setLoading(false);
    if (result.error) setError(result.error);
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    setError("");
    if (!name.trim())  return setError("Please enter your full name");
    if (!email.trim()) return setError("Please enter your email");
    if (password.length < 6) return setError("Password must be at least 6 characters");
    if (password !== confirm) return setError("Passwords do not match");
    setLoading(true);
    const result = await signUp(email.trim().toLowerCase(), password, name.trim());
    setLoading(false);
    if (result.error) setError(result.error);
  };

  return (
    <>
      <style>{authCss}</style>
      <div className="auth-root">
        <LeftPanel />
        <div className="auth-right">

          {/* Sign In */}
          <div className={`auth-form-panel ${view !== "signin" ? "hidden" : ""}`}>
            {timedOut && (
              <div style={{ marginBottom:20, padding:"10px 14px", borderRadius:8, background:"#141820", border:"1px solid #2a3550", fontSize:12, color:"#8ab4f8", lineHeight:1.6 }}>
                🔒 You were signed out after 20 minutes of inactivity.
              </div>
            )}
            <div className="auth-form-heading">Welcome back</div>
            <div className="auth-form-sub">Sign in to your account</div>
            {error && view === "signin" && <div className="auth-error">{error}</div>}
            <form onSubmit={handleSignIn}>
              <div className="auth-field">
                <label>Email</label>
                <input type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} autoFocus autoComplete="email" />
              </div>
              <div className="auth-field">
                <label>Password</label>
                <input type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" />
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:8, margin:"4px 0 2px" }}>
                <input
                  type="checkbox"
                  id="rememberMe"
                  checked={rememberMe}
                  onChange={e => setRememberMe(e.target.checked)}
                  style={{ width:13, height:13, accentColor:"#3b6fd4", cursor:"pointer" }}
                />
                <label htmlFor="rememberMe" style={{ fontSize:12, color:"var(--text-2)", cursor:"pointer", userSelect:"none", fontFamily:"'DM Sans', sans-serif" }}>
                  Remember me
                </label>
              </div>
              <button className="auth-submit-btn" type="submit" disabled={loading || !email || !password}>
                {loading ? "Signing in…" : "Sign In"}
              </button>
            </form>
            <div className="auth-divider">
              <div className="auth-divider-line" />
              <span className="auth-divider-text">no account yet?</span>
              <div className="auth-divider-line" />
            </div>
            <div className="auth-switch">
              <button onClick={() => switchView("signup")}>Create an account</button>
            </div>
          </div>

          {/* Sign Up */}
          <div className={`auth-form-panel ${view !== "signup" ? "hidden" : ""}`}>
            <div className="auth-form-heading">Create account</div>
            <div className="auth-form-sub">Get started in seconds</div>
            {error && view === "signup" && <div className="auth-error">{error}</div>}
            <form onSubmit={handleSignUp}>
              <div className="auth-field">
                <label>Full Name</label>
                <input type="text" placeholder="Your name" value={name} onChange={e => setName(e.target.value)} autoFocus autoComplete="name" />
              </div>
              <div className="auth-field">
                <label>Email</label>
                <input type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />
              </div>
              <div className="auth-field">
                <label>Password</label>
                <input type="password" placeholder="At least 6 characters" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" />
                {password && (
                  <div className="auth-strength-bars">
                    {[1,2,3].map(i => (
                      <div key={i} className={`auth-bar ${i <= strength ? strengthClass : ""}`} />
                    ))}
                  </div>
                )}
              </div>
              <div className="auth-field">
                <label>Confirm Password</label>
                <input type="password" placeholder="Same as above" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password" />
              </div>
              <button className="auth-submit-btn" type="submit" disabled={loading || !name || !email || !password || !confirm}>
                {loading ? "Creating account…" : "Create Account"}
              </button>
            </form>
            <div className="auth-divider">
              <div className="auth-divider-line" />
              <span className="auth-divider-text">already have an account?</span>
              <div className="auth-divider-line" />
            </div>
            <div className="auth-switch">
              <button onClick={() => switchView("signin")}>Sign in</button>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
