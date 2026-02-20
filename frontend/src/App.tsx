import { Routes, Route } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Layout } from "@/components/Layout";
import { Login } from "@/pages/Login";
import { ResetPassword } from "@/pages/ResetPassword";
import { Dashboard } from "@/pages/Dashboard";
import { Timeline } from "@/pages/Timeline";
import { Profile } from "@/pages/Profile";

export default function App() {
  const { user, loading, signIn, signOut, updatePassword, resetPassword } =
    useAuth();

  return (
    <Routes>
      {/* Public routes */}
      <Route
        path="/login"
        element={<Login onSignIn={signIn} onResetPassword={resetPassword} />}
      />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* Protected routes with layout */}
      <Route
        element={
          <ProtectedRoute user={user} loading={loading}>
            <Layout user={user!} onSignOut={signOut} />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard userId={user?.id ?? ""} />} />
        <Route
          path="/timeline"
          element={<Timeline userId={user?.id ?? ""} />}
        />
        <Route
          path="/profile"
          element={
            <Profile
              userId={user?.id ?? ""}
              onUpdatePassword={updatePassword}
            />
          }
        />
      </Route>
    </Routes>
  );
}
