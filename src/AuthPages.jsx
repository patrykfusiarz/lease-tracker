import { useState } from "react";
import { useAuth } from "./auth";

const authCss = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');

  * { box-sizing: border-box; margin: 0; padding: 0; }

  .auth-root {
    min-height: 100vh;
    background: #0e1117;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Inter', sans-serif;
    padding: 20px;
  }

  .auth-card {
    width: 100%;
    max-width: 380px;
    background: #131720;
    border: 1px solid #1e2432;
    border-radius: 14px;
    padding: 36px 32px 32px;
    box-shadow: 0 32px 80px rgba(0,0,0,0.5);
    animation: authIn 0.2s cubic-bezier(0.16,1,0.3,1);
  }

  @keyframes authIn {
    from { opacity: 0; transform: translateY(10px) scale(0.98); }
    to   { opacity: 1; transform: translateY(0)    scale(1);    }
  }

  .auth-logo {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 28px;
  }

  .auth-logo-mark {
    width: 32px;
    height: 32px;
    background: linear-gradient(135deg, #1a3a6e, #2a5090);
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: 700;
    color: #fff;
    letter-spacing: -0.3px;
    flex-shrink: 0;
  }

  .auth-logo-text {
    font-size: 14px;
    font-weight: 600;
    color: #e6eaf5;
    letter-spacing: -0.2px;
  }

  .auth-logo-sub {
    font-size: 11px;
    color: #6b7a99;
    font-weight: 400;
  }

  .auth-heading {
    font-size: 20px;
    font-weight: 500;
    color: #e6eaf5;
    letter-spacing: -0.4px;
    margin-bottom: 6px;
  }

  .auth-subheading {
    font-size: 13px;
    color: #6b7a99;
    margin-bottom: 28px;
    line-height: 1.5;
  }

  .auth-field {
    display: flex;
    flex-direction: column;
    gap: 5px;
    margin-bottom: 14px;
  }

  .auth-field label {
    font-size: 11px;
    font-weight: 500;
    color: #6b7a99;
    letter-spacing: 0.3px;
    text-transform: uppercase;
  }

  .auth-field input {
    background: #1c2130;
    border: 1px solid #2e3648;
    border-radius: 7px;
    padding: 0 12px;
    height: 38px;
    font-size: 13px;
    font-family: 'Inter', sans-serif;
    color: #e6eaf5;
    outline: none;
    transition: border-color 0.15s;
    width: 100%;
  }

  .auth-field input:focus { border-color: #4a8fd4; }
  .auth-field input::placeholder { color: #364050; }

  .auth-error {
    background: #1a0e0e;
    border: 1px solid #3a1a1a;
    border-radius: 7px;
    padding: 10px 12px;
    font-size: 12px;
    color: #f0a0a0;
    margin-bottom: 16px;
    line-height: 1.5;
  }

  .auth-btn {
    width: 100%;
    height: 38px;
    background: #2a4a7a;
    color: #c8daf4;
    border: none;
    border-radius: 7px;
    font-size: 13px;
    font-family: 'Inter', sans-serif;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
    margin-top: 6px;
    letter-spacing: -0.1px;
  }

  .auth-btn:hover    { background: #2e5488; }
  .auth-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .auth-divider {
    height: 1px;
    background: #1e2432;
    margin: 22px 0;
  }

  .auth-switch {
    font-size: 12.5px;
    color: #6b7a99;
    text-align: center;
  }

  .auth-switch button {
    background: none;
    border: none;
    color: #7aa4e0;
    font-size: 12.5px;
    font-family: 'Inter', sans-serif;
    cursor: pointer;
    padding: 0;
    font-weight: 500;
    transition: color 0.1s;
  }

  .auth-switch button:hover { color: #93c5fd; }

  .auth-password-wrap { position: relative; }
  .auth-password-wrap input { padding-right: 40px; }
  .auth-eye-btn {
    position: absolute;
    right: 10px;
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    color: #6b7a99;
    cursor: pointer;
    padding: 4px;
    display: flex;
    align-items: center;
    transition: color 0.1s;
  }
  .auth-eye-btn:hover { color: #e6eaf5; }

  .auth-strength {
    display: flex;
    gap: 4px;
    margin-top: 6px;
  }

  .auth-strength-bar {
    flex: 1;
    height: 2px;
    border-radius: 2px;
    background: #2e3648;
    transition: background 0.2s;
  }

  .auth-strength-bar.weak   { background: #9a4050; }
  .auth-strength-bar.medium { background: #b45309; }
  .auth-strength-bar.strong { background: #3a8a6a; }
`;

function EyeIcon({ open }) {
  return open ? (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  ) : (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  );
}

function passwordStrength(pw) {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8)  score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return Math.min(3, Math.ceil(score / 1.5));
}

// ── Login ─────────────────────────────────────────────────────────────────────
export function LoginPage({ onSwitch }) {
  const { signIn } = useAuth();
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [showPw,   setShowPw]   = useState(false);
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setError("");
    setLoading(true);
    const result = await signIn(email.trim().toLowerCase(), password);
    setLoading(false);
    if (result.error) setError(result.error);
  };

  return (
    <>
      <style>{authCss}</style>
      <div className="auth-root">
        <div className="auth-card">
          <div className="auth-logo">
            <div className="auth-logo-mark">VW</div>
            <div>
              <div className="auth-logo-text">Lease Tracker</div>
              <div className="auth-logo-sub">Maturity Management</div>
            </div>
          </div>

          <div className="auth-heading">Welcome back</div>
          <div className="auth-subheading">Sign in to your account to continue</div>

          {error && <div className="auth-error">{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="auth-field">
              <label>Email</label>
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoFocus
                autoComplete="email"
              />
            </div>
            <div className="auth-field">
              <label>Password</label>
              <div className="auth-password-wrap">
                <input
                  type={showPw ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
                <button type="button" className="auth-eye-btn" onClick={() => setShowPw(v => !v)}>
                  <EyeIcon open={showPw} />
                </button>
              </div>
            </div>

            <button className="auth-btn" type="submit" disabled={loading || !email || !password}>
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </form>

          <div className="auth-divider" />
          <div className="auth-switch">
            Don't have an account?{" "}
            <button onClick={onSwitch}>Create one</button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Sign Up ───────────────────────────────────────────────────────────────────
export function SignUpPage({ onSwitch }) {
  const { signUp } = useAuth();
  const [name,     setName]     = useState("");
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [confirm,  setConfirm]  = useState("");
  const [showPw,   setShowPw]   = useState(false);
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);

  const strength = passwordStrength(password);
  const strengthLabel = ["", "Weak", "Fair", "Strong"][strength];
  const strengthClass = ["", "weak", "medium", "strong"][strength];

  const handleSubmit = async (e) => {
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
        <div className="auth-card">
          <div className="auth-logo">
            <div className="auth-logo-mark">VW</div>
            <div>
              <div className="auth-logo-text">Lease Tracker</div>
              <div className="auth-logo-sub">Maturity Management</div>
            </div>
          </div>

          <div className="auth-heading">Create your account</div>
          <div className="auth-subheading">Get started — it only takes a moment</div>

          {error && <div className="auth-error">{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="auth-field">
              <label>Full Name</label>
              <input
                type="text"
                placeholder="Patryk Fusiarz"
                value={name}
                onChange={e => setName(e.target.value)}
                autoFocus
                autoComplete="name"
              />
            </div>
            <div className="auth-field">
              <label>Email</label>
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
            <div className="auth-field">
              <label>Password</label>
              <div className="auth-password-wrap">
                <input
                  type={showPw ? "text" : "password"}
                  placeholder="At least 6 characters"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="new-password"
                />
                <button type="button" className="auth-eye-btn" onClick={() => setShowPw(v => !v)}>
                  <EyeIcon open={showPw} />
                </button>
              </div>
              {password && (
                <div className="auth-strength">
                  {[1,2,3].map(i => (
                    <div key={i} className={`auth-strength-bar ${i <= strength ? strengthClass : ""}`} />
                  ))}
                </div>
              )}
            </div>
            <div className="auth-field">
              <label>Confirm Password</label>
              <input
                type={showPw ? "text" : "password"}
                placeholder="Same as above"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                autoComplete="new-password"
              />
            </div>

            <button className="auth-btn" type="submit" disabled={loading || !name || !email || !password || !confirm}>
              {loading ? "Creating account…" : "Create Account"}
            </button>
          </form>

          <div className="auth-divider" />
          <div className="auth-switch">
            Already have an account?{" "}
            <button onClick={onSwitch}>Sign in</button>
          </div>
        </div>
      </div>
    </>
  );
}
