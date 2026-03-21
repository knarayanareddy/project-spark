import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import AppShell from "./components/layout/AppShell";
import Index from "./pages/Index.tsx";
import Connectors from "./pages/Connectors.tsx";
import BriefingBuilder from "./pages/BriefingBuilder.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

// Placeholders for future milestones
const ReadingList = () => <div className="p-8 text-muted-foreground italic">Reading List is coming soon.</div>;
const History = () => <div className="p-8 text-muted-foreground italic">Briefing History is coming soon.</div>;

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<Navigate to="/today" replace />} />
            <Route path="/today" element={<Index />} />
            <Route path="/builder" element={<BriefingBuilder />} />
            <Route path="/connectors" element={<Connectors />} />
            <Route path="/reading-list" element={<ReadingList />} />
            <Route path="/history" element={<History />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
