import logo from "@/assets/boteco.png";

interface LogoProps {
  showText?: boolean;
  size?: "sm" | "md" | "lg";
}

// o logo do Boteco é quase quadrado (≈1,3:1); recolhido, mostra só a letra num quadradinho
const largura = { sm: 52, md: 96, lg: 170 };

export function Logo({ showText = true, size = "md" }: LogoProps) {
  if (!showText)
    return (
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#e3262e] text-lg font-extrabold text-white select-none" aria-label="Boteco Online">B</span>
    );
  return <img src={logo} alt="Boteco Online" width={largura[size]} className="block h-auto object-contain" draggable={false} />;
}

export function SidebarToggleIcon({ className }: { className?: string }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M2 11C2 7.22876 2 5.34315 3.17157 4.17157C4.34315 3 6.22876 3 10 3H14C17.7712 3 19.6569 3 20.8284 4.17157C22 5.34315 22 7.22876 22 11V13C22 16.7712 22 18.6569 20.8284 19.8284C19.6569 21 17.7712 21 14 21H10C6.22876 21 4.34315 21 3.17157 19.8284C2 18.6569 2 16.7712 2 13V11Z" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M15 21L15 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}
