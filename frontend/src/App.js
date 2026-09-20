import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import MapWorkstation from "@/pages/MapWorkstation";
import PaymentSuccess from "@/pages/PaymentSuccess";
import PaymentCancel from "@/pages/PaymentCancel";
import LegalPage from "@/pages/LegalPage";
import ResetPassword from "@/pages/ResetPassword";
import { AuthProvider } from "@/context/AuthContext";

function App() {
  return (
    <div className="App min-h-screen bg-[#0b0f17] text-slate-100">
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<MapWorkstation />} />
            <Route path="/payment/success" element={<PaymentSuccess />} />
            <Route path="/payment/cancel" element={<PaymentCancel />} />
            <Route path="/legal/:page" element={<LegalPage />} />
            <Route path="/legal" element={<LegalPage />} />
            <Route path="/reset-password" element={<ResetPassword />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
      <Toaster theme="dark" position="bottom-right" richColors />
    </div>
  );
}

export default App;
