import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Outlet } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { VenueResolver, VenueProvider } from "@/contexts/VenueContext";
import { getCustomDomainConfig } from "@/config/customDomains";
import { POSAuthProvider } from "@/contexts/POSAuthContext";
import { CartProvider } from "@/contexts/CartContext";
import { PortalAuthProvider } from "@/contexts/PortalAuthContext";
import { AdminAuthProvider } from "@/contexts/AdminAuthContext";
import { PortalThemeProvider } from "@/contexts/PortalThemeContext";
import Index from "./pages/Index.tsx";
import POS from "./pages/POS.tsx";
import NotFound from "./pages/NotFound.tsx";
import AdminLogin from "./pages/admin/AdminLogin.tsx";
import AdminSetPassword from "./pages/admin/AdminSetPassword.tsx";
import AdminProtectedRoute from "./components/admin/AdminProtectedRoute.tsx";
import Products from "./pages/admin/Products.tsx";
import AdminDashboard from "./pages/admin/Dashboard.tsx";
import Members from "./pages/admin/Members.tsx";
import MemberDetail from "./pages/admin/MemberDetail.tsx";
import Reports from "./pages/admin/Reports.tsx";
import Settings from "./pages/admin/Settings.tsx";
import Events from "./pages/admin/Events.tsx";
import AdminBookings from "./pages/admin/Bookings.tsx";
import Broadcasts from "./pages/admin/Broadcasts.tsx";
import BroadcastCompose from "./pages/admin/BroadcastCompose.tsx";
import BroadcastDetail from "./pages/admin/BroadcastDetail.tsx";
import WhatsAppAssistant from "./pages/admin/WhatsAppAssistant.tsx";
import WhatsAppFollowups from "./pages/admin/WhatsAppFollowups.tsx";
import Applications from "./pages/admin/Applications.tsx";
import ApplicationNoticePage from "./pages/admin/ApplicationNoticePage.tsx";
import Issues from "./pages/admin/Issues.tsx";
import AdminCalendar from "./pages/admin/AdminCalendar.tsx";
import Jobs from "./pages/admin/Jobs.tsx";
import Leave from "./pages/admin/Leave.tsx";
import RequireRole from "./components/admin/RequireRole.tsx";
import MembershipApplicationPage from "./pages/MembershipApplicationPage.tsx";
import PortalLogin from "./pages/portal/PortalLogin.tsx";
import AcceptInvite from "./pages/portal/AcceptInvite.tsx";
import PortalResetPassword from "./pages/portal/PortalResetPassword.tsx";
import PortalProtectedRoute from "./components/portal/PortalProtectedRoute.tsx";
import PortalLayout from "./components/portal/PortalLayout.tsx";
import PortalBarTab from "./pages/portal/PortalBarTab.tsx";
import PortalDashboard from "./pages/portal/PortalDashboard.tsx";
import PortalCalendar from "./pages/portal/PortalCalendar.tsx";
import PortalMyDetails from "./pages/portal/PortalMyDetails.tsx";
import PortalBookings from "./pages/portal/PortalBookings.tsx";
import PortalConstitution from "./pages/portal/PortalConstitution.tsx";
import PortalReportIssue from "./pages/portal/PortalReportIssue.tsx";
import PortalPaymentResult from "./pages/portal/PortalPaymentResult.tsx";
import PublicBookingPage from "./pages/PublicBookingPage.tsx";
import Unsubscribed from "./pages/Unsubscribed.tsx";

const queryClient = new QueryClient();
const customDomainConfig = getCustomDomainConfig();

function RootRedirect() {
  window.location.href = 'https://ledra.co.za';
  return null;
}

