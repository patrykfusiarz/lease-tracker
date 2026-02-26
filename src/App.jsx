import { AuthProvider, useAuth } from "./auth";
import { AuthPage } from "./AuthPages";
import LeaseTracker from "./LeaseTracker";

function AppRouter() {
  const { user, loading } = useAuth();

  if (loading) return (
    <div style={{ minHeight:"100vh", background:"#0d1018", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ width:28, height:28, border:"2px solid #1e2432", borderTopColor:"#3b6fd4", borderRadius:"50%", animation:"spin 0.7s linear infinite" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  return user ? <LeaseTracker /> : <AuthPage />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  );
}
