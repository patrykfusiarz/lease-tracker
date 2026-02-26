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
  }

  .auth-nav {
    position: fixed;
    top: 0; left: 0; right: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 24px;
    z-index: 10;
  }

  .auth-nav-right {
    font-size: 13px;
    color: #1a1a2e;
    letter-spacing: -0.1px;
    cursor: pointer;
    background: none; border: none;
    font-family: inherit;
    transition: color 0.15s;
  }
  .auth-nav-right:hover { color: #000; }

  .auth-card {
    background: #fff;
    border-radius: 10px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.08), 0 0 1px rgba(0,0,0,0.06);
    overflow: hidden;
    width: 380px;
    animation: cardIn 0.3s cubic-bezier(0.16,1,0.3,1) both;
  }

  .auth-form {
    padding: 36px 40px 40px;
  }

  .auth-heading {
    font-size: 18px;
    font-weight: 500;
    color: #0f0f1a;
    letter-spacing: -0.3px;
    margin-bottom: 22px;
  }

  .auth-field { margin-bottom: 14px; }

  .auth-field-label {
    font-size: 12px;
    font-weight: 400;
    color: #5a5c6e;
    margin-bottom: 5px;
    display: block;
  }

  .auth-field-wrap { position: relative; }

  .auth-input {
    width: 100%; height: 34px;
    background: #fff;
    border: 1px solid #dddfe6;
    border-radius: 6px;
    padding: 0 11px;
    font-size: 13px;
    font-family: inherit;
    color: #0f0f1a; outline: none;
    transition: border-color 0.15s, box-shadow 0.15s;
    -webkit-appearance: none;
  }
  .auth-input::placeholder { color: #c8cad4; }
  .auth-input:focus {
    border-color: #a0a4cc;
    box-shadow: 0 0 0 3px rgba(140,144,204,0.15);
  }

  .auth-eye {
    position: absolute;
    right: 8px; top: 50%;
    transform: translateY(-50%);
    background: none; border: none;
    cursor: pointer; color: #b0b2c0;
    display: flex; align-items: center;
    padding: 3px; transition: color 0.15s;
  }
  .auth-eye:hover { color: #5a5c6e; }

  .auth-forgot {
    display: block;
    font-size: 12px; color: #9a9cac;
    background: none; border: none;
    cursor: pointer; font-family: inherit;
    padding: 0; margin-top: 5px;
    text-align: left; transition: color 0.15s;
  }
  .auth-forgot:hover { color: #5a5c6e; }

  .auth-remember {
    display: flex; align-items: center;
    gap: 7px; font-size: 12px;
    color: #6a6c7e; cursor: pointer;
    user-select: none; margin-bottom: 18px;
    margin-top: 2px;
  }
  .auth-remember input[type="checkbox"] {
    width: 13px; height: 13px;
    accent-color: #8c90cc;
    cursor: pointer; margin: 0;
  }

  .auth-btn-primary {
    height: 34px;
    background: #8c90cc;
    color: #fff; border: none;
    border-radius: 20px;
    font-size: 13px; font-family: inherit;
    font-weight: 500; cursor: pointer;
    padding: 0 22px;
    transition: background 0.15s, transform 0.08s, opacity 0.15s;
    display: inline-flex; align-items: center;
  }
  .auth-btn-primary:hover    { background: #7b80bc; }
  .auth-btn-primary:active   { transform: scale(0.98); }
  .auth-btn-primary:disabled { opacity: 0.45; cursor: not-allowed; }

  .auth-error {
    background: #fff5f5; border: 1px solid #ffd0d0;
    border-radius: 6px; padding: 8px 11px;
    font-size: 12px; color: #c0302a;
    margin-bottom: 14px; line-height: 1.5;
  }

  .auth-timeout {
    background: #f0f2ff; border: 1px solid #d0d4f0;
    border-radius: 6px; padding: 8px 11px;
    font-size: 12px; color: #5058a0;
    margin-bottom: 14px; line-height: 1.5;
  }

  .auth-strength-bars { display: flex; gap: 3px; margin-top: 5px; }
  .auth-bar { flex: 1; height: 2px; border-radius: 2px; background: #eee; transition: background 0.2s; }
  .auth-bar.weak   { background: #f87171; }
  .auth-bar.medium { background: #fbbf24; }
  .auth-bar.strong { background: #34d399; }

  .auth-switch { font-size: 12px; color: #9a9cac; margin-top: 16px; }
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

  @media (max-width: 440px) {
    .auth-card { width: 100%; border-radius: 0; }
    .auth-form { padding: 32px 24px; }
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

export function AuthPage() {
  const { signIn, signUp, timedOut, resetPassword } = useAuth();
  const [rememberMe,   setRememberMe]   = useState(false);
  const [view,         setView]         = useState("signin");
  const [name,         setName]         = useState("");
  const [email,        setEmail]        = useState("");
  const [password,     setPassword]     = useState("");
  const [confirm,      setConfirm]      = useState("");
  const [showPw,       setShowPw]       = useState(false);
  const [error,        setError]        = useState("");
  const [loading,      setLoading]      = useState(false);

  const [forgotMode,   setForgotMode]   = useState(false);
  const [forgotEmail,  setForgotEmail]  = useState("");
  const [forgotSent,   setForgotSent]   = useState(false);

  const strength      = passwordStrength(password);
  const strengthClass = ["","weak","medium","strong"][strength];

  const switchView = (v) => {
    setView(v); setError("");
    setName(""); setEmail(""); setPassword(""); setConfirm("");
  };

  const handleForgot = async (e) => {
    e.preventDefault(); setError("");
    if (!forgotEmail.trim()) return setError("Please enter your email address");
    setLoading(true);
    const { error } = await resetPassword(forgotEmail.trim().toLowerCase());
    setLoading(false);
    if (error) setError(error);
    else setForgotSent(true);
  };

  const handleSignIn = async (e) => {
    e.preventDefault(); setError("");
    // Catch browser autofill which may not fire React onChange
    const formEmail    = e.target.elements.email?.value    || email;
    const formPassword = e.target.elements.password?.value || password;
    if (!formEmail || !formPassword) return;
    setEmail(formEmail);
    setPassword(formPassword);
    setLoading(true);
    const r = await signIn(formEmail.trim().toLowerCase(), formPassword, rememberMe);
    setLoading(false);
    if (r.error) setError(r.error);
  };

  const handleSignUp = async (e) => {
    e.preventDefault(); setError("");
    if (!name.trim())         return setError("Please enter your full name");
    if (!email.trim())        return setError("Please enter your email");
    if (password.length < 6)  return setError("Password must be at least 6 characters");
    if (password !== confirm)  return setError("Passwords do not match");
    setLoading(true);
    const r = await signUp(email.trim().toLowerCase(), password, name.trim());
    setLoading(false);
    if (r.error) setError(r.error);
  };

  return (
    <>
      <style>{authCss}</style>
      <div className="auth-root">

        <nav className="auth-nav">

          <button className="auth-nav-right" onClick={() => switchView(view === "signin" ? "signup" : "signin")}>
            {view === "signin" ? "Create Account ›" : "Sign In ›"}
          </button>
        </nav>

        <div className="auth-card">
          <div className="auth-form">
            <div className="auth-heading">{view === "signin" ? "Log in" : "Create account"}</div>

            {timedOut && <div className="auth-timeout">🔒 Signed out after 20 min of inactivity.</div>}
            {error    && <div className="auth-error">{error}</div>}

            {forgotMode ? (
              forgotSent ? (
                <div style={{ textAlign: "center", padding: "12px 0 8px" }}>
                  <div style={{ fontSize: 28, marginBottom: 12 }}>📬</div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "#0f0f1a", marginBottom: 6 }}>Check your inbox</div>
                  <div style={{ fontSize: 12, color: "#5a5c6e", lineHeight: 1.6, marginBottom: 20 }}>We sent a password reset link to<br /><strong>{forgotEmail}</strong></div>
                  <button className="auth-btn-primary" onClick={() => { setForgotMode(false); setForgotSent(false); setError(""); }}>Back to Sign In</button>
                </div>
              ) : (
                <form onSubmit={handleForgot}>
                  <div style={{ fontSize: 12, color: "#5a5c6e", marginBottom: 16, lineHeight: 1.6 }}>Enter your email and we'll send you a reset link.</div>
                  <div className="auth-field">
                    <label className="auth-field-label">Email</label>
                    <input className="auth-input" type="email" name="email" value={forgotEmail}
                      onChange={e => setForgotEmail(e.target.value)} autoFocus autoComplete="email" />
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
                    <button type="button" className="auth-forgot" style={{ fontSize: 12 }} onClick={() => { setForgotMode(false); setError(""); }}>← Back</button>
                    <button className="auth-btn-primary" type="submit" disabled={loading} style={{ marginLeft: "auto" }}>
                      {loading ? "Sending…" : "Send Reset Link"}
                    </button>
                  </div>
                </form>
              )
            ) : view === "signin" ? (
              <form onSubmit={handleSignIn}>
                <div className="auth-field">
                  <label className="auth-field-label">Email</label>
                  <input className="auth-input" type="email" name="email" value={email}
                    onChange={e => setEmail(e.target.value)} autoFocus autoComplete="email" />
                </div>

                <div className="auth-field">
                  <label className="auth-field-label">Password</label>
                  <div className="auth-field-wrap">
                    <input className="auth-input" type={showPw ? "text" : "password"} name="password"
                      value={password} onChange={e => setPassword(e.target.value)}
                      autoComplete="current-password" style={{ paddingRight: 32 }} />
                    <button type="button" className="auth-eye" onClick={() => setShowPw(v => !v)}>
                      <EyeIcon open={showPw} />
                    </button>
                  </div>
                  <button type="button" className="auth-forgot" onClick={() => { setForgotMode(true); setForgotEmail(email); setError(""); }}>Forgot password?</button>
                </div>

                <label className="auth-remember">
                  <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} />
                  Remember me
                </label>

                <button className="auth-btn-primary" type="submit" disabled={loading}>
                  {loading ? "Signing in…" : "Log in"}
                </button>

                <div className="auth-switch">
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
                <div className="auth-field" style={{ marginBottom: 22 }}>
                  <label className="auth-field-label">Confirm Password</label>
                  <input className="auth-input" type="password" value={confirm}
                    onChange={e => setConfirm(e.target.value)} autoComplete="new-password" />
                </div>
                <button className="auth-btn-primary" type="submit"
                  disabled={loading || !name || !email || !password || !confirm}>
                  {loading ? "Creating…" : "Create Account"}
                </button>
                <div className="auth-switch">
                  Already have an account? <button onClick={() => switchView("signin")}>Log in</button>
                </div>
              </form>
            )}
          </div>
        </div>

      </div>
    </>
  );
}
