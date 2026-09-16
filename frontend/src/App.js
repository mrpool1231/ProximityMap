import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import MapWorkstation from "@/pages/MapWorkstation";

function App() {
  return (
    <div className="App min-h-screen bg-[#0b0f17] text-slate-100">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<MapWorkstation />} />
        </Routes>
      </BrowserRouter>
      <Toaster theme="dark" position="bottom-right" richColors />
    </div>
  );
}

export default App;
