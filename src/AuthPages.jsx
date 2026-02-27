import { useState } from "react";
import { useAuth } from "./auth";

const authCss = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body { background: #0c0c0e; }

  .auth-root {
    min-height: 100vh;
    background: #0c0c0e;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  }

  .auth-card {
    background: #131720;
    border-radius: 12px;
    border: 1px solid #1e2432;
    box-shadow: 0 0 0 1px rgba(0,0,0,0.4), 0 24px 64px rgba(0,0,0,0.5);
    overflow: hidden;
    width: 360px;
    animation: cardIn 0.28s cubic-bezier(0.16,1,0.3,1) both;
  }

  .auth-form { padding: 32px 36px 36px; }

  .auth-wordmark {
    font-size: 12px; font-weight: 600; letter-spacing: 0.8px;
    text-transform: uppercase; color: #4a5670;
    margin-bottom: 24px; display: block;
  }

  .auth-heading {
    font-size: 18px; font-weight: 500;
    color: #e6eaf5; letter-spacing: -0.3px;
    margin-bottom: 24px;
  }

  .auth-field { margin-bottom: 14px; }

  .auth-field-label {
    font-size: 11.5px; font-weight: 500;
    color: #6b7a99; margin-bottom: 5px;
    display: block; letter-spacing: 0.1px;
  }

  .auth-field-wrap { position: relative; }

  .auth-input {
    width: 100%; height: 36px;
    background: #0e1117;
    border: 1px solid #232a3a;
    border-radius: 7px;
    padding: 0 12px;
    font-size: 13px; font-family: inherit;
    color: #e6eaf5; outline: none;
    transition: border-color 0.15s, box-shadow 0.15s;
    -webkit-appearance: none;
  }
  .auth-input::placeholder { color: #364050; }
  .auth-input:focus {
    border-color: #4a8fd4;
    box-shadow: 0 0 0 3px rgba(74,143,212,0.12);
  }

  .auth-eye {
    position: absolute; right: 9px; top: 50%;
    transform: translateY(-50%);
    background: none; border: none;
    cursor: pointer; color: #4a5670;
    display: flex; align-items: center;
    padding: 3px; transition: color 0.15s;
  }
  .auth-eye:hover { color: #8896b4; }

  .auth-forgot {
    display: block; font-size: 11.5px;
    color: #4a5670; background: none; border: none;
    cursor: pointer; font-family: inherit;
    padding: 0; margin-top: 6px;
    text-align: left; transition: color 0.15s;
  }
  .auth-forgot:hover { color: #8896b4; }

  .auth-remember {
    display: flex; align-items: center;
    gap: 7px; font-size: 12px;
    color: #6b7a99; cursor: pointer;
    user-select: none; margin-bottom: 20px; margin-top: 4px;
  }
  .auth-remember input[type="checkbox"] {
    width: 13px; height: 13px;
    accent-color: #4a8fd4;
    cursor: pointer; margin: 0;
  }

  .auth-btn-primary {
    width: 100%; height: 36px;
    background: #2a4a7a;
    color: #c8daf4; border: none;
    border-radius: 7px;
    font-size: 13px; font-family: inherit;
    font-weight: 500; cursor: pointer;
    transition: background 0.15s, transform 0.08s, opacity 0.15s;
    display: flex; align-items: center; justify-content: center;
    letter-spacing: -0.1px;
  }
  .auth-btn-primary:hover    { background: #2e5488; }
  .auth-btn-primary:active   { transform: scale(0.99); }
  .auth-btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }

  .auth-error {
    background: rgba(248,113,113,0.08);
    border: 1px solid rgba(248,113,113,0.2);
    border-radius: 7px; padding: 9px 12px;
    font-size: 12px; color: #f87171;
    margin-bottom: 14px; line-height: 1.5;
  }

  .auth-timeout {
    background: rgba(74,143,212,0.08);
    border: 1px solid rgba(74,143,212,0.18);
    border-radius: 7px; padding: 10px 12px;
    margin-bottom: 16px;
    display: flex; align-items: flex-start; gap: 10px;
  }
  .auth-timeout-icon {
    width: 28px; height: 28px; border-radius: 7px;
    background: rgba(74,143,212,0.12);
    border: 1px solid rgba(74,143,212,0.2);
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; margin-top: 1px;
  }
  .auth-timeout-text { flex: 1; }
  .auth-timeout-title { font-size: 12px; font-weight: 600; color: #7aa4e0; letter-spacing: -0.1px; }
  .auth-timeout-sub { font-size: 11px; color: #4a6ea8; margin-top: 2px; line-height: 1.5; }

  @keyframes cardIn {
    from { opacity: 0; transform: translateY(12px) scale(0.98); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }

  @media (max-width: 440px) {
    .auth-card { width: 100%; border-radius: 0; }
    .auth-form { padding: 28px 24px 32px; }
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

export function AuthPage() {
  const { signIn, timedOut, resetPassword } = useAuth();
  const [rememberMe,   setRememberMe]   = useState(false);
  const [email,        setEmail]        = useState("");
  const [password,     setPassword]     = useState("");
  const [showPw,       setShowPw]       = useState(false);
  const [error,        setError]        = useState("");
  const [loading,      setLoading]      = useState(false);

  const [forgotMode,   setForgotMode]   = useState(false);
  const [forgotEmail,  setForgotEmail]  = useState("");
  const [forgotSent,   setForgotSent]   = useState(false);

  const handleForgot = async (e) => {
    e.preventDefault(); setError("");
    if (!forgotEmail.trim()) return setError("Please enter your email address.");
    setLoading(true);
    const { error } = await resetPassword(forgotEmail.trim().toLowerCase());
    setLoading(false);
    if (error) setError(error);
    else setForgotSent(true);
  };

  const handleSignIn = async (e) => {
    e.preventDefault(); setError("");
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

  return (
    <>
      <style>{authCss}</style>
      <div className="auth-root">
        <div className="auth-card">
          <div className="auth-form">
            <span className="auth-wordmark">Meridian VW</span>
            <div className="auth-heading">
              {forgotMode ? (forgotSent ? "Check your inbox" : "Reset password") : "Welcome back"}
            </div>

            {timedOut && !forgotMode && (
              <div className="auth-timeout">
                <div className="auth-timeout-icon">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#7aa4e0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                  </svg>
                </div>
                <div className="auth-timeout-text">
                  <div className="auth-timeout-title">Session expired</div>
                  <div className="auth-timeout-sub">Signed out after 20 minutes of inactivity.</div>
                </div>
              </div>
            )}

            {error && <div className="auth-error">{error}</div>}

            {forgotMode ? (
              forgotSent ? (
                <div style={{ textAlign: "center", padding: "8px 0 4px" }}>
                  <div style={{ fontSize: 13, color: "#8896b4", lineHeight: 1.7, marginBottom: 20 }}>
                    A reset link was sent to<br />
                    <span style={{ color: "#7aa4e0", fontWeight: 500 }}>{forgotEmail}</span>
                  </div>
                  <button className="auth-btn-primary" onClick={() => { setForgotMode(false); setForgotSent(false); setError(""); }}>
                    Back to Sign In
                  </button>
                </div>
              ) : (
                <form onSubmit={handleForgot}>
                  <div style={{ fontSize: 12, color: "#6b7a99", marginBottom: 16, lineHeight: 1.6 }}>
                    Enter your email and we'll send a reset link.
                  </div>
                  <div className="auth-field">
                    <label className="auth-field-label">Email</label>
                    <input className="auth-input" type="email" name="email" value={forgotEmail}
                      onChange={e => setForgotEmail(e.target.value)} autoFocus autoComplete="email" />
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
                    <button type="button" className="auth-forgot" onClick={() => { setForgotMode(false); setError(""); }}>
                      ← Back
                    </button>
                    <button className="auth-btn-primary" type="submit" disabled={loading} style={{ width: "auto", paddingInline: 18 }}>
                      {loading ? "Sending…" : "Send Reset Link"}
                    </button>
                  </div>
                </form>
              )
            ) : (
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
                      autoComplete="current-password" style={{ paddingRight: 34 }} />
                    <button type="button" className="auth-eye" onClick={() => setShowPw(v => !v)}>
                      <EyeIcon open={showPw} />
                    </button>
                  </div>
                  <button type="button" className="auth-forgot" onClick={() => { setForgotMode(true); setForgotEmail(email); setError(""); }}>
                    Forgot password?
                  </button>
                </div>

                <label className="auth-remember">
                  <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} />
                  Remember me
                </label>

                <button className="auth-btn-primary" type="submit" disabled={loading || !email || !password}>
                  {loading ? "Signing in…" : "Log in"}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
