import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { VenueProvider } from "@/contexts/VenueContext";
import { POSAuthProvider } from "@/contexts/POSAuthContext";
import Index from "./pages/Index.tsx";
import POS from "./pages/POS.tsx";
import Admin from "./pages/Admin.tsx";
import MemberPortal from "./pages/MemberPortal.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <VenueProvider>
        <POSAuthProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/pos" element={<POS />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="/member-portal" element={<MemberPortal />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </POSAuthProvider>
      </VenueProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
