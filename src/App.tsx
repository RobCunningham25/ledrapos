import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { VenueProvider } from "@/contexts/VenueContext";
import { POSAuthProvider } from "@/contexts/POSAuthContext";
import { CartProvider } from "@/contexts/CartContext";
import { PortalAuthProvider } from "@/contexts/PortalAuthContext";
import Index from "./pages/Index.tsx";
import POS from "./pages/POS.tsx";
import NotFound from "./pages/NotFound.tsx";
import Products from "./pages/admin/Products.tsx";
import Members from "./pages/admin/Members.tsx";
import Reports from "./pages/admin/Reports.tsx";
import Settings from "./pages/admin/Settings.tsx";
import PortalLogin from "./pages/portal/PortalLogin.tsx";
import PortalProtectedRoute from "./components/portal/PortalProtectedRoute.tsx";
import PortalLayout from "./components/portal/PortalLayout.tsx";
import PortalBarTab from "./pages/portal/PortalBarTab.tsx";
import PortalCalendar from "./pages/portal/PortalCalendar.tsx";
import PortalMyDetails from "./pages/portal/PortalMyDetails.tsx";
import PortalBookings from "./pages/portal/PortalBookings.tsx";
import PortalPaymentResult from "./pages/portal/PortalPaymentResult.tsx";

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
                <Route path="/admin/reports" element={<Reports />} />
                <Route path="/admin/settings" element={<Settings />} />
                <Route path="/portal/login" element={<PortalLogin />} />
                <Route path="/portal" element={<PortalProtectedRoute />}>
                  <Route element={
                    <PortalAuthProvider>
                      <PortalLayout />
                    </PortalAuthProvider>
                  }>
                    <Route index element={<PortalBarTab />} />
                    <Route path="calendar" element={<PortalCalendar />} />
                    <Route path="my-details" element={<PortalMyDetails />} />
                    <Route path="bookings" element={<PortalBookings />} />
                  </Route>
                </Route>
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
