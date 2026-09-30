import "@/App.css";
import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/context/AuthContext";

const MapWorkstation = lazy(() => import("@/pages/MapWorkstation"));
const PaymentSuccess = lazy(() => import("@/pages/PaymentSuccess"));
const PaymentCancel = lazy(() => import("@/pages/PaymentCancel"));
const LegalPage = lazy(() => import("@/pages/LegalPage"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));

function App() {
  return (
    <div className="App min-h-screen bg-[#0b0f17] text-slate-100">
      <AuthProvider>
        <BrowserRouter>
          <Suspense fallback={<div className="min-h-screen bg-[#0b0f17]" />}>
            <Routes>
              <Route path="/" element={<MapWorkstation />} />
              <Route path="/payment/success" element={<PaymentSuccess />} />
              <Route path="/payment/cancel" element={<PaymentCancel />} />
              <Route path="/legal/:page" element={<LegalPage />} />
              <Route path="/legal" element={<LegalPage />} />
              <Route path="/reset-password" element={<ResetPassword />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
      <Toaster theme="dark" position="bottom-right" richColors />
    </div>
  );
}

export default App;
