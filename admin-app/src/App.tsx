import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { AoVivoPage } from "@/features/admin/aovivo/AoVivoPage";
import { BonusLinksPage } from "@/features/admin/bonus/BonusLinksPage";
import { BonusPage } from "@/features/admin/bonus/BonusPage";
import { ConfiguracoesPage } from "@/features/admin/config/ConfiguracoesPage";
import { DashboardPage } from "@/features/admin/dashboard/DashboardPage";
import { AoVivoTelaPage } from "@/features/admin/aovivo/AoVivoTelaPage";
import { GravacaoPage } from "@/features/admin/gravacoes/GravacaoPage";
import { GravacoesPage } from "@/features/admin/gravacoes/GravacoesPage";
import { DepositosPage } from "@/features/admin/depositos/DepositosPage";
import { IndicacoesPage } from "@/features/admin/indicacoes/IndicacoesPage";
import { InfluencerSaquesPage } from "@/features/admin/influencers/InfluencerSaquesPage";
import { InfluencersPage } from "@/features/admin/influencers/InfluencersPage";
import { JogadoresPage } from "@/features/admin/jogadores/JogadoresPage";
import { ModeracaoPage } from "@/features/admin/moderacao/ModeracaoPage";
import { PartidasPage } from "@/features/admin/partidas/PartidasPage";
import { SaquesPage } from "@/features/admin/saques/SaquesPage";
import { LoginPage } from "@/features/auth/LoginPage";
import { InfluencerDashboardPage } from "@/features/influencer/InfluencerDashboardPage";
import { AdminLayout } from "@/shared/components/Layout/AdminLayout";
import { InfluencerLayout } from "@/shared/components/Layout/InfluencerLayout";

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });

// HashRouter: o nginx não precisa de fallback de SPA em /admin/
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<AdminLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/ao-vivo" element={<AoVivoPage />} />
            <Route path="/ao-vivo/:id" element={<AoVivoTelaPage />} />
            <Route path="/depositos" element={<DepositosPage />} />
            <Route path="/saques" element={<SaquesPage />} />
            <Route path="/partidas" element={<PartidasPage />} />
            <Route path="/gravacoes" element={<GravacoesPage />} />
            <Route path="/gravacoes/:id" element={<GravacaoPage />} />
            <Route path="/jogadores" element={<JogadoresPage />} />
            <Route path="/bonus" element={<BonusPage />} />
            <Route path="/bonus/links" element={<BonusLinksPage />} />
            <Route path="/indicacoes" element={<IndicacoesPage />} />
            <Route path="/influencers" element={<InfluencersPage />} />
            <Route path="/influencers/saques" element={<InfluencerSaquesPage />} />
            <Route path="/moderacao" element={<ModeracaoPage />} />
            <Route path="/configuracoes" element={<ConfiguracoesPage />} />
          </Route>
          <Route element={<InfluencerLayout />}>
            <Route path="/influencer" element={<InfluencerDashboardPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </HashRouter>
      <Toaster richColors position="top-right" />
    </QueryClientProvider>
  );
}
