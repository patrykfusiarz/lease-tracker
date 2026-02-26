import { useState } from "react";
import { useAuth } from "./auth";

const settingsCss = `
  .settings-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.6);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 200;
    animation: fadeIn 0.12s ease;
  }

  .settings-modal {
    background: rgba(24,29,40,0.95);
    border: 1px solid #252d3e;
    border-radius: 14px;
    width: 440px;
    overflow: hidden;
    box-shadow: 0 32px 80px rgba(0,0,0,0.6);
    animation: modalIn 0.16s cubic-bezier(0.16,1,0.3,1);
    font-family: 'Inter', sans-serif;
  }

  .settings-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 18px 20px 16px;
    border-bottom: 1px solid #232a3a;
  }

  .settings-title {
    font-size: 14px;
    font-weight: 600;
    color: #e6eaf5;
    letter-spacing: -0.2px;
  }

  .settings-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: 6px;
    border: none;
    background: transparent;
    color: #6b7a99;
    cursor: pointer;
    transition: background 0.1s, color 0.1s;
  }

  .settings-close:hover { background: #1f2535; color: #e6eaf5; }

  .settings-tabs {
    display: flex;
    border-bottom: 1px solid #232a3a;
    padding: 0 20px;
    gap: 2px;
  }

  .settings-tab {
    padding: 10px 14px;
    font-size: 12px;
    font-weight: 500;
    font-family: 'Inter', sans-serif;
    color: #6b7a99;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    cursor: pointer;
    transition: color 0.1s;
    margin-bottom: -1px;
    letter-spacing: -0.1px;
  }

  .settings-tab:hover  { color: #e6eaf5; }
  .settings-tab.active { color: #e6eaf5; border-bottom-color: #4a8fd4; }

  .settings-body { padding: 20px; display: flex; flex-direction: column; gap: 16px; }

  .settings-field {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .settings-field label {
    font-size: 10px;
    font-weight: 500;
    color: #6b7a99;
    letter-spacing: 0.4px;
    text-transform: uppercase;
  }

  .settings-field input {
    background: #1c2130;
    border: 1px solid #2e3648;
    border-radius: 7px;
    padding: 0 12px;
    height: 36px;
    font-size: 12.5px;
    font-family: 'Inter', sans-serif;
    color: #e6eaf5;
    outline: none;
    transition: border-color 0.15s;
    width: 100%;
  }

  .settings-field input:focus { border-color: #4a8fd4; }
  .settings-field input::placeholder { color: #364050; }
  .settings-field input:disabled { opacity: 0.4; cursor: not-allowed; }

  .settings-hint {
    font-size: 11px;
    color: #364050;
    margin-top: 2px;
  }

  .settings-divider { height: 1px; background: #1e2432; }

  .settings-footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    padding: 14px 20px;
    border-top: 1px solid #232a3a;
  }

  .settings-error {
    background: #1a0e0e;
    border: 1px solid #3a1a1a;
    border-radius: 6px;
    padding: 9px 12px;
    font-size: 12px;
    color: #f0a0a0;
    line-height: 1.5;
  }

  .settings-success {
    background: #0e1a12;
    border: 1px solid #1a3a22;
    border-radius: 6px;
    padding: 9px 12px;
    font-size: 12px;
    color: #6abf8a;
    line-height: 1.5;
  }

  .settings-avatar-row {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 4px 0 8px;
  }

  .settings-avatar {
    width: 48px;
    height: 48px;
    background: linear-gradient(135deg, #1a3a6e, #2a5090);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    font-weight: 700;
    color: #fff;
    letter-spacing: 0.3px;
    flex-shrink: 0;
  }

  .settings-avatar-info { display: flex; flex-direction: column; gap: 3px; }
  .settings-avatar-name  { font-size: 14px; font-weight: 500; color: #e6eaf5; letter-spacing: -0.2px; }
  .settings-avatar-email { font-size: 12px; color: #6b7a99; }

  .danger-zone {
    border: 1px solid #3a1a1a;
    border-radius: 8px;
    padding: 14px 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .danger-zone-text { font-size: 12.5px; color: #e6eaf5; font-weight: 500; }
  .danger-zone-sub  { font-size: 11.5px; color: #6b7a99; margin-top: 2px; }

  .btn-danger-outline {
    padding: 0 14px;
    height: 30px;
    border-radius: 6px;
    background: transparent;
    border: 1px solid #5a1a1a;
    color: #f0a0a0;
    font-size: 12px;
    font-family: 'Inter', sans-serif;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.1s;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .btn-danger-outline:hover { background: #1a0e0e; border-color: #7a2020; }
`;

