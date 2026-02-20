import { useState } from "react";
import { useNavigate } from "react-router-dom";

interface LoginProps {
  onSignIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  onResetPassword: (email: string) => Promise<{ error: Error | null }>;
}

export function Login({ onSignIn, onResetPassword }: LoginProps) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await onSignIn(email, password);
    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      navigate("/", { replace: true });
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await onResetPassword(email);
    if (error) {
      setError(error.message);
    } else {
      setResetSent(true);
    }
    setLoading(false);
  };

  if (showReset) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <span className="text-4xl">{"\u2708\uFE0F"}</span>
            <h1 className="mt-2 text-2xl font-bold text-gray-900">
              Reset Password
            </h1>
          </div>

          {resetSent ? (
            <div className="bg-green-50 text-green-700 p-4 rounded-lg text-sm text-center">
              Check your email for a password reset link.
            </div>
          ) : (
            <form onSubmit={handleReset} className="space-y-4">
              {error && (
                <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm">
                  {error}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2 px-4 bg-brand-600 text-white font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors"
              >
                {loading ? "Sending..." : "Send reset link"}
              </button>
            </form>
          )}

          <button
            onClick={() => {
              setShowReset(false);
              setResetSent(false);
              setError(null);
            }}
            className="mt-4 w-full text-center text-sm text-gray-500 hover:text-gray-700"
          >
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <span className="text-4xl">{"\u2708\uFE0F"}</span>
          <h1 className="mt-2 text-2xl font-bold text-gray-900">
            Calendar Helper
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Sign in to view your travel timeline
          </p>
        </div>

        <form onSubmit={handleSignIn} className="space-y-4">
          {error && (
            <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm">
              {error}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
              placeholder="you@example.com"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
              placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-4 bg-brand-600 text-white font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <button
          onClick={() => {
            setShowReset(true);
            setError(null);
          }}
          className="mt-4 w-full text-center text-sm text-gray-500 hover:text-gray-700"
        >
          Forgot password?
        </button>
      </div>
    </div>
  );
}
