import { Moon, Sun } from "lucide-react";
import { Button } from "@/shared/components/ui/button";

export function ThemeToggle({ theme, onToggle }: { theme: "light" | "dark"; onToggle: () => void }) {
  return (
    <Button variant="ghost" size="icon" onClick={onToggle} className="hover:bg-primary/10">
      {theme === "dark" ? <Sun className="h-5 w-5 text-[#9B5BF8]" /> : <Moon className="h-5 w-5 text-[#9B5BF8]" />}
      <span className="sr-only">Trocar tema</span>
    </Button>
  );
}
