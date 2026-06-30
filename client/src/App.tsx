import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import Campaigns from "./pages/Campaigns";
import CampaignDetail from "./pages/CampaignDetail";
import Templates from "./pages/Templates";
import Targets from "./pages/Targets";
import Training from "./pages/Training";
import Analytics from "./pages/Analytics";
import Gamification from "./pages/Gamification";
import OrgSettings from "./pages/OrgSettings";
import OrgSetup from "./pages/OrgSetup";
import AcceptInvite from "./pages/AcceptInvite";
import ComplianceCenter from "./pages/ComplianceCenter";
import MspPortal from "./pages/MspPortal";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfService from "./pages/TermsOfService";
import Login from "./pages/Login";
import HQ from "./pages/HQ";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/campaigns" component={Campaigns} />
      <Route path="/campaigns/:id" component={CampaignDetail} />
      <Route path="/templates" component={Templates} />
      <Route path="/targets" component={Targets} />
      <Route path="/training" component={Training} />
      <Route path="/analytics" component={Analytics} />
      <Route path="/gamification" component={Gamification} />
      <Route path="/settings" component={OrgSettings} />
      <Route path="/setup" component={OrgSetup} />
      <Route path="/register" component={OrgSetup} />
      <Route path="/pricing" component={Home} />
      <Route path="/invite/:token" component={AcceptInvite} />
      <Route path="/compliance" component={ComplianceCenter} />
      <Route path="/msp" component={MspPortal} />
      <Route path="/privacy" component={PrivacyPolicy} />
      <Route path="/terms" component={TermsOfService} />
      <Route path="/login" component={Login} />
      <Route path="/hq" component={HQ} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
