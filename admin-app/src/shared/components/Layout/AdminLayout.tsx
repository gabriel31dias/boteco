import { AdminSidebar } from "@/features/admin/AdminSidebar";
import { Header } from "@/shared/components/Layout/Header";
import { sair, session } from "@/shared/lib/api";
import { useTheme } from "@/shared/stores/theme";
import { cn } from "@/shared/lib/utils";
import { useState } from "react";
import { Navigate, Outlet, useNavigate } from "react-router-dom";

// sidebar fixa + coluna com header e página
export function AdminLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => window.innerWidth < 900);
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  if (!session.token()) return <Navigate to="/login" replace />;
  if (session.user()?.papel === "influencer") return <Navigate to="/influencer" replace />;

  const logout = () => {
    sair();
    navigate("/login", { replace: true });
  };

  return (
    <div className={cn("grid min-h-screen transition-all duration-300", sidebarCollapsed ? "grid-cols-[80px_minmax(0,1fr)]" : "grid-cols-[256px_minmax(0,1fr)]")}>
      <AdminSidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} onLogout={logout} />
      <div className="col-start-2 flex flex-col gap-8 min-h-screen p-4 sm:p-8">
        <Header user={session.user()} onLogout={logout} theme={theme} onToggleTheme={toggleTheme} />
        <main className="flex-1 pb-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