function VenueLayout() {
  return (
    <POSAuthProvider>
      <CartProvider>
        <Outlet />
      </CartProvider>
    </POSAuthProvider>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          {customDomainConfig ? (
            /* Custom domain: no slug in URL — venue resolved from hostname config */
            <Route element={
              <VenueProvider slug={customDomainConfig.slug}>
                <VenueLayout />
              </VenueProvider>
            }>
              {customDomainConfig.section === 'portal' && <>
                <Route path="login" element={<PortalThemeProvider><PortalLogin /></PortalThemeProvider>} />
                <Route path="accept-invite" element={<PortalThemeProvider><AcceptInvite /></PortalThemeProvider>} />
                <Route path="reset-password" element={<PortalThemeProvider><PortalResetPassword /></PortalThemeProvider>} />
                <Route path="unsubscribed" element={<Unsubscribed />} />
                <Route path="apply" element={<MembershipApplicationPage />} />
                <Route element={<PortalProtectedRoute />}>
                  <Route element={
                    <PortalAuthProvider>
                      <PortalThemeProvider>
                        <PortalLayout />
                      </PortalThemeProvider>
                    </PortalAuthProvider>
                  }>
                    <Route index element={<PortalDashboard />} />
                    <Route path="bar-tab" element={<PortalBarTab />} />
                    <Route path="calendar" element={<PortalCalendar />} />
                    <Route path="my-details" element={<PortalMyDetails />} />
                    <Route path="bookings" element={<PortalBookings />} />
                    <Route path="constitution" element={<PortalConstitution />} />
                    <Route path="report-issue" element={<PortalReportIssue />} />
                    <Route path="payment-result" element={<PortalPaymentResult />} />
                  </Route>
                </Route>
              </>}
              {customDomainConfig.section === 'pos' && (
                <Route index element={<POS />} />
              )}
              {customDomainConfig.section === 'admin' && <>
                <Route path="login" element={<AdminLogin />} />
                <Route path="set-password" element={<AdminSetPassword />} />
                <Route element={<AdminAuthProvider><AdminProtectedRoute /></AdminAuthProvider>}>
                  <Route index element={<AdminDashboard />} />
                  {/* Shared with the club-manager role */}
                  <Route path="issues" element={<Issues />} />
                  <Route path="calendar" element={<AdminCalendar />} />
                  <Route path="jobs" element={<Jobs />} />
                  <Route path="leave" element={<Leave />} />
                  {/* Committee-only (admin / superadmin) */}
                  <Route path="products" element={<RequireRole allow={['admin', 'superadmin']}><Products /></RequireRole>} />
                  <Route path="members" element={<RequireRole allow={['admin', 'superadmin']}><Members /></RequireRole>} />
                  <Route path="members/:id" element={<RequireRole allow={['admin', 'superadmin']}><MemberDetail /></RequireRole>} />
                  <Route path="reports" element={<RequireRole allow={['admin', 'superadmin']}><Reports /></RequireRole>} />
                  <Route path="events" element={<RequireRole allow={['admin', 'superadmin']}><Events /></RequireRole>} />
                  <Route path="bookings" element={<RequireRole allow={['admin', 'superadmin']}><AdminBookings /></RequireRole>} />
                  <Route path="broadcasts" element={<RequireRole allow={['admin', 'superadmin']}><Broadcasts /></RequireRole>} />
                  <Route path="broadcasts/new" element={<RequireRole allow={['admin', 'superadmin']}><BroadcastCompose /></RequireRole>} />
                  <Route path="broadcasts/:id" element={<RequireRole allow={['admin', 'superadmin']}><BroadcastDetail /></RequireRole>} />
                  <Route path="whatsapp/assistant" element={<RequireRole allow={['admin', 'superadmin']}><WhatsAppAssistant /></RequireRole>} />
                  <Route path="whatsapp/followups" element={<RequireRole allow={['admin', 'superadmin']}><WhatsAppFollowups /></RequireRole>} />
                  <Route path="applications" element={<RequireRole allow={['admin', 'superadmin']}><Applications /></RequireRole>} />
                  <Route path="applications/:id/notice" element={<RequireRole allow={['admin', 'superadmin']}><ApplicationNoticePage /></RequireRole>} />
                  <Route path="settings" element={<RequireRole allow={['admin', 'superadmin']}><Settings /></RequireRole>} />
                </Route>
              </>}
              {customDomainConfig.section === 'public' && <>
                <Route path="booking/:code" element={<PublicBookingPage />} />
              </>}
            </Route>
          ) : (
            /* Normal slug-based routing */
            <>
              <Route path="/" element={<RootRedirect />} />
              <Route path="booking">
                <Route path=":code" element={<PublicBookingPage />} />
              </Route>
              <Route path="unsubscribed" element={<Unsubscribed />} />
              <Route path="/:slug" element={<VenueResolver />}>
                <Route element={<VenueLayout />}>
                  <Route index element={<Index />} />
                  <Route path="pos" element={<POS />} />
                  <Route path="admin/login" element={<AdminLogin />} />
                  <Route path="admin/set-password" element={<AdminSetPassword />} />
                  <Route path="admin" element={
                    <AdminAuthProvider>
                      <AdminProtectedRoute />
                    </AdminAuthProvider>
                  }>
                    <Route index element={<AdminDashboard />} />
                    {/* Shared with the club-manager role */}
                    <Route path="issues" element={<Issues />} />
                    <Route path="calendar" element={<AdminCalendar />} />
                    <Route path="jobs" element={<Jobs />} />
                    <Route path="leave" element={<Leave />} />
                    {/* Committee-only (admin / superadmin) */}
                    <Route path="products" element={<RequireRole allow={['admin', 'superadmin']}><Products /></RequireRole>} />
                    <Route path="members" element={<RequireRole allow={['admin', 'superadmin']}><Members /></RequireRole>} />
                    <Route path="members/:id" element={<RequireRole allow={['admin', 'superadmin']}><MemberDetail /></RequireRole>} />
                    <Route path="reports" element={<RequireRole allow={['admin', 'superadmin']}><Reports /></RequireRole>} />
                    <Route path="events" element={<RequireRole allow={['admin', 'superadmin']}><Events /></RequireRole>} />
                    <Route path="bookings" element={<RequireRole allow={['admin', 'superadmin']}><AdminBookings /></RequireRole>} />
                    <Route path="broadcasts" element={<RequireRole allow={['admin', 'superadmin']}><Broadcasts /></RequireRole>} />
                    <Route path="broadcasts/new" element={<RequireRole allow={['admin', 'superadmin']}><BroadcastCompose /></RequireRole>} />
                    <Route path="broadcasts/:id" element={<RequireRole allow={['admin', 'superadmin']}><BroadcastDetail /></RequireRole>} />
                    <Route path="whatsapp/assistant" element={<RequireRole allow={['admin', 'superadmin']}><WhatsAppAssistant /></RequireRole>} />
                    <Route path="whatsapp/followups" element={<RequireRole allow={['admin', 'superadmin']}><WhatsAppFollowups /></RequireRole>} />
                    <Route path="applications" element={<RequireRole allow={['admin', 'superadmin']}><Applications /></RequireRole>} />
                    <Route path="applications/:id/notice" element={<RequireRole allow={['admin', 'superadmin']}><ApplicationNoticePage /></RequireRole>} />
                    <Route path="settings" element={<RequireRole allow={['admin', 'superadmin']}><Settings /></RequireRole>} />
                  </Route>
                  <Route path="apply" element={<MembershipApplicationPage />} />
                  <Route path="portal/login" element={<PortalThemeProvider><PortalLogin /></PortalThemeProvider>} />
                  <Route path="portal/accept-invite" element={<PortalThemeProvider><AcceptInvite /></PortalThemeProvider>} />
                  <Route path="portal/reset-password" element={<PortalThemeProvider><PortalResetPassword /></PortalThemeProvider>} />
                  <Route path="portal" element={<PortalProtectedRoute />}>
                    <Route element={
                      <PortalAuthProvider>
                        <PortalThemeProvider>
                          <PortalLayout />
                        </PortalThemeProvider>
                      </PortalAuthProvider>
                    }>
                      <Route index element={<PortalDashboard />} />
                      <Route path="bar-tab" element={<PortalBarTab />} />
                      <Route path="calendar" element={<PortalCalendar />} />
                      <Route path="my-details" element={<PortalMyDetails />} />
                      <Route path="bookings" element={<PortalBookings />} />
                      <Route path="constitution" element={<PortalConstitution />} />
                      <Route path="report-issue" element={<PortalReportIssue />} />
                      <Route path="payment-result" element={<PortalPaymentResult />} />
                    </Route>
                  </Route>
                </Route>
              </Route>
              <Route path="*" element={<NotFound />} />
            </>
          )}
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
