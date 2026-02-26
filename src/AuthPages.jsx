import { useState } from "react";
import { useAuth } from "./auth";

const authCss = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  .auth-root {
    min-height: 100vh;
    background: #e8eaef;
    display: flex;
    flex-direction: column;
    font-family: 'Inter', -apple-system, sans-serif;
  }

  .auth-nav {
    position: fixed;
    top: 0; left: 0; right: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 18px 28px;
    z-index: 10;
  }

  .auth-nav-logo {
    display: flex;
    align-items: center;
    gap: 9px;
  }

  .auth-nav-logo-mark {
    width: 28px; height: 28px;
    border-radius: 50%;
    border: 1.5px solid rgba(0,0,0,0.18);
    display: flex; align-items: center; justify-content: center;
  }

  .auth-nav-wordmark {
    font-size: 13px; font-weight: 500;
    color: #1a1a1a; letter-spacing: -0.2px;
  }

  .auth-nav-action {
    font-size: 13px; color: #444;
    background: none; border: none;
    cursor: pointer; font-family: inherit;
    transition: color 0.15s;
  }
  .auth-nav-action:hover { color: #000; }

  .auth-center {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 80px 20px 40px;
    min-height: 100vh;
  }

  .auth-card {
    background: #fff;
    border-radius: 14px;
    padding: 36px 40px 40px;
    width: 100%;
    max-width: 360px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 8px 32px rgba(0,0,0,0.07);
    animation: cardIn 0.28s cubic-bezier(0.16,1,0.3,1) both;
  }

  .auth-card-heading {
    font-size: 20px; font-weight: 500;
    color: #111; letter-spacing: -0.4px;
    margin-bottom: 22px;
  }

  .auth-field { margin-bottom: 10px; position: relative; }

  .auth-field label {
    display: block;
    font-size: 12px; font-weight: 500;
    color: #555; margin-bottom: 5px;
    letter-spacing: -0.1px;
  }

  .auth-field input {
    width: 100%; height: 38px;
    background: #fff;
    border: 1px solid #d8dade;
    border-radius: 8px;
    padding: 0 12px;
    font-size: 13.5px;
    font-family: inherit;
    color: #111; outline: none;
    transition: border-color 0.15s, box-shadow 0.15s;
  }

  .auth-field input::placeholder { color: #bbb; }

  .auth-field input:focus {
    border-color: #9ea8d4;
    box-shadow: 0 0 0 3px rgba(130,140,210,0.12);
  }

  .auth-field-eye {
    position: absolute;
    right: 10px; top: 28px;
    background: none; border: none;
    cursor: pointer; color: #bbb;
    display: flex; align-items: center;
    padding: 4px;
    transition: color 0.15s;
  }
  .auth-field-eye:hover { color: #666; }

  .auth-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 6px 0 20px;
  }

  .auth-remember {
    display: flex; align-items: center;
    gap: 7px; font-size: 12.5px;
    color: #666; cursor: pointer; user-select: none;
  }
  .auth-remember input[type="checkbox"] {
    width: 14px; height: 14px;
    accent-color: #8b95cf;
    cursor: pointer; margin: 0;
  }

  .auth-forgot {
    font-size: 12px; color: #8b95cf;
    background: none; border: none;
    cursor: pointer; font-family: inherit;
    padding: 0; transition: color 0.15s;
  }
  .auth-forgot:hover { color: #6a74b0; }

  .auth-submit-btn {
    height: 36px;
    background: #8b95cf;
    color: #fff; border: none;
    border-radius: 20px;
    font-size: 13px; font-family: inherit;
    font-weight: 500; cursor: pointer;
    padding: 0 22px;
    transition: background 0.15s, transform 0.1s, opacity 0.15s;
    letter-spacing: -0.1px;
  }
  .auth-submit-btn:hover    { background: #7a84be; }
  .auth-submit-btn:active   { transform: scale(0.98); }
  .auth-submit-btn:disabled { opacity: 0.45; cursor: not-allowed; }

  .auth-error {
    background: #fef2f2; border: 1px solid #fecaca;
    border-radius: 7px; padding: 9px 12px;
    font-size: 12.5px; color: #b91c1c;
    margin-bottom: 14px; line-height: 1.5;
  }

  .auth-timeout {
    background: #f0f3ff; border: 1px solid #c7d0f0;
    border-radius: 7px; padding: 9px 12px;
    font-size: 12.5px; color: #4a56a0;
    margin-bottom: 16px; line-height: 1.5;
  }

  .auth-divider {
    display: flex; align-items: center;
    gap: 10px; margin: 20px 0 14px;
  }
  .auth-divider-line { flex: 1; height: 1px; background: #eee; }
  .auth-divider-text { font-size: 11.5px; color: #bbb; white-space: nowrap; }

  .auth-switch { font-size: 12.5px; color: #999; text-align: center; }
  .auth-switch button {
    background: none; border: none;
    color: #8b95cf; font-size: 12.5px;
    font-family: inherit; font-weight: 500;
    cursor: pointer; padding: 0;
    transition: color 0.15s;
  }
  .auth-switch button:hover { color: #6a74b0; }

  .auth-strength-bars { display: flex; gap: 4px; margin-top: 6px; }
  .auth-bar { flex: 1; height: 2px; border-radius: 2px; background: #eee; transition: background 0.2s; }
  .auth-bar.weak   { background: #f87171; }
  .auth-bar.medium { background: #fbbf24; }
  .auth-bar.strong { background: #34d399; }

  @keyframes cardIn {
    from { opacity: 0; transform: translateY(12px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  @media (max-width: 480px) {
    .auth-card { max-width: 100%; border-radius: 10px; padding: 32px 24px; }
    .auth-nav { padding: 16px 20px; }
  }
`;

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

function EyeIcon({ open }) {
  return open ? (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
    </svg>
  ) : (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  );
}

function LogoMark() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
    </svg>
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
  const [showPassword, setShowPassword] = useState(false);
  const [error,        setError]        = useState("");
  const [loading,      setLoading]      = useState(false);

  const strength      = passwordStrength(password);
  const strengthClass = ["", "weak", "medium", "strong"][strength];

  const switchView = (v) => {
    setView(v); setError("");
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
    if (!name.trim())         return setError("Please enter your full name");
    if (!email.trim())        return setError("Please enter your email");
    if (password.length < 6)  return setError("Password must be at least 6 characters");
    if (password !== confirm)  return setError("Passwords do not match");
    setLoading(true);
    const result = await signUp(email.trim().toLowerCase(), password, name.trim());
    setLoading(false);
    if (result.error) setError(result.error);
  };

  return (
    <>
      <style>{authCss}</style>
      <div className="auth-root">

        <nav className="auth-nav">
          <div className="auth-nav-logo">
            <div className="auth-nav-logo-mark"><LogoMark /></div>
            <span className="auth-nav-wordmark">Lease Tracker</span>
          </div>
          <button className="auth-nav-action" onClick={() => switchView(view === "signin" ? "signup" : "signin")}>
            {view === "signin" ? "Create account →" : "Sign in →"}
          </button>
        </nav>

        <div className="auth-center">

          {view === "signin" ? (
            <div className="auth-card" key="signin">
              <div className="auth-card-heading">Log in</div>

              {timedOut && <div className="auth-timeout">🔒 Signed out after 20 min of inactivity.</div>}
              {error && <div className="auth-error">{error}</div>}

              <form onSubmit={handleSignIn}>
                <div className="auth-field">
                  <label>Email</label>
                  <input type="email" placeholder="you@example.com" value={email}
                    onChange={e => setEmail(e.target.value)} autoFocus autoComplete="email" />
                </div>

                <div className="auth-field">
                  <label>Password</label>
                  <input type={showPassword ? "text" : "password"} placeholder="••••••••"
                    value={password} onChange={e => setPassword(e.target.value)}
                    autoComplete="current-password" style={{ paddingRight: 36 }} />
                  <button type="button" className="auth-field-eye" onClick={() => setShowPassword(v => !v)}>
                    <EyeIcon open={showPassword} />
                  </button>
                </div>

                <div className="auth-row">
                  <label className="auth-remember">
                    <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} />
                    Remember me
                  </label>
                  <button type="button" className="auth-forgot">Forgot password?</button>
                </div>

                <button className="auth-submit-btn" type="submit" disabled={loading || !email || !password}>
                  {loading ? "Signing in…" : "Log in"}
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

          ) : (
            <div className="auth-card" key="signup">
              <div className="auth-card-heading">Create account</div>
              {error && <div className="auth-error">{error}</div>}

              <form onSubmit={handleSignUp}>
                <div className="auth-field">
                  <label>Full Name</label>
                  <input type="text" placeholder="Your name" value={name}
                    onChange={e => setName(e.target.value)} autoFocus autoComplete="name" />
                </div>
                <div className="auth-field">
                  <label>Email</label>
                  <input type="email" placeholder="you@example.com" value={email}
                    onChange={e => setEmail(e.target.value)} autoComplete="email" />
                </div>
                <div className="auth-field">
                  <label>Password</label>
                  <input type={showPassword ? "text" : "password"} placeholder="At least 6 characters"
                    value={password} onChange={e => setPassword(e.target.value)}
                    autoComplete="new-password" style={{ paddingRight: 36 }} />
                  <button type="button" className="auth-field-eye" onClick={() => setShowPassword(v => !v)}>
                    <EyeIcon open={showPassword} />
                  </button>
                  {password && (
                    <div className="auth-strength-bars">
                      {[1,2,3].map(i => <div key={i} className={`auth-bar ${i <= strength ? strengthClass : ""}`} />)}
                    </div>
                  )}
                </div>
                <div className="auth-field" style={{ marginBottom: 22 }}>
                  <label>Confirm Password</label>
                  <input type="password" placeholder="Same as above" value={confirm}
                    onChange={e => setConfirm(e.target.value)} autoComplete="new-password" />
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
          )}

        </div>
      </div>
    </>
  );
}