function getInitials(name) {
  if (!name) return "?";
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

export function SettingsModal({ onClose }) {
  const { user, updateProfile, signOut } = useAuth();
  const [tab, setTab] = useState("profile");

  // Profile tab
  const [name,  setName]  = useState(user?.name  || "");
  const [email, setEmail] = useState(user?.email || "");

  // Password tab
  const [currentPw, setCurrentPw] = useState("");
  const [newPw,     setNewPw]     = useState("");
  const [confirmPw, setConfirmPw] = useState("");

  const [error,   setError]   = useState("");
  const [success, setSuccess] = useState("");
  const [saving,  setSaving]  = useState(false);

  const clearMessages = () => { setError(""); setSuccess(""); };

  const saveProfile = async () => {
    clearMessages();
    if (!name.trim())  return setError("Name cannot be empty");
    if (!email.trim()) return setError("Email cannot be empty");
    setSaving(true);
    const result = await updateProfile({ name: name.trim(), email: email.trim().toLowerCase() });
    setSaving(false);
    if (result.error) setError(result.error);
    else setSuccess("Profile updated successfully");
  };

  const savePassword = async () => {
    clearMessages();
    if (!currentPw)         return setError("Please enter your current password");
    if (newPw.length < 6)   return setError("New password must be at least 6 characters");
    if (newPw !== confirmPw) return setError("Passwords do not match");
    setSaving(true);
    const result = await updateProfile({ password: newPw, currentPassword: currentPw });
    setSaving(false);
    if (result.error) setError(result.error);
    else {
      setSuccess("Password updated successfully");
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
    }
  };

  return (
    <>
      <style>{settingsCss}</style>
      <div className="settings-overlay" onClick={onClose}>
        <div className="settings-modal" onClick={e => e.stopPropagation()}>

          <div className="settings-header">
            <span className="settings-title">Account Settings</span>
            <button className="settings-close" onClick={onClose}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          <div className="settings-tabs">
            {["profile","password","account"].map(t => (
              <button
                key={t}
                className={`settings-tab ${tab === t ? "active" : ""}`}
                onClick={() => { setTab(t); clearMessages(); }}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          <div className="settings-body">
            {/* ── Profile tab ── */}
            {tab === "profile" && (
              <>
                <div className="settings-avatar-row">
                  <div className="settings-avatar">{getInitials(user?.name)}</div>
                  <div className="settings-avatar-info">
                    <div className="settings-avatar-name">{user?.name}</div>
                    <div className="settings-avatar-email">{user?.email}</div>
                  </div>
                </div>
                <div className="settings-divider" />
                <div className="settings-field">
                  <label>Full Name</label>
                  <input value={name} onChange={e => setName(e.target.value)} placeholder="Your full name" />
                </div>
                <div className="settings-field">
                  <label>Email Address</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" />
                </div>
                {error   && <div className="settings-error">{error}</div>}
                {success && <div className="settings-success">{success}</div>}
              </>
            )}

            {/* ── Password tab ── */}
            {tab === "password" && (
              <>
                <div className="settings-field">
                  <label>Current Password</label>
                  <input type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} placeholder="••••••••" autoComplete="current-password" />
                </div>
                <div className="settings-divider" />
                <div className="settings-field">
                  <label>New Password</label>
                  <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="At least 6 characters" autoComplete="new-password" />
                </div>
                <div className="settings-field">
                  <label>Confirm New Password</label>
                  <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} placeholder="Same as above" autoComplete="new-password" />
                </div>
                {error   && <div className="settings-error">{error}</div>}
                {success && <div className="settings-success">{success}</div>}
              </>
            )}

            {/* ── Account tab ── */}
            {tab === "account" && (
              <>
                <div className="danger-zone">
                  <div>
                    <div className="danger-zone-text">Sign out</div>
                    <div className="danger-zone-sub">You'll need to sign back in to access your data</div>
                  </div>
                  <button className="btn-danger-outline" onClick={signOut}>Sign Out</button>
                </div>
                <div className="danger-zone">
                  <div>
                    <div className="danger-zone-text">Delete account</div>
                    <div className="danger-zone-sub">Permanently removes your account and all data</div>
                  </div>
                  <button className="btn-danger-outline" onClick={() => setError("Account deletion coming soon — contact support")}>Delete</button>
                </div>
                {error && <div className="settings-error">{error}</div>}
              </>
            )}
          </div>

          {(tab === "profile" || tab === "password") && (
            <div className="settings-footer">
              <button
                style={{ display:"flex",alignItems:"center",gap:6,background:"transparent",color:"#6b7a99",border:"1px solid #2e3648",borderRadius:7,padding:"0 12px",height:28,fontSize:12,fontFamily:"Inter,sans-serif",fontWeight:500,cursor:"pointer" }}
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                style={{ display:"flex",alignItems:"center",gap:6,background:"#2a4a7a",color:"#c8daf4",border:"none",borderRadius:7,padding:"0 12px",height:28,fontSize:12,fontFamily:"Inter,sans-serif",fontWeight:600,cursor:saving?"not-allowed":"pointer",opacity:saving?0.6:1 }}
                onClick={tab === "profile" ? saveProfile : savePassword}
                disabled={saving}
              >
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          )}

        </div>
      </div>
    </>
  );
}
