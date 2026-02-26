import { useState } from "react";
import { AuthProvider, useAuth } from "./auth";
import { LoginPage, SignUpPage } from "./AuthPages";
import LeaseTracker from "./LeaseTracker";

function AppRouter() {
  const { user, loading } = useAuth();
  const [authView, setAuthView] = useState("login"); // "login" | "signup"

  if (loading) {
    return (
      <div style={{
        minHeight: "100vh",
        background: "#0e1117",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}>
        <div style={{
          width: 28,
          height: 28,
          border: "2px solid #1e2432",
          borderTopColor: "#4a8fd4",
          borderRadius: "50%",
          animation: "spin 0.7s linear infinite",
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!user) {
    return authView === "login"
      ? <LoginPage  onSwitch={() => setAuthView("signup")} />
      : <SignUpPage onSwitch={() => setAuthView("login")}  />;
  }

  return <LeaseTracker />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  );
}
