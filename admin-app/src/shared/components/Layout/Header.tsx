import { adminMenuItems } from "@/features/admin/AdminSidebar";
import { ThemeToggle } from "@/shared/components/ThemeToggle";
import { Avatar, AvatarFallback } from "@/shared/components/ui/avatar";
import { Button } from "@/shared/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/shared/components/ui/dropdown-menu";
import type { AdminUser } from "@/shared/lib/api";
import { ChevronDown, LogOut } from "lucide-react";
import { useLocation } from "react-router-dom";

// ícone + título da página, menu do usuário e troca de tema
export function Header({ user, onLogout, theme, onToggleTheme }: { user: AdminUser | null; onLogout: () => void; theme: "light" | "dark"; onToggleTheme: () => void }) {
  const location = useLocation();
  // A mais longa que casa: /gravacoes/12 é "Gravações", /bonus/links não é "Bônus".
  const item = adminMenuItems
    .filter((m) => location.pathname === m.path || location.pathname.startsWith(`${m.path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0] ?? adminMenuItems[0];
  const titulo = item.path === "/dashboard" ? "Dashboard Administrativo" : item.label;

  return (
    <header className="h-12">
      <div className="flex items-center justify-between h-full gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <item.icon color="#9B5BF8" />
          <span className="text-xl sm:text-2xl font-bold text-[#54052D] dark:text-[#FFFFFF] leading-tight truncate">{titulo}</span>
        </div>

        <div className="flex items-center gap-4">
          <svg width="2" height="13" viewBox="0 0 2 13" fill="none" className="hidden sm:block">
            <rect width="2" height="13" rx="1" fill="#9B5BF8" />
          </svg>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="flex items-center justify-between bg-white hover:bg-white dark:bg-[rgba(255,255,255,0.03)] rounded-full gap-2 py-2 px-3 outline-none focus-visible:ring-0 focus-visible:ring-offset-0">
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="bg-primary/10 text-[#54052D] dark:text-white text-base font-medium">{user?.nome?.charAt(0) || "A"}</AvatarFallback>
                </Avatar>
                <span className="text-primary dark:text-white hidden sm:inline">{user?.nome?.split(" ")[0]}</span>
                <ChevronDown className="h-4 w-4 text-[#9B5BF8]" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[220px] bg-white dark:bg-[#0C0E19] shadow-[0px_4px_55px_rgba(0,0,0,0.08)] dark:shadow-[0px_4px_55px_rgba(0,0,0,0.5)] rounded-[15px] p-4 border-0">
              <div className="px-4 pb-3 text-xs text-muted-foreground truncate">{user?.email}</div>
              <DropdownMenuItem
                onClick={onLogout}
                className="flex items-center gap-3 px-4 py-3 font-normal text-[16px] leading-[20px] text-[rgba(84,5,45,0.6)] dark:text-[rgba(255,255,255,0.6)] hover:bg-[rgba(204,8,84,0.05)] dark:hover:bg-[rgba(204,8,84,0.15)] rounded-lg cursor-pointer focus:bg-[rgba(204,8,84,0.05)] dark:focus:bg-[rgba(204,8,84,0.15)]"
              >
                <LogOut className="h-5 w-5 text-[#9B5BF8]" />
                Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        </div>
      </div>
    </header>
  );
}
