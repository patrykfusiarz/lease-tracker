import { useState, useRef } from "react";
import { useAuth } from "./auth";

const settingsCss = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');

  .settings-overlay {
    position: fixed; inset: 0;
    background: rgba(17,24,39,0.2);
    backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
    display: flex; align-items: center; justify-content: center;
    z-index: 200; animation: fadeIn 0.12s ease;
  }
  /* Dark mode overlay */
  .app:not(.day) .settings-overlay {
    background: rgba(0,0,0,0.65);
  }

  @keyframes fadeIn  { from { opacity:0; } to { opacity:1; } }
  @keyframes modalIn { from { opacity:0; transform:scale(0.97); } to { opacity:1; transform:scale(1); } }
  @keyframes spin    { to { transform: rotate(360deg); } }

  /* ── Modal shell ── */
  .settings-modal {
    background: #ffffff;
    border: 1px solid #e8eaef;
    border-radius: 14px;
    width: 440px;
    overflow: hidden;
    box-shadow: 0 8px 40px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.04);
    animation: modalIn 0.16s cubic-bezier(0.16,1,0.3,1);
    font-family: 'Inter', sans-serif;
    color: #111827;
  }
  /* Dark app: restore dark modal */
  .app:not(.day) .settings-modal {
    background: rgba(24,29,40,0.97);
    border-color: #252d3e;
    color: #e6eaf5;
    box-shadow: 0 32px 80px rgba(0,0,0,0.6);
  }

  /* ── Header ── */
  .settings-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 18px 20px 16px;
    border-bottom: 1px solid #eceef2;
  }
  .app:not(.day) .settings-header { border-bottom-color: #232a3a; }

  .settings-title { font-size: 14px; font-weight: 600; letter-spacing: -0.2px; }

  .settings-close {
    display: flex; align-items: center; justify-content: center;
    width: 26px; height: 26px; border-radius: 6px; border: none;
    background: transparent; color: #9ca3af; cursor: pointer;
    transition: background 0.1s, color 0.1s;
  }
  .settings-close:hover { background: #f3f4f6; color: #374151; }
  .app:not(.day) .settings-close { color: #6b7a99; }
  .app:not(.day) .settings-close:hover { background: #1f2535; color: #e6eaf5; }

  /* ── Tabs ── */
  .settings-tabs {
    display: flex; border-bottom: 1px solid #eceef2;
    padding: 0 20px; gap: 2px;
  }
  .app:not(.day) .settings-tabs { border-bottom-color: #232a3a; }

  .settings-tab {
    padding: 10px 14px; font-size: 12.5px; font-weight: 500;
    font-family: 'Inter', sans-serif; color: #6b7280;
    background: none; border: none; border-bottom: 2px solid transparent;
    cursor: pointer; transition: color 0.1s; margin-bottom: -1px; letter-spacing: -0.1px;
  }
  .settings-tab:hover { color: #111827; }
  .settings-tab.active { color: #111827; border-bottom-color: #1d1d35; }
  .app:not(.day) .settings-tab { color: #6b7a99; }
  .app:not(.day) .settings-tab:hover { color: #e6eaf5; }
  .app:not(.day) .settings-tab.active { color: #e6eaf5; border-bottom-color: #4a8fd4; }

  /* ── Body ── */
  .settings-body { padding: 20px; display: flex; flex-direction: column; gap: 16px; }

  .settings-field { display: flex; flex-direction: column; gap: 5px; }

  .settings-field label {
    font-size: 10px; font-weight: 500; color: #6b7280;
    letter-spacing: 0.4px; text-transform: uppercase;
  }
  .app:not(.day) .settings-field label { color: #6b7a99; }

  .settings-field input {
    background: #f5f6f8; border: 1px solid #e0e2ea; border-radius: 7px;
    padding: 0 12px; height: 36px; font-size: 12.5px; font-family: 'Inter', sans-serif;
    color: #111827; outline: none; transition: border-color 0.15s, box-shadow 0.15s; width: 100%;
  }
  .settings-field input:focus {
    border-color: #6366f1;
    box-shadow: 0 0 0 3px rgba(99,102,241,0.1);
  }
  .settings-field input::placeholder { color: #b0b3be; }
  .settings-field input:disabled { opacity: 0.4; cursor: not-allowed; }
  /* Dark mode inputs */
  .app:not(.day) .settings-field input {
    background: #1c2130; border-color: #2e3648;
    color: #e6eaf5;
  }
  .app:not(.day) .settings-field input:focus { border-color: #4a8fd4; box-shadow: none; }
  .app:not(.day) .settings-field input::placeholder { color: #364050; }

  .settings-hint { font-size: 11px; color: #9ca3af; margin-top: 2px; }
  .app:not(.day) .settings-hint { color: #364050; }

  .settings-divider { height: 1px; background: #eceef2; }
  .app:not(.day) .settings-divider { background: #1e2432; }

  .settings-footer {
    display: flex; align-items: center; justify-content: flex-end;
    gap: 8px; padding: 14px 20px; border-top: 1px solid #eceef2;
  }
  .app:not(.day) .settings-footer { border-top-color: #232a3a; }

  /* ── Messages ── */
  .settings-error {
    background: #fef2f2; border: 1px solid #fecaca;
    border-radius: 6px; padding: 9px 12px; font-size: 12px; color: #dc2626; line-height: 1.5;
  }
  .app:not(.day) .settings-error { background: #1a0e0e; border-color: #3a1a1a; color: #f0a0a0; }

  .settings-success {
    background: #f0fdf4; border: 1px solid #bbf7d0;
    border-radius: 6px; padding: 9px 12px; font-size: 12px; color: #16a34a; line-height: 1.5;
  }
  .app:not(.day) .settings-success { background: #0e1a12; border-color: #1a3a22; color: #6abf8a; }

  /* ── Avatar row ── */
  .settings-avatar-row { display: flex; align-items: center; gap: 14px; padding: 4px 0 8px; }

  .settings-avatar {
    width: 46px; height: 46px; background: #1d1d35; border-radius: 10px;
    display: flex; align-items: center; justify-content: center;
    font-size: 15px; font-weight: 700; color: #fff; letter-spacing: 0.3px; flex-shrink: 0;
  }

  .settings-avatar-info { display: flex; flex-direction: column; gap: 3px; }
  .settings-avatar-name  { font-size: 14px; font-weight: 500; letter-spacing: -0.2px; }
  .settings-avatar-email { font-size: 12px; color: #6b7280; }
  .app:not(.day) .settings-avatar-name  { color: #e6eaf5; }
  .app:not(.day) .settings-avatar-email { color: #6b7a99; }

  /* ── Danger zone ── */
  .danger-zone {
    border: 1px solid #fecaca; border-radius: 8px; padding: 14px 16px;
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    background: #fff;
  }
  .app:not(.day) .danger-zone { border-color: #3a1a1a; background: transparent; }

  .danger-zone-text { font-size: 12.5px; font-weight: 500; color: #111827; }
  .danger-zone-sub  { font-size: 11.5px; color: #6b7280; margin-top: 2px; }
  .app:not(.day) .danger-zone-text { color: #e6eaf5; }
  .app:not(.day) .danger-zone-sub  { color: #6b7a99; }

  .btn-danger-outline {
    padding: 0 14px; height: 30px; border-radius: 6px; background: #fef2f2;
    border: 1px solid #fecaca; color: #dc2626; font-size: 12px;
    font-family: 'Inter', sans-serif; font-weight: 500; cursor: pointer;
    transition: all 0.1s; white-space: nowrap; flex-shrink: 0;
  }
  .btn-danger-outline:hover { background: #fee2e2; border-color: #fca5a5; }
  .app:not(.day) .btn-danger-outline { background: transparent; border-color: #5a1a1a; color: #f0a0a0; }
  .app:not(.day) .btn-danger-outline:hover { background: #1a0e0e; border-color: #7a2020; }

  /* Footer buttons */
  .settings-btn-cancel {
    display: flex; align-items: center; gap: 6px;
    background: transparent; color: #6b7280; border: 1px solid #e0e2ea;
    border-radius: 7px; padding: 0 12px; height: 30px; font-size: 12px;
    font-family: 'Inter', sans-serif; font-weight: 500; cursor: pointer;
    transition: background 0.1s, color 0.1s;
  }
  .settings-btn-cancel:hover { background: #f5f6f8; color: #111827; }
  .app:not(.day) .settings-btn-cancel { color: #6b7a99; border-color: #2e3648; }
  .app:not(.day) .settings-btn-cancel:hover { background: #1f2535; color: #e6eaf5; }

  .settings-btn-save {
    display: flex; align-items: center; gap: 6px;
    background: #1d1d35; color: #ffffff; border: none;
    border-radius: 7px; padding: 0 14px; height: 30px; font-size: 12px;
    font-family: 'Inter', sans-serif; font-weight: 600; cursor: pointer;
    transition: opacity 0.15s;
  }
  .settings-btn-save:hover { opacity: 0.88; }
  .settings-btn-save:disabled { opacity: 0.4; cursor: not-allowed; }
  .app:not(.day) .settings-btn-save { background: #2a4a7a; color: #c8daf4; }
`;

function getInitials(name) {
  if (!name) return "?";
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

export function SettingsModal({ onClose }) {
  const { user, updateProfile, updateAvatar, removeAvatar, signOut } = useAuth();
  const [tab, setTab] = useState("profile");
  const fileInputRef = useRef(null);
  const [avatarUploading, setAvatarUploading] = useState(false);

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

  const handleAvatarFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    clearMessages();
    const result = await updateAvatar(file);
    setAvatarUploading(false);
    if (result.error) setError(result.error);
    else setSuccess("Profile picture updated");
    // reset input so same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleRemoveAvatar = async () => {
    setAvatarUploading(true);
    clearMessages();
    const result = await removeAvatar();
    setAvatarUploading(false);
    if (result.error) setError(result.error);
    else setSuccess("Profile picture removed");
  };

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
                  {/* Hidden file input */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    style={{ display: "none" }}
                    onChange={handleAvatarFile}
                  />
                  {/* Avatar with click-to-upload overlay */}
                  <div
                    onClick={() => !avatarUploading && fileInputRef.current?.click()}
                    style={{ position: "relative", width: 46, height: 46, flexShrink: 0, cursor: avatarUploading ? "wait" : "pointer" }}
                    title="Click to change photo"
                  >
                    <div className="settings-avatar" style={{ overflow: "hidden" }}>
                      {avatarUploading
                        ? <div style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
                        : user?.avatarUrl
                          ? <img src={user.avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          : getInitials(user?.name)
                      }
                    </div>
                    {/* Hover overlay */}
                    {!avatarUploading && (
                      <div style={{
                        position: "absolute", inset: 0, borderRadius: 10,
                        background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center",
                        opacity: 0, transition: "opacity 0.15s",
                      }}
                      onMouseEnter={e => e.currentTarget.style.opacity = 1}
                      onMouseLeave={e => e.currentTarget.style.opacity = 0}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                          <circle cx="12" cy="13" r="4"/>
                        </svg>
                      </div>
                    )}
                  </div>
                  <div className="settings-avatar-info">
                    <div className="settings-avatar-name">{user?.name}</div>
                    <div className="settings-avatar-email">{user?.email}</div>
                    <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={avatarUploading}
                        style={{ fontSize: 11, color: "var(--text-secondary, #6b7280)", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit", transition: "color 0.1s" }}
                        onMouseEnter={e => e.currentTarget.style.color = "var(--text-primary, #111827)"}
                        onMouseLeave={e => e.currentTarget.style.color = "var(--text-secondary, #6b7280)"}
                      >
                        {user?.avatarUrl ? "Change photo" : "Upload photo"}
                      </button>
                      {user?.avatarUrl && (
                        <>
                          <span style={{ fontSize: 11, color: "var(--text-muted, #b0b3be)" }}>·</span>
                          <button
                            onClick={handleRemoveAvatar}
                            disabled={avatarUploading}
                            style={{ fontSize: 11, color: "var(--text-secondary, #6b7280)", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit", transition: "color 0.1s" }}
                            onMouseEnter={e => e.currentTarget.style.color = "#dc2626"}
                            onMouseLeave={e => e.currentTarget.style.color = "var(--text-secondary, #6b7280)"}
                          >
                            Remove
                          </button>
                        </>
                      )}
                    </div>
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
              <button className="settings-btn-cancel" onClick={onClose}>Cancel</button>
              <button
                className="settings-btn-save"
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
