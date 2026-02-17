import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import ReportingJournalier from "./pages/ReportingJournalier";
import SortiesFerme from "./pages/SortiesFerme";
import Fournisseurs from "./pages/Fournisseurs";
import LivraisonsAliment from "./pages/LivraisonsAliment";
import ProduitsVeterinaires from "./pages/ProduitsVeterinaires";
import ProduitsHygiene from "./pages/ProduitsHygiene";
import LivraisonsPaille from "./pages/LivraisonsPaille";
import Electricite from "./pages/Electricite";
import LivraisonGaz from "./pages/LivraisonGaz";
import MainOeuvre from "./pages/MainOeuvre";
import DepensesDivers from "./pages/DepensesDivers";
import Employes from "./pages/Employes";
import Utilisateurs from "./pages/Utilisateurs";
import Profile from "./pages/Profile";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Navigate to="/auth" replace />} />
            <Route path="/auth" element={<Auth />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/reporting-journalier"
              element={
                <ProtectedRoute>
                  <ReportingJournalier />
                </ProtectedRoute>
              }
            />
            <Route
              path="/sorties-ferme"
              element={
                <ProtectedRoute>
                  <SortiesFerme />
                </ProtectedRoute>
              }
            />
            <Route
              path="/fournisseurs"
              element={
                <ProtectedRoute>
                  <Fournisseurs />
                </ProtectedRoute>
              }
            />
            <Route
              path="/livraisons-aliment"
              element={
                <ProtectedRoute>
                  <LivraisonsAliment />
                </ProtectedRoute>
              }
            />
            <Route
              path="/produits-veterinaires"
              element={
                <ProtectedRoute>
                  <ProduitsVeterinaires />
                </ProtectedRoute>
              }
            />
            <Route
              path="/produits-hygiene"
              element={
                <ProtectedRoute>
                  <ProduitsHygiene />
                </ProtectedRoute>
              }
            />
            <Route
              path="/livraisons-paille"
              element={
                <ProtectedRoute>
                  <LivraisonsPaille />
                </ProtectedRoute>
              }
            />
            <Route
              path="/livraisons-paille/"
              element={
                <ProtectedRoute>
                  <LivraisonsPaille />
                </ProtectedRoute>
              }
            />
            <Route
              path="/electricite"
              element={
                <ProtectedRoute>
                  <Electricite />
                </ProtectedRoute>
              }
            />
            <Route
              path="/livraisons-gaz"
              element={
                <ProtectedRoute>
                  <LivraisonGaz />
                </ProtectedRoute>
              }
            />
            <Route
              path="/main-oeuvre"
              element={
                <ProtectedRoute>
                  <MainOeuvre />
                </ProtectedRoute>
              }
            />
            <Route
              path="/main-oeuvre/"
              element={
                <ProtectedRoute>
                  <MainOeuvre />
                </ProtectedRoute>
              }
            />
            <Route
              path="/depenses-divers"
              element={
                <ProtectedRoute>
                  <DepensesDivers />
                </ProtectedRoute>
              }
            />
            <Route
              path="/depenses-divers/"
              element={
                <ProtectedRoute>
                  <DepensesDivers />
                </ProtectedRoute>
              }
            />
            <Route
              path="/employes"
              element={
                <ProtectedRoute>
                  <Employes />
                </ProtectedRoute>
              }
            />
            <Route
              path="/utilisateurs"
              element={
                <ProtectedRoute>
                  <Utilisateurs />
                </ProtectedRoute>
              }
            />
            <Route
              path="/profil"
              element={
                <ProtectedRoute>
                  <Profile />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
