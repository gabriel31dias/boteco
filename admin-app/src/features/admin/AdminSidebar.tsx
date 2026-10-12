import { ConfiguracoesIcon, ContasIcon, DashboardIcon, RankingIcon, SaquesIcon, VendasIcon } from "@/shared/components/icons/SidebarIcons";
import { Logo, SidebarToggleIcon } from "@/shared/components/Logo";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";
import { Banknote, Clapperboard, Gift, Handshake, Link2, Megaphone, Radio, ShieldAlert } from "lucide-react";
import type { ComponentType } from "react";
import { Link, useLocation } from "react-router-dom";

interface AdminSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  onLogout: () => void;
}

interface MenuItem {
  icon: ComponentType<{ className?: string; color?: string }>;
  label: string;
  path: string;
}

export const adminMenuItems: MenuItem[] = [
  { icon: DashboardIcon, label: "Dashboard", path: "/dashboard" },
  { icon: ({ className, color }) => <Radio size={24} strokeWidth={1.8} className={className} color={color} />, label: "Ao vivo", path: "/ao-vivo" },
  { icon: VendasIcon, label: "Depósitos", path: "/depositos" },
  { icon: SaquesIcon, label: "Saques", path: "/saques" },
  { icon: RankingIcon, label: "Partidas", path: "/partidas" },
  { icon: ({ className, color }) => <Clapperboard size={24} strokeWidth={1.8} className={className} color={color} />, label: "Gravações", path: "/gravacoes" },
  { icon: ContasIcon, label: "Jogadores", path: "/jogadores" },
  { icon: ({ className, color }) => <Gift size={24} strokeWidth={1.8} className={className} color={color} />, label: "Bônus", path: "/bonus" },
  { icon: ({ className, color }) => <Link2 size={24} strokeWidth={1.8} className={className} color={color} />, label: "Links de bônus", path: "/bonus/links" },
  { icon: ({ className, color }) => <Handshake size={24} strokeWidth={1.8} className={className} color={color} />, label: "Indicações", path: "/indicacoes" },
  { icon: ({ className, color }) => <Megaphone size={24} strokeWidth={1.8} className={className} color={color} />, label: "Influencers", path: "/influencers" },
  { icon: ({ className, color }) => <Banknote size={24} strokeWidth={1.8} className={className} color={color} />, label: "Saques de influencers", path: "/influencers/saques" },
  { icon: ({ className, color }) => <ShieldAlert size={24} strokeWidth={1.8} className={className} color={color} />, label: "Moderação", path: "/moderacao" },
  { icon: ConfiguracoesIcon, label: "Configurações", path: "/configuracoes" },
];

export function AdminSidebar({ collapsed, onToggle, onLogout }: AdminSidebarProps) {
  const location = useLocation();

  return (
    <aside className={cn("fixed left-0 top-0 h-screen dark-sidebar transition-all duration-300 flex flex-col overflow-y-auto z-40", collapsed ? "w-20" : "w-64")}>
      {/* Header */}
      <div className={cn("flex items-center h-20 px-4", collapsed ? "justify-center gap-0" : "justify-between")}>
        <Logo showText={!collapsed} size={collapsed ? "sm" : "md"} />
        {!collapsed && (
          <Button variant="ghost" size="icon" onClick={onToggle} className="text-[#9B5BF8] hover:bg-primary/10" aria-label="Recolher menu">
            <SidebarToggleIcon />
          </Button>
        )}
      </div>
      {collapsed && (
        <Button variant="ghost" size="icon" onClick={onToggle} className="mx-auto text-[#9B5BF8] hover:bg-primary/10" aria-label="Abrir menu">
          <SidebarToggleIcon />
        </Button>
      )}

      {/* Menu Label */}
      {!collapsed && (
        <div className="px-6 py-4">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Menu</span>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 px-3 py-2 space-y-1 min-h-0 overflow-y-auto">
        {adminMenuItems.map((item) => {
          const isActive = location.pathname === item.path || (["/gravacoes", "/ao-vivo"].includes(item.path) && location.pathname.startsWith(`${item.path}/`));
          return (
            <Link
              key={item.path}
              to={item.path}
              title={collapsed ? item.label : undefined}
              className={cn(
                "flex items-center gap-[10px] px-[17px] py-2.5 rounded-lg transition-all duration-200",
                collapsed && "justify-center px-0",
                isActive
                  ? "bg-[rgba(204,8,84,0.05)] dark:bg-primary/10 text-[#9B5BF8]"
                  : "text-[#986780] dark:text-white hover:bg-[rgba(204,8,84,0.05)] dark:hover:bg-primary/10"
              )}
            >
              <item.icon color="#9B5BF8" />
              {!collapsed && (
                <span className={cn("font-medium text-[16px] leading-[20px] whitespace-nowrap", isActive ? "text-[#9B5BF8]" : "text-[#986780] dark:text-white")}>{item.label}</span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="p-4 border-t border-sidebar-border mt-auto">
        <button
          onClick={onLogout}
          className={cn("flex items-center gap-3 px-4 py-3 w-full rounded-xl text-destructive hover:bg-destructive/10 transition-colors", collapsed && "justify-center")}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M9 4.5H8C5.64298 4.5 4.46447 4.5 3.73223 5.23223C3 5.96447 3 7.14298 3 9.5V14.5C3 16.857 3 18.0355 3.73223 18.7678C4.46447 19.5 5.64298 19.5 8 19.5H9" stroke="#9B5BF8" strokeWidth="1.5" />
            <path d="M9 6.4764C9 4.18259 9 3.03569 9.70725 2.4087C10.4145 1.78171 11.4955 1.97026 13.6576 2.34736L15.9864 2.75354C18.3809 3.17118 19.5781 3.37999 20.2891 4.25826C21 5.13652 21 6.40672 21 8.94711V15.0529C21 17.5933 21 18.8635 20.2891 19.7417C19.5781 20.62 18.3809 20.8288 15.9864 21.2465L13.6576 21.6526C11.4955 22.0297 10.4145 22.2183 9.70725 21.5913C9 20.9643 9 19.8174 9 17.5236V6.4764Z" stroke="#9B5BF8" strokeWidth="1.5" />
            <path d="M12 11V13" stroke="#9B5BF8" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          {!collapsed && <span className="font-medium text-lg text-[rgba(84,5,45,0.6)] dark:text-muted-foreground">Sair</span>}
        </button>
      </div>
    </aside>
  );
}
