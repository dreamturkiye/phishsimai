import { Shield, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/40 bg-background/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="container flex items-center justify-between h-16">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
              <Shield className="w-4 h-4 text-violet-400" />
            </div>
            <span className="font-bold text-lg tracking-tight">PhishSim AI</span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => window.location.href = "/"}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Home
          </Button>
        </div>
      </header>
      <main className="container max-w-3xl py-16">
        <h1 className="text-4xl font-black mb-2">Privacy Policy</h1>
        <p className="text-muted-foreground mb-10">Last updated: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>

        <div className="prose prose-invert max-w-none space-y-8 text-sm text-muted-foreground leading-relaxed">
          <section>
            <h2 className="text-xl font-bold text-foreground mb-3">1. Introduction</h2>
            <p>PhishSim AI ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our phishing simulation and security awareness platform at www.phishsimai.com (the "Service"). Please read this policy carefully. If you disagree with its terms, please discontinue use of the Service.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground mb-3">2. Information We Collect</h2>
            <p className="mb-3"><strong className="text-foreground">Account Information:</strong> When you register, we collect your name, email address, organization name, and authentication credentials.</p>
            <p className="mb-3"><strong className="text-foreground">Employee / Target Data:</strong> Organizations using our platform may upload employee names, email addresses, and department assignments for the purpose of running phishing simulations. This data is processed solely on behalf of the subscribing organization and is not used for any other purpose.</p>
            <p className="mb-3"><strong className="text-foreground">Campaign Data:</strong> We collect data about phishing simulation campaigns including send times, email open events, link click events, and credential submission events. This data is used exclusively to generate security awareness reports for your organization.</p>
            <p><strong className="text-foreground">Usage Data:</strong> We automatically collect certain information about how you interact with the Service, including IP addresses, browser type, pages visited, and time spent on pages, for the purpose of improving the platform.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground mb-3">3. How We Use Your Information</h2>
            <p>We use the information we collect to: (a) provide, operate, and maintain the Service; (b) generate phishing simulation reports and compliance documentation for your organization; (c) send administrative communications such as account confirmations and security alerts; (d) comply with legal obligations; and (e) improve and personalize the Service. We do not sell, trade, or rent your personal information to third parties.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground mb-3">4. Data Retention</h2>
            <p>We retain your account and campaign data for as long as your subscription is active. Upon account termination, we will delete your data within 90 days unless a longer retention period is required by law. Employee simulation data (opens, clicks, submissions) is retained for up to 3 years to support compliance reporting requirements under HIPAA, GLBA, CMMC, and similar frameworks.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground mb-3">5. Data Security</h2>
            <p>We implement industry-standard security measures including TLS encryption in transit, AES-256 encryption at rest, role-based access controls, and regular security audits. However, no method of transmission over the internet is 100% secure. We cannot guarantee absolute security but are committed to protecting your data using commercially reasonable means.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground mb-3">6. HIPAA Compliance</h2>
            <p>If your organization is a HIPAA-covered entity or business associate, PhishSim AI can execute a Business Associate Agreement (BAA) upon request. Employee simulation data does not constitute Protected Health Information (PHI) under HIPAA. Contact us at privacy@phishsimai.com to request a BAA.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground mb-3">7. MSP and Reseller Partners</h2>
            <p>Managed Service Providers (MSPs) using the PhishSim AI white-label portal are considered data processors acting on behalf of their customer organizations. MSPs are responsible for ensuring their customers are informed about data collection practices and for maintaining appropriate data processing agreements with their customers.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground mb-3">8. Your Rights</h2>
            <p>Depending on your jurisdiction, you may have the right to access, correct, delete, or port your personal data. To exercise these rights, contact us at privacy@phishsimai.com. We will respond to all requests within 30 days.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground mb-3">9. Contact Us</h2>
            <p>If you have questions about this Privacy Policy, please contact us at:<br />
            <strong className="text-foreground">PhishSim AI</strong><br />
            Email: privacy@phishsimai.com<br />
            Phone: 443-594-1184<br />
            Website: www.phishsimai.com</p>
          </section>
        </div>
      </main>
    </div>
  );
}
