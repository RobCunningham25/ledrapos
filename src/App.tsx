import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { VenueProvider } from "@/contexts/VenueContext";
import { POSAuthProvider } from "@/contexts/POSAuthContext";
import { CartProvider } from "@/contexts/CartContext";
import Index from "./pages/Index.tsx";
import POS from "./pages/POS.tsx";
import MemberPortal from "./pages/MemberPortal.tsx";
import NotFound from "./pages/NotFound.tsx";
import Products from "./pages/admin/Products.tsx";
import Members from "./pages/admin/Members.tsx";
import { ReportsPlaceholder, SettingsPlaceholder } from "./pages/admin/Placeholder.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <VenueProvider>
        <POSAuthProvider>
          <CartProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/pos" element={<POS />} />
                <Route path="/admin" element={<Navigate to="/admin/products" replace />} />
                <Route path="/admin/products" element={<Products />} />
                <Route path="/admin/members" element={<Members />} />
                <Route path="/admin/reports" element={<ReportsPlaceholder />} />
                <Route path="/admin/settings" element={<SettingsPlaceholder />} />
                <Route path="/member-portal" element={<MemberPortal />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </CartProvider>
        </POSAuthProvider>
      </VenueProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
