import { useEffect, useState } from "react";

type Theme = "light" | "dark";
const KEY = "joggpix_admin_theme";

// ponytail: a loja usa zustand; aqui um hook basta (um único botão troca o tema)
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem(KEY) as Theme) || "dark");
  useEffect(() => {
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(theme);
    localStorage.setItem(KEY, theme);
  }, [theme]);
  return { theme, toggleTheme: () => setTheme((t) => (t === "dark" ? "light" : "dark")) };
}
