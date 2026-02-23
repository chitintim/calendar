import { NavLink, Outlet } from "react-router-dom";
import type { User } from "@supabase/supabase-js";

interface LayoutProps {
  user: User;
  onSignOut: () => void;
}

const navItems = [
  { to: "/", label: "Home", icon: "\uD83C\uDFE0" },
  { to: "/timeline", label: "Timeline", icon: "\uD83D\uDCC5" },
  { to: "/groups", label: "Groups", icon: "\uD83D\uDC65" },
  { to: "/chat", label: "Chat", icon: "\uD83D\uDCAC" },
  { to: "/profile", label: "Profile", icon: "\uD83D\uDC64" },
];

export function Layout({ onSignOut }: LayoutProps) {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Top header — slim on mobile, full nav on desktop */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 h-12 md:h-14 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <span className="text-xl">{"\u2708\uFE0F"}</span>
            <span className="font-semibold text-gray-800">Calendar Helper</span>
          </div>

          {/* Desktop nav — hidden on mobile */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-brand-50 text-brand-700"
                      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                  }`
                }
              >
                <span className="mr-1">{item.icon}</span>
                {item.label}
              </NavLink>
            ))}
            <button
              onClick={onSignOut}
              className="ml-2 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
            >
              Sign out
            </button>
          </nav>
        </div>
      </header>

      {/* Page content — bottom padding for mobile nav */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-4 md:py-6 pb-20 md:pb-6">
        <Outlet context={{ onSignOut }} />
      </main>

      {/* Mobile bottom tab bar */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-white border-t border-gray-200 pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center justify-around h-14">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center flex-1 h-full transition-colors ${
                  isActive
                    ? "text-brand-600"
                    : "text-gray-400"
                }`
              }
            >
              <span className="text-xl leading-none">{item.icon}</span>
              <span className="text-[10px] font-medium mt-0.5">{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
