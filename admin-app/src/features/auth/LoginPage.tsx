import { Logo } from "@/shared/components/Logo";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { post, sair, session } from "@/shared/lib/api";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import sinuca from "@/assets/boteco.png";

const inputCls =
  "h-12 rounded-xl border-[#E5E7EB] bg-[#FBFBFC] px-4 text-sm font-medium text-[#1F1F24] placeholder:text-[#8C8C96] focus-visible:ring-[#9B5BF8] [&:-webkit-autofill]:[box-shadow:0_0_0_1000px_#FBFBFC_inset]";

type Login = { token: string; profile: { name: string; email: string; avatarUrl?: string | null; isAdmin?: boolean; isInfluencer?: boolean } };

// arte à esquerda, cartão de login à direita
export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const root = document.documentElement;
    const antes = root.className;
    root.classList.remove("dark");
    root.classList.add("light");
    return () => { root.className = antes; };
  }, []);

  if (session.token()) return <Navigate to={session.user()?.papel === "influencer" ? "/influencer" : "/dashboard"} replace />;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    setIsLoading(true);
    setError("");
    try {
      const r = await post<Login>("/login", { email: email.trim(), password: senha });
      const p = r.profile;
      // a mesma conta pode ser as duas coisas: admin tem prioridade
      const papel = p.isAdmin ? "admin" : p.isInfluencer ? "influencer" : null;
      session.save(r.token, { nome: p.name, email: p.email, avatarUrl: p.avatarUrl, papel: papel ?? undefined });
      if (!papel) {
        sair();
        throw new Error("Essa conta não tem acesso ao painel.");
      }
      navigate(papel === "influencer" ? "/influencer" : "/dashboard", { replace: true });
    } catch (err) {
      session.clear();
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F7FA] text-[#1F1F24] lg:grid lg:grid-cols-[minmax(0,1.08fr)_minmax(440px,0.92fr)]">
      <div className="relative hidden min-h-screen overflow-hidden lg:block bg-[radial-gradient(120%_90%_at_20%_10%,#3b1a7a_0%,#1b0f3a_45%,#0c0818_100%)]">
        <img src={sinuca} alt="" aria-hidden className="absolute -right-24 top-1/2 w-[85%] -translate-y-1/2 opacity-[0.07] select-none" draggable={false} />
        <div className="absolute left-12 top-10">
          <Logo size="lg" />
        </div>
        <div className="absolute bottom-12 left-12 max-w-[520px]">
          <h1 className="text-5xl font-bold leading-tight text-white">Painel Boteco Online</h1>
          <p className="mt-5 max-w-[440px] text-base font-medium leading-7 text-white/70">
            Acompanhe depósitos, saques, partidas e a taxa da casa de cada jogo em um só lugar.
          </p>
        </div>
      </div>

      <div className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8 lg:px-12">
        <div className="w-full max-w-[460px] animate-fade-in">
          <div className="mb-10 lg:hidden">
            <Logo size="md" />
          </div>
          <div className="mb-9">
            <h1 className="text-3xl font-bold leading-tight text-[#1F1F24] sm:text-4xl">Faça login</h1>
            <p className="mt-3 text-sm font-medium leading-6 text-[#73737D]">Área restrita a administradores e influencers parceiros.</p>
          </div>

          <div className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-[0_18px_60px_rgba(31,31,36,0.08)] sm:p-8">
            <form onSubmit={onSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-semibold leading-[140%] text-[#1F1F24]">E-mail</Label>
                <Input id="email" type="email" autoComplete="username" placeholder="exemplo@gmail.com" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} disabled={isLoading} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="senha" className="text-sm font-semibold leading-[140%] text-[#1F1F24]">Senha</Label>
                <div className="relative">
                  <Input id="senha" autoComplete="current-password" type={showPassword ? "text" : "password"} placeholder="Digite sua senha" className={`${inputCls} pr-12`} value={senha} onChange={(e) => setSenha(e.target.value)} disabled={isLoading} required />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Esconder senha" : "Mostrar senha"} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#9B5BF8] transition-colors hover:text-[#884BE0]">
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg" role="alert">
                  <p className="text-sm text-destructive text-center">{error}</p>
                </div>
              )}

              <Button type="submit" disabled={isLoading} className="h-12 w-full rounded-xl border border-[#9B5BF8]/10 bg-[#9B5BF8] px-6 py-3 text-base font-bold leading-[140%] text-white shadow-sm shadow-[#9B5BF8]/25 transition-colors hover:bg-[#884BE0]">
                {isLoading ? (<><Loader2 className="mr-2 h-5 w-5 animate-spin" />Entrando...</>) : "Entrar"}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
