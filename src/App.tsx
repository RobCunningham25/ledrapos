import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { VenueProvider } from "@/contexts/VenueContext";
import { POSAuthProvider } from "@/contexts/POSAuthContext";
import { CartProvider } from "@/contexts/CartContext";
import { PortalAuthProvider } from "@/contexts/PortalAuthContext";
import { AdminAuthProvider } from "@/contexts/AdminAuthContext";
import Index from "./pages/Index.tsx";
import POS from "./pages/POS.tsx";
import NotFound from "./pages/NotFound.tsx";
import AdminLogin from "./pages/admin/AdminLogin.tsx";
import AdminProtectedRoute from "./components/admin/AdminProtectedRoute.tsx";
import Products from "./pages/admin/Products.tsx";
import Members from "./pages/admin/Members.tsx";
import MemberDetail from "./pages/admin/MemberDetail.tsx";
import Reports from "./pages/admin/Reports.tsx";
import Settings from "./pages/admin/Settings.tsx";
import Events from "./pages/admin/Events.tsx";
import AdminBookings from "./pages/admin/Bookings.tsx";
import PortalLogin from "./pages/portal/PortalLogin.tsx";
import PortalProtectedRoute from "./components/portal/PortalProtectedRoute.tsx";
import PortalLayout from "./components/portal/PortalLayout.tsx";
import PortalBarTab from "./pages/portal/PortalBarTab.tsx";
import PortalDashboard from "./pages/portal/PortalDashboard.tsx";
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
                <Route path="/admin/login" element={<AdminLogin />} />
                <Route path="/admin" element={
                  <AdminAuthProvider>
                    <AdminProtectedRoute />
                  </AdminAuthProvider>
                }>
                  <Route index element={<Navigate to="/admin/products" replace />} />
                  <Route path="products" element={<Products />} />
                  <Route path="members" element={<Members />} />
                  <Route path="members/:id" element={<MemberDetail />} />
                  <Route path="reports" element={<Reports />} />
                  <Route path="events" element={<Events />} />
                  <Route path="settings" element={<Settings />} />
                </Route>
                <Route path="/portal/login" element={<PortalLogin />} />
                <Route path="/portal" element={<PortalProtectedRoute />}>
                  <Route element={
                    <PortalAuthProvider>
                      <PortalLayout />
                    </PortalAuthProvider>
                  }>
                    <Route index element={<PortalDashboard />} />
                    <Route path="bar-tab" element={<PortalBarTab />} />
                    <Route path="calendar" element={<PortalCalendar />} />
                    <Route path="my-details" element={<PortalMyDetails />} />
                    <Route path="bookings" element={<PortalBookings />} />
                    <Route path="payment-result" element={<PortalPaymentResult />} />
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
