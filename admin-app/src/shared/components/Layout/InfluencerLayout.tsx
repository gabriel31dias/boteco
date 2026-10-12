import { Logo } from "@/shared/components/Logo";
import { ThemeToggle } from "@/shared/components/ThemeToggle";
import { sair, session } from "@/shared/lib/api";
import { useTheme } from "@/shared/stores/theme";
import { LogOut } from "lucide-react";
import { Navigate, Outlet, useNavigate } from "react-router-dom";

// painel do influencer: sem o menu do admin, só o logo, o nome e o dashboard dele
export function InfluencerLayout() {
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const user = session.user();
  if (!session.token()) return <Navigate to="/login" replace />;
  if (user?.papel !== "influencer") return <Navigate to="/dashboard" replace />;

  const logout = () => {
    sair();
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen p-4 sm:p-8 max-w-6xl mx-auto flex flex-col gap-8">
      <header className="flex items-center justify-between gap-4">
        <Logo size="md" />
        <div className="flex items-center gap-3">
          <span className="hidden sm:inline text-sm text-muted-foreground">{user?.email}</span>
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
          <button onClick={logout} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full border border-border text-sm hover:bg-muted"><LogOut className="h-4 w-4" />Sair</button>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
