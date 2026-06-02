import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useActiveOrg } from "@/contexts/OrgContext";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  ShieldCheck, FileText, Award, ChevronRight, CheckCircle2,
  Circle, AlertCircle, Download, ExternalLink, BookOpen,
  Building2, Zap, Lock, CreditCard, Globe, Scale
} from "lucide-react";

// ─── Framework Definitions ────────────────────────────────────────────────────

const FRAMEWORKS = [
  {
    id: "hipaa",
    name: "HIPAA",
    fullName: "Health Insurance Portability and Accountability Act",
    category: "mandatory",
    sector: "Healthcare",
    icon: Building2,
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
    description: "Requires covered entities to train workforce members on security policies. Phishing simulations are the industry-standard method to demonstrate ongoing compliance with the Security Rule (45 CFR §164.308(a)(5)).",
    authority: "U.S. Department of Health & Human Services (HHS)",
    penalty: "Up to $1.9M per violation category per year",
    procedures: [
      { id: "hipaa-1", text: "Conduct initial phishing simulation baseline assessment for all workforce members" },
      { id: "hipaa-2", text: "Implement quarterly phishing simulation campaigns targeting all departments" },
      { id: "hipaa-3", text: "Assign mandatory security awareness training to employees who click simulated phishing links" },
      { id: "hipaa-4", text: "Maintain documented records of all training completions with timestamps" },
      { id: "hipaa-5", text: "Conduct annual review and update of phishing simulation content and training materials" },
      { id: "hipaa-6", text: "Generate and retain compliance reports for a minimum of 6 years" },
      { id: "hipaa-7", text: "Include phishing awareness in new employee onboarding within 30 days of hire" },
      { id: "hipaa-8", text: "Track and report improvement trends in click rates and credential submission rates" },
    ],
    reportingRequirements: [
      "Annual workforce training completion rates by department",
      "Phishing simulation click-through rates (baseline vs. current)",
      "Credential submission rates before and after training",
      "Number of employees who completed remedial training",
      "Documentation of training content updates and review dates",
    ],
    certificationNote: "HIPAA does not issue certifications, but PhishSim AI generates an audit-ready Compliance Evidence Report documenting your phishing simulation program as evidence of Security Rule compliance.",
  },
  {
    id: "glba",
    name: "GLBA",
    fullName: "Gramm-Leach-Bliley Act",
    category: "mandatory",
    sector: "Financial Services",
    icon: CreditCard,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    description: "Financial institutions must implement safeguards including employee training on phishing and social engineering under the FTC Safeguards Rule (16 CFR Part 314), updated in 2023.",
    authority: "Federal Trade Commission (FTC)",
    penalty: "Up to $100,000 per violation; officers personally liable up to $10,000",
    procedures: [
      { id: "glba-1", text: "Designate a qualified individual to oversee the information security program" },
      { id: "glba-2", text: "Conduct phishing risk assessment to identify employee vulnerability levels" },
      { id: "glba-3", text: "Implement phishing simulations as part of the written information security program (WISP)" },
      { id: "glba-4", text: "Train all personnel with access to customer financial data on phishing recognition" },
      { id: "glba-5", text: "Test employee responses to social engineering attacks at least annually" },
      { id: "glba-6", text: "Document all training activities and maintain records for regulatory review" },
      { id: "glba-7", text: "Report training program status to the Board of Directors or equivalent annually" },
    ],
    reportingRequirements: [
      "Written Information Security Program (WISP) documentation",
      "Annual board/executive report on security awareness program effectiveness",
      "Employee training completion records with dates",
      "Phishing simulation results and remediation actions taken",
    ],
    certificationNote: "PhishSim AI generates a GLBA Safeguards Rule Compliance Report suitable for inclusion in your WISP and for presentation to the Board of Directors.",
  },
  {
    id: "nerc-cip",
    name: "NERC CIP",
    fullName: "North American Electric Reliability Corporation Critical Infrastructure Protection",
    category: "mandatory",
    sector: "Energy / Utilities",
    icon: Zap,
    color: "text-yellow-400",
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/30",
    description: "NERC CIP-004-7 requires cybersecurity awareness training for all personnel with access to BES Cyber Systems. Phishing simulation is a recognized method to meet the awareness training requirement.",
    authority: "NERC / FERC",
    penalty: "Up to $1M per violation per day",
    procedures: [
      { id: "nerc-1", text: "Identify all personnel with Electronic Access or Physical Access to BES Cyber Systems" },
      { id: "nerc-2", text: "Deliver cybersecurity awareness training at least once every 15 calendar months" },
      { id: "nerc-3", text: "Include phishing and social engineering awareness in all training programs" },
      { id: "nerc-4", text: "Conduct phishing simulations for personnel with access to critical infrastructure" },
      { id: "nerc-5", text: "Maintain training records for a minimum of 3 years for audit purposes" },
      { id: "nerc-6", text: "Document training content, delivery method, and completion evidence" },
      { id: "nerc-7", text: "Review and update training content annually to reflect current threat landscape" },
    ],
    reportingRequirements: [
      "Training completion records per individual with access dates",
      "Evidence of phishing awareness content in training program",
      "List of personnel trained with roles and access levels",
      "Training content review and update documentation",
    ],
    certificationNote: "PhishSim AI produces a CIP-004-7 aligned Training Evidence Report with per-employee completion records and phishing simulation results for NERC audit submissions.",
  },
  {
    id: "cmmc",
    name: "CMMC / DFARS",
    fullName: "Cybersecurity Maturity Model Certification / Defense Federal Acquisition Regulation Supplement",
    category: "mandatory",
    sector: "Defense Contractors",
    icon: ShieldCheck,
    color: "text-purple-400",
    bg: "bg-purple-500/10",
    border: "border-purple-500/30",
    description: "CMMC Level 2+ references NIST SP 800-171 Practice AT.2.056 and AT.3.058, which mandate security awareness training including recognition of phishing attacks.",
    authority: "U.S. Department of Defense (DoD)",
    penalty: "Loss of DoD contract eligibility; False Claims Act liability",
    procedures: [
      { id: "cmmc-1", text: "Identify all users with access to Controlled Unclassified Information (CUI)" },
      { id: "cmmc-2", text: "Implement security awareness training covering phishing, social engineering, and insider threats" },
      { id: "cmmc-3", text: "Conduct phishing simulations to satisfy NIST 800-171 AT.2.056 (awareness of threats)" },
      { id: "cmmc-4", text: "Provide role-based training for privileged users per AT.3.058" },
      { id: "cmmc-5", text: "Maintain System Security Plan (SSP) documentation referencing training program" },
      { id: "cmmc-6", text: "Retain training records for a minimum of 3 years" },
      { id: "cmmc-7", text: "Prepare evidence package for C3PAO (Third-Party Assessment Organization) review" },
    ],
    reportingRequirements: [
      "System Security Plan (SSP) section referencing AT practices",
      "Training completion records per CUI-access user",
      "Phishing simulation results as evidence of AT.2.056 implementation",
      "Role-based training documentation for privileged users",
    ],
    certificationNote: "PhishSim AI generates a NIST 800-171 AT Practice Evidence Package documenting compliance with AT.2.056 and AT.3.058 for CMMC Level 2/3 assessments.",
  },
  {
    id: "nydfs",
    name: "NY DFS Part 500",
    fullName: "New York Department of Financial Services Cybersecurity Regulation",
    category: "mandatory",
    sector: "Financial Services (NY)",
    icon: Building2,
    color: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    description: "23 NYCRR Part 500.14(b) explicitly requires annual cybersecurity awareness training for all personnel. The regulation was amended in 2023 to increase requirements for larger entities.",
    authority: "New York Department of Financial Services (NYDFS)",
    penalty: "Up to $1,000 per violation per day; license revocation",
    procedures: [
      { id: "nydfs-1", text: "Conduct annual cybersecurity awareness training for 100% of personnel" },
      { id: "nydfs-2", text: "Include phishing recognition and reporting procedures in all training content" },
      { id: "nydfs-3", text: "Conduct phishing simulations as part of the awareness training program" },
      { id: "nydfs-4", text: "Maintain training completion records with employee names, dates, and content covered" },
      { id: "nydfs-5", text: "Include training program details in the annual Certification of Compliance filing" },
      { id: "nydfs-6", text: "Update training content to reflect current and emerging phishing threats" },
      { id: "nydfs-7", text: "Ensure senior management and board members complete training" },
    ],
    reportingRequirements: [
      "Annual Certification of Compliance (filed with NYDFS by April 15 each year)",
      "Training completion records for all personnel",
      "Evidence of phishing simulation program",
      "Training content documentation showing phishing coverage",
    ],
    certificationNote: "PhishSim AI generates a NY DFS Part 500 Annual Training Compliance Report with all data required for the annual Certification of Compliance filing.",
  },
  {
    id: "nist",
    name: "NIST CSF / SP 800-53",
    fullName: "NIST Cybersecurity Framework & Special Publication 800-53",
    category: "recommended",
    sector: "All Sectors",
    icon: Lock,
    color: "text-cyan-400",
    bg: "bg-cyan-500/10",
    border: "border-cyan-500/30",
    description: "NIST SP 800-53 AT-2 (Literacy Training and Awareness) and AT-3 (Role-Based Training) explicitly call out phishing simulation as a training mechanism. NIST SP 800-50 provides implementation guidance.",
    authority: "National Institute of Standards and Technology (NIST)",
    penalty: "Framework adoption is voluntary; required for federal agencies and contractors",
    procedures: [
      { id: "nist-1", text: "Implement AT-2: Provide security and privacy literacy training to all users annually" },
      { id: "nist-2", text: "Implement AT-3: Provide role-based security training before access is granted and annually thereafter" },
      { id: "nist-3", text: "Use phishing simulations as a practical training mechanism per NIST SP 800-50 guidance" },
      { id: "nist-4", text: "Measure training effectiveness using phishing simulation metrics (click rates, reporting rates)" },
      { id: "nist-5", text: "Maintain training records as part of the System Security Plan" },
      { id: "nist-6", text: "Align training content with current threat intelligence and MITRE ATT&CK framework" },
    ],
    reportingRequirements: [
      "AT-2 and AT-3 control implementation documentation",
      "Training completion records per user and role",
      "Phishing simulation metrics demonstrating program effectiveness",
      "Annual training program review documentation",
    ],
    certificationNote: "PhishSim AI generates a NIST 800-53 AT Control Evidence Report documenting implementation of AT-2 and AT-3 controls for FedRAMP, RMF, and FISMA compliance packages.",
  },
  {
    id: "soc2",
    name: "SOC 2",
    fullName: "Service Organization Control 2",
    category: "recommended",
    sector: "Technology / SaaS",
    icon: FileText,
    color: "text-violet-400",
    bg: "bg-violet-500/10",
    border: "border-violet-500/30",
    description: "SOC 2 auditors routinely look for phishing simulation programs as evidence of CC1.4 (Commitment to Competence) and CC2.2 (Internal Communication) security awareness controls under the Common Criteria.",
    authority: "AICPA (American Institute of CPAs)",
    penalty: "Failure to obtain SOC 2 may disqualify vendors from enterprise contracts",
    procedures: [
      { id: "soc2-1", text: "Implement a formal security awareness training program covering phishing threats" },
      { id: "soc2-2", text: "Conduct phishing simulations at least quarterly as evidence of CC1.4 controls" },
      { id: "soc2-3", text: "Document training policies and procedures for auditor review" },
      { id: "soc2-4", text: "Track and report training completion rates to demonstrate program effectiveness" },
      { id: "soc2-5", text: "Maintain evidence of remedial training for employees who fail phishing simulations" },
      { id: "soc2-6", text: "Include phishing simulation results in the security program review process" },
      { id: "soc2-7", text: "Prepare training evidence package for Type I and Type II audit periods" },
    ],
    reportingRequirements: [
      "Security awareness training policy documentation",
      "Training completion records for the audit period",
      "Phishing simulation results showing program operation",
      "Evidence of remedial actions taken for simulation failures",
    ],
    certificationNote: "PhishSim AI generates a SOC 2 Security Awareness Evidence Package with all documentation needed to satisfy CC1.4 and CC2.2 control requirements during your audit.",
  },
  {
    id: "ftc",
    name: "FTC Safeguards Rule",
    fullName: "FTC Safeguards Rule (Updated 2023)",
    category: "recommended",
    sector: "Financial Services",
    icon: Scale,
    color: "text-orange-400",
    bg: "bg-orange-500/10",
    border: "border-orange-500/30",
    description: "The updated FTC Safeguards Rule (16 CFR Part 314, effective June 2023) requires a written information security program including employee training for non-bank financial companies.",
    authority: "Federal Trade Commission (FTC)",
    penalty: "Up to $50,120 per violation per day",
    procedures: [
      { id: "ftc-1", text: "Develop and maintain a Written Information Security Program (WISP)" },
      { id: "ftc-2", text: "Include phishing awareness training as a core component of the WISP" },
      { id: "ftc-3", text: "Train all employees who handle customer financial information annually" },
      { id: "ftc-4", text: "Conduct phishing simulations to test and reinforce training effectiveness" },
      { id: "ftc-5", text: "Document training completion and retain records for regulatory review" },
      { id: "ftc-6", text: "Designate a Qualified Individual to oversee the security program" },
    ],
    reportingRequirements: [
      "Written Information Security Program (WISP) documentation",
      "Annual report to the Board of Directors or senior officer",
      "Employee training completion records",
      "Phishing simulation program documentation",
    ],
    certificationNote: "PhishSim AI generates an FTC Safeguards Rule Training Compliance Report for inclusion in your WISP and annual board reporting.",
  },
  {
    id: "pci-dss",
    name: "PCI DSS v4.0",
    fullName: "Payment Card Industry Data Security Standard v4.0",
    category: "industry",
    sector: "Payment Processing",
    icon: CreditCard,
    color: "text-teal-400",
    bg: "bg-teal-500/10",
    border: "border-teal-500/30",
    description: "PCI DSS v4.0 Requirement 12.6.3 specifically requires security awareness training that addresses phishing and social engineering attacks. This is a direct, explicit requirement.",
    authority: "PCI Security Standards Council",
    penalty: "Fines of $5,000–$100,000/month; loss of card processing privileges",
    procedures: [
      { id: "pci-1", text: "Implement security awareness training per Requirement 12.6.1 for all personnel annually" },
      { id: "pci-2", text: "Include phishing and social engineering content per Requirement 12.6.3.1" },
      { id: "pci-3", text: "Conduct phishing simulations at least every 6 months per Requirement 12.6.3.2" },
      { id: "pci-4", text: "Ensure 100% of personnel acknowledge reading and understanding security policies" },
      { id: "pci-5", text: "Maintain training records showing completion dates and content covered" },
      { id: "pci-6", text: "Update training content at least annually and when significant threats emerge" },
      { id: "pci-7", text: "Track and remediate personnel who fail phishing simulations" },
    ],
    reportingRequirements: [
      "Training completion records for all in-scope personnel",
      "Phishing simulation results (minimum semi-annual)",
      "Evidence of training content covering Req. 12.6.3.1 topics",
      "Signed acknowledgment forms from all personnel",
    ],
    certificationNote: "PhishSim AI generates a PCI DSS v4.0 Requirement 12.6 Compliance Report with simulation frequency, completion rates, and content coverage evidence for QSA review.",
  },
  {
    id: "sec",
    name: "SEC Cybersecurity Rules",
    fullName: "SEC Cybersecurity Disclosure Rules (2023)",
    category: "industry",
    sector: "Public Companies",
    icon: Globe,
    color: "text-indigo-400",
    bg: "bg-indigo-500/10",
    border: "border-indigo-500/30",
    description: "SEC rules effective December 2023 require public companies to disclose material cybersecurity incidents and describe their risk management programs. Phishing training is a commonly cited control in 10-K disclosures.",
    authority: "U.S. Securities and Exchange Commission (SEC)",
    penalty: "SEC enforcement action; shareholder litigation; reputational damage",
    procedures: [
      { id: "sec-1", text: "Document phishing simulation program as a cybersecurity risk management control" },
      { id: "sec-2", text: "Include phishing awareness training in the cybersecurity risk management program description" },
      { id: "sec-3", text: "Maintain records demonstrating ongoing program operation for 10-K disclosure support" },
      { id: "sec-4", text: "Report phishing simulation program to the Board of Directors or Audit Committee" },
      { id: "sec-5", text: "Assess and document whether a phishing incident constitutes a material cybersecurity incident" },
      { id: "sec-6", text: "Ensure CISO or equivalent reviews and approves the phishing simulation program annually" },
    ],
    reportingRequirements: [
      "Annual 10-K cybersecurity risk management program description",
      "Board/Audit Committee briefing materials on security awareness program",
      "Documentation of phishing simulation program for disclosure support",
      "Incident response procedures referencing phishing attack vectors",
    ],
    certificationNote: "PhishSim AI generates an SEC Cybersecurity Disclosure Support Report documenting your phishing simulation program for inclusion in 10-K filings and Board presentations.",
  },
];

const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  mandatory: { label: "Mandatory", color: "bg-red-500/15 text-red-400 border-red-500/30" },
  recommended: { label: "Strongly Recommended", color: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  industry: { label: "Industry-Specific", color: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
};

// ─── Certificate Generator ────────────────────────────────────────────────────

// Framework-specific regulatory language for certificates
const CERT_REGULATORY_LANGUAGE: Record<string, { citation: string; legalText: string; accentColor: string; accentBg: string; categoryLabel: string; }> = {
  hipaa: {
    citation: "45 CFR §164.308(a)(5) — HIPAA Security Rule",
    legalText: "This certificate documents that the above-named organization has implemented a phishing simulation and security awareness training program in accordance with the HIPAA Security Rule (45 CFR §164.308(a)(5)), which requires covered entities and business associates to implement security awareness and training programs for all workforce members. Phishing simulation is the industry-recognized method for demonstrating ongoing compliance. Records are retained per 45 CFR §164.316(b)(2).",
    accentColor: "#3b82f6",
    accentBg: "rgba(59,130,246,0.12)",
    categoryLabel: "LEGALLY REQUIRED — Healthcare",
  },
  glba: {
    citation: "16 CFR Part 314 — FTC Safeguards Rule (GLBA)",
    legalText: "This certificate documents that the above-named financial institution has implemented employee phishing simulation and security awareness training as a required safeguard under the Gramm-Leach-Bliley Act (GLBA) FTC Safeguards Rule (16 CFR Part 314, updated 2023). The Safeguards Rule mandates that financial institutions maintain a written information security program (WISP) that includes employee training on recognizing and responding to phishing and social engineering attacks.",
    accentColor: "#10b981",
    accentBg: "rgba(16,185,129,0.12)",
    categoryLabel: "LEGALLY REQUIRED — Financial Services",
  },
  "nerc-cip": {
    citation: "NERC CIP-004-7 R1 — Critical Infrastructure Protection",
    legalText: "This certificate documents that the above-named organization has implemented a cybersecurity awareness training program including phishing simulation in compliance with NERC CIP-004-7 Requirement R1, which mandates that personnel with access to BES Cyber Systems receive cybersecurity awareness training at least once every 15 calendar months. Phishing and social engineering awareness is a required component of CIP-004-7 training programs. Records are maintained per CIP-004-7 R4.",
    accentColor: "#eab308",
    accentBg: "rgba(234,179,8,0.12)",
    categoryLabel: "LEGALLY REQUIRED — Energy / Critical Infrastructure",
  },
  cmmc: {
    citation: "NIST SP 800-171 AT.2.056 / AT.3.058 — CMMC Level 2+",
    legalText: "This certificate documents that the above-named defense contractor has implemented security awareness training including phishing simulation in compliance with NIST SP 800-171 Practice AT.2.056 (Ensure that personnel are aware of the security risks associated with their activities) and AT.3.058 (Provide security awareness training on recognizing and reporting potential threats), as required by CMMC Level 2+ and DFARS clause 252.204-7012. This evidence package supports C3PAO assessment and DoD contract compliance.",
    accentColor: "#8b5cf6",
    accentBg: "rgba(139,92,246,0.12)",
    categoryLabel: "LEGALLY REQUIRED — Defense Contractors",
  },
  nydfs: {
    citation: "23 NYCRR §500.14(b) — NY DFS Cybersecurity Regulation",
    legalText: "This certificate documents that the above-named covered entity has implemented annual cybersecurity awareness training for all personnel in compliance with 23 NYCRR Part 500.14(b), which explicitly requires New York Department of Financial Services covered entities to provide cybersecurity awareness training that includes recognition of social engineering and phishing attacks. This documentation supports the annual Certification of Compliance filing required by 23 NYCRR §500.17(b) by April 15 of each year.",
    accentColor: "#ef4444",
    accentBg: "rgba(239,68,68,0.12)",
    categoryLabel: "LEGALLY REQUIRED — NY Financial Companies",
  },
  nist: {
    citation: "NIST SP 800-53 AT-2 / AT-3 & NIST SP 800-50",
    legalText: "This certificate documents that the above-named organization has implemented a phishing simulation and security awareness training program aligned with NIST SP 800-53 Controls AT-2 (Literacy Training and Awareness) and AT-3 (Role-Based Training), and NIST SP 800-50 (Building an Information Technology Security Awareness and Training Program). These controls explicitly identify phishing simulation as a recommended training mechanism for federal agencies and organizations adopting the NIST Cybersecurity Framework.",
    accentColor: "#06b6d4",
    accentBg: "rgba(6,182,212,0.12)",
    categoryLabel: "STRONGLY RECOMMENDED — All Sectors",
  },
  soc2: {
    citation: "SOC 2 CC1.4 — Security Awareness & Training",
    legalText: "This certificate documents that the above-named organization has implemented a phishing simulation and security awareness training program as evidence for SOC 2 Trust Services Criteria CC1.4, which requires the entity to demonstrate a commitment to competence through security awareness training. SOC 2 auditors routinely examine phishing simulation programs as evidence of effective security awareness controls. This documentation supports Type I and Type II SOC 2 audit evidence packages.",
    accentColor: "#f59e0b",
    accentBg: "rgba(245,158,11,0.12)",
    categoryLabel: "STRONGLY RECOMMENDED — Technology / SaaS",
  },
  ftc: {
    citation: "16 CFR Part 314 — FTC Safeguards Rule (Updated 2023)",
    legalText: "This certificate documents that the above-named financial services company has implemented employee phishing simulation and security awareness training as required by the FTC Safeguards Rule (16 CFR Part 314), updated effective June 9, 2023. The updated rule requires a written information security program that includes employee training on phishing, social engineering, and other cybersecurity threats as a core safeguard for protecting customer financial information.",
    accentColor: "#f97316",
    accentBg: "rgba(249,115,22,0.12)",
    categoryLabel: "STRONGLY RECOMMENDED — Financial Services",
  },
  pcidss: {
    citation: "PCI DSS v4.0 Requirement 12.6.3",
    legalText: "This certificate documents that the above-named organization has implemented a security awareness training program that specifically addresses phishing in compliance with PCI DSS v4.0 Requirement 12.6.3, which mandates that security awareness training includes awareness of threats and vulnerabilities that could impact the cardholder data environment, explicitly including phishing and related social engineering attacks. This documentation supports PCI DSS v4.0 compliance assessments effective March 31, 2024.",
    accentColor: "#3b82f6",
    accentBg: "rgba(59,130,246,0.12)",
    categoryLabel: "INDUSTRY-SPECIFIC — Payment Processing",
  },
  sec: {
    citation: "17 CFR Parts 229 & 249 — SEC Cybersecurity Rules (2023)",
    legalText: "This certificate documents that the above-named public company has implemented a phishing simulation and security awareness training program as part of its cybersecurity risk management program, as required to be disclosed under the SEC's Cybersecurity Risk Management, Strategy, Governance, and Incident Disclosure rules (effective December 15, 2023). Phishing simulation training is a commonly cited cybersecurity control in SEC filings and supports disclosure obligations under Item 106 of Regulation S-K.",
    accentColor: "#6366f1",
    accentBg: "rgba(99,102,241,0.12)",
    categoryLabel: "INDUSTRY-SPECIFIC — Public Companies",
  },
};

function generateCertificateHTML(orgName: string, framework: typeof FRAMEWORKS[0], completedCount: number, totalCount: number): string {
  const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const year = new Date().getFullYear();
  const certId = `PSA-${framework.id.toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
  const reg = CERT_REGULATORY_LANGUAGE[framework.id] ?? {
    citation: framework.authority,
    legalText: framework.certificationNote,
    accentColor: "#3b4fd8",
    accentBg: "rgba(59,79,216,0.12)",
    categoryLabel: CATEGORY_LABELS[framework.category]?.label ?? framework.category,
  };
  const pct = Math.round((completedCount / Math.max(totalCount, 1)) * 100);
  const isMandatory = framework.category === "mandatory";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>PhishSim AI — ${framework.name} Compliance Certificate</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Inter', sans-serif; background: #060a18; color: #e2e8f0; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 32px; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  .page { max-width: 860px; width: 100%; }
  /* ── Certificate Card ── */
  .cert { background: linear-gradient(160deg, #0d1228 0%, #0f172a 60%, #0d1228 100%); border: 1.5px solid ${reg.accentColor}55; border-radius: 20px; padding: 56px 60px; position: relative; overflow: hidden; box-shadow: 0 0 80px ${reg.accentColor}18; }
  .cert-top-bar { position: absolute; top: 0; left: 0; right: 0; height: 5px; background: linear-gradient(90deg, ${reg.accentColor}, ${reg.accentColor}88, ${reg.accentColor}); }
  .watermark { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-35deg); font-size: 100px; font-weight: 900; color: ${reg.accentColor}06; white-space: nowrap; pointer-events: none; user-select: none; letter-spacing: 8px; }
  /* ── Header ── */
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 44px; }
  .brand { display: flex; align-items: center; gap: 10px; }
  .brand-icon { width: 38px; height: 38px; background: ${reg.accentColor}; border-radius: 9px; display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0; }
  .brand-name { font-size: 17px; font-weight: 700; color: #f1f5f9; }
  .brand-url { font-size: 11px; color: #64748b; margin-top: 1px; }
  .category-pill { background: ${isMandatory ? "rgba(239,68,68,0.15)" : reg.accentBg}; border: 1px solid ${isMandatory ? "rgba(239,68,68,0.4)" : reg.accentColor + "44"}; color: ${isMandatory ? "#fca5a5" : reg.accentColor}; padding: 5px 14px; border-radius: 20px; font-size: 11px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; }
  /* ── Title Block ── */
  .title-block { margin-bottom: 36px; }
  .cert-label { font-size: 11px; font-weight: 600; letter-spacing: 3px; text-transform: uppercase; color: #475569; margin-bottom: 10px; }
  .cert-framework { font-size: 42px; font-weight: 800; color: #f8fafc; line-height: 1.1; margin-bottom: 6px; }
  .cert-fullname { font-size: 15px; color: #94a3b8; font-weight: 400; }
  /* ── Citation Box ── */
  .citation-box { background: ${reg.accentBg}; border: 1px solid ${reg.accentColor}33; border-left: 3px solid ${reg.accentColor}; border-radius: 8px; padding: 12px 16px; margin-bottom: 36px; }
  .citation-label { font-size: 10px; font-weight: 600; letter-spacing: 2px; text-transform: uppercase; color: ${reg.accentColor}; margin-bottom: 4px; }
  .citation-text { font-size: 13px; font-family: 'Courier New', monospace; color: #cbd5e1; font-weight: 500; }
  /* ── Org Block ── */
  .divider { height: 1px; background: linear-gradient(90deg, transparent, ${reg.accentColor}44, transparent); margin: 28px 0; }
  .org-label { font-size: 11px; color: #475569; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 8px; }
  .org-name { font-size: 30px; font-weight: 700; color: #e2e8f0; margin-bottom: 4px; }
  .cert-date { font-size: 14px; color: #64748b; }
  /* ── Stats ── */
  .stats-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 28px 0; }
  .stat { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); border-radius: 10px; padding: 14px 12px; text-align: center; }
  .stat-val { font-size: 22px; font-weight: 700; color: ${reg.accentColor}; }
  .stat-lbl { font-size: 10px; color: #475569; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.8px; }
  /* ── Legal Text ── */
  .legal-box { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 20px 22px; margin: 28px 0; }
  .legal-title { font-size: 10px; font-weight: 600; letter-spacing: 2px; text-transform: uppercase; color: #475569; margin-bottom: 10px; }
  .legal-text { font-size: 12.5px; color: #94a3b8; line-height: 1.75; }
  /* ── Footer ── */
  .footer-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-top: 28px; }
  .footer-item .lbl { font-size: 10px; color: #475569; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 5px; }
  .footer-item .val { font-size: 13px; color: #cbd5e1; font-weight: 500; }
  /* ── Cert ID ── */
  .cert-id-row { display: flex; align-items: center; justify-content: space-between; margin-top: 28px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.06); }
  .cert-id-text { font-size: 10.5px; font-family: 'Courier New', monospace; color: #334155; }
  .disclaimer { font-size: 10px; color: #334155; text-align: right; max-width: 320px; line-height: 1.5; }
  /* ── Seal ── */
  .seal { position: absolute; bottom: 52px; right: 52px; width: 76px; height: 76px; border: 2.5px solid ${reg.accentColor}55; border-radius: 50%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; }
  .seal-inner { width: 60px; height: 60px; border: 1px solid ${reg.accentColor}33; border-radius: 50%; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  .seal-icon { font-size: 20px; }
  .seal-text { font-size: 7px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.5px; text-align: center; line-height: 1.4; margin-top: 2px; }
  @media print { body { background: white; } .cert { border-color: #ccc; box-shadow: none; } }
</style>
</head>
<body>
<div class="page">
<div class="cert">
  <div class="cert-top-bar"></div>
  <div class="watermark">PHISHSIM AI</div>

  <div class="header">
    <div class="brand">
      <div class="brand-icon">🛡️</div>
      <div>
        <div class="brand-name">PhishSim AI</div>
        <div class="brand-url">www.phishsimai.com &nbsp;|&nbsp; 443-594-1184</div>
      </div>
    </div>
    <div class="category-pill">${reg.categoryLabel}</div>
  </div>

  <div class="title-block">
    <div class="cert-label">Certificate of Compliance Evidence</div>
    <div class="cert-framework">${framework.name}</div>
    <div class="cert-fullname">${framework.fullName}</div>
  </div>

  <div class="citation-box">
    <div class="citation-label">Regulatory Citation</div>
    <div class="citation-text">${reg.citation}</div>
  </div>

  <div class="divider"></div>

  <div class="org-label">Issued To</div>
  <div class="org-name">${orgName}</div>
  <div class="cert-date">Compliance Period: January 1, ${year} — December 31, ${year}</div>

  <div class="stats-row">
    <div class="stat"><div class="stat-val">${completedCount}/${totalCount}</div><div class="stat-lbl">Requirements Met</div></div>
    <div class="stat"><div class="stat-val">${pct}%</div><div class="stat-lbl">Completion Rate</div></div>
    <div class="stat"><div class="stat-val">${year}</div><div class="stat-lbl">Program Year</div></div>
    <div class="stat"><div class="stat-val">${isMandatory ? "REQUIRED" : "ADOPTED"}</div><div class="stat-lbl">Status</div></div>
  </div>

  <div class="legal-box">
    <div class="legal-title">Regulatory Compliance Statement</div>
    <div class="legal-text">${reg.legalText}</div>
  </div>

  <div class="divider"></div>

  <div class="footer-grid">
    <div class="footer-item"><div class="lbl">Issuing Authority</div><div class="val">${framework.authority}</div></div>
    <div class="footer-item"><div class="lbl">Issue Date</div><div class="val">${date}</div></div>
    <div class="footer-item"><div class="lbl">Penalty for Non-Compliance</div><div class="val">${framework.penalty}</div></div>
  </div>

  <div class="cert-id-row">
    <div class="cert-id-text">Certificate ID: ${certId}</div>
    <div class="disclaimer">This document serves as evidence of a phishing simulation and security awareness program. It does not constitute legal certification by the named regulatory authority.</div>
  </div>

  <div class="seal">
    <div class="seal-inner">
      <div class="seal-icon">🛡️</div>
      <div class="seal-text">PhishSim AI\nVerified</div>
    </div>
  </div>
</div>
</div>
</body>
</html>`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ComplianceCenter() {
  const { isAuthenticated } = useAuth();
  const [selectedFramework, setSelectedFramework] = useState<typeof FRAMEWORKS[0] | null>(null);
  const [checkedItems, setCheckedItems] = useState<Record<string, Set<string>>>({});
  const [activeTab, setActiveTab] = useState("all");

  const { data: orgsData } = trpc.orgs.myOrgs.useQuery(undefined, { enabled: isAuthenticated });
  const { orgId } = useActiveOrg();
  const orgName = orgsData?.[0]?.org?.name ?? "Your Organization";

  // Load persisted compliance records from DB
  const { data: allRecords } = trpc.compliance.getAllRecords.useQuery(
    { orgId: orgId! },
    { enabled: !!orgId }
  );

  // Sync DB records into local state on load
  useEffect(() => {
    if (!allRecords) return;
    const rebuilt: Record<string, Set<string>> = {};
    for (const rec of allRecords) {
      if (rec.completed) {
        if (!rebuilt[rec.frameworkId]) rebuilt[rec.frameworkId] = new Set();
        rebuilt[rec.frameworkId]!.add(rec.procedureId);
      }
    }
    setCheckedItems(rebuilt);
  }, [allRecords]);

  const utils = trpc.useUtils();
  const toggleMutation = trpc.compliance.toggleProcedure.useMutation({
    onSuccess: () => { if (orgId) utils.compliance.getAllRecords.invalidate({ orgId }); },
  });
  const issueCertMutation = trpc.compliance.issueCertificate.useMutation();

  const toggleCheck = (frameworkId: string, procedureId: string) => {
    const isCurrentlyChecked = checkedItems[frameworkId]?.has(procedureId) ?? false;
    // Optimistic local update
    setCheckedItems(prev => {
      const current = new Set(prev[frameworkId] ?? []);
      if (current.has(procedureId)) current.delete(procedureId);
      else current.add(procedureId);
      return { ...prev, [frameworkId]: current };
    });
    // Persist to DB if org is loaded
    if (orgId) {
      toggleMutation.mutate({ orgId, frameworkId, procedureId, completed: !isCurrentlyChecked });
    }
  };

  const getProgress = (framework: typeof FRAMEWORKS[0]) => {
    const checked = checkedItems[framework.id]?.size ?? 0;
    return { checked, total: framework.procedures.length };
  };

  const openCertificate = (framework: typeof FRAMEWORKS[0]) => {
    const { checked, total } = getProgress(framework);
    const certId = `PSA-${framework.id.toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
    const html = generateCertificateHTML(orgName, framework, checked, total);
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `PhishSimAI_${framework.id.toUpperCase()}_Certificate.html`;
    a.click();
    URL.revokeObjectURL(url);
    // Record issuance in DB
    if (orgId) {
      issueCertMutation.mutate({ orgId, frameworkId: framework.id, certId, completedCount: checked, totalCount: total });
    }
    toast.success(`${framework.name} compliance certificate downloaded`);
  };

  const generateReport = (framework: typeof FRAMEWORKS[0]) => {
    const { checked, total } = getProgress(framework);
    const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    const checkedProcedures = framework.procedures.filter(p => checkedItems[framework.id]?.has(p.id));
    const pendingProcedures = framework.procedures.filter(p => !checkedItems[framework.id]?.has(p.id));

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  body { font-family: Arial, sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; color: #1a1a2e; line-height: 1.6; }
  h1 { color: #1a1a2e; border-bottom: 3px solid #3b4fd8; padding-bottom: 12px; }
  h2 { color: #3b4fd8; margin-top: 32px; }
  h3 { color: #374151; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; }
  .badge { background: #eff6ff; color: #1d4ed8; padding: 4px 12px; border-radius: 20px; font-size: 13px; font-weight: 600; }
  .meta { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 24px; }
  .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .meta-item label { font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 1px; }
  .meta-item span { font-size: 14px; font-weight: 600; color: #1a1a2e; }
  .progress-bar { background: #e5e7eb; border-radius: 4px; height: 12px; margin: 8px 0; }
  .progress-fill { background: #3b4fd8; height: 12px; border-radius: 4px; width: ${Math.round((checked/total)*100)}%; }
  .completed { color: #059669; } .pending { color: #d97706; }
  .procedure { padding: 8px 0; border-bottom: 1px solid #f3f4f6; display: flex; gap: 8px; }
  .check { color: #059669; font-weight: bold; } .circle { color: #d97706; }
  .reporting ul { padding-left: 20px; }
  .reporting li { margin-bottom: 6px; }
  .footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af; }
  .disclaimer { background: #fef3c7; border: 1px solid #fcd34d; border-radius: 8px; padding: 12px; margin-top: 24px; font-size: 12px; color: #92400e; }
</style>
</head>
<body>
<h1>PhishSim AI — Compliance Evidence Report</h1>
<div class="header">
  <div>
    <h2 style="margin-top:0">${framework.name} — ${framework.fullName}</h2>
    <span class="badge">${CATEGORY_LABELS[framework.category].label} | ${framework.sector}</span>
  </div>
</div>
<div class="meta">
  <div class="meta-grid">
    <div class="meta-item"><label>Organization</label><br/><span>${orgName}</span></div>
    <div class="meta-item"><label>Report Date</label><br/><span>${date}</span></div>
    <div class="meta-item"><label>Issuing Authority</label><br/><span>${framework.authority}</span></div>
    <div class="meta-item"><label>Platform</label><br/><span>PhishSim AI (www.phishsimai.com)</span></div>
  </div>
</div>
<h2>Compliance Progress</h2>
<p><strong>${checked} of ${total} requirements completed (${Math.round((checked/total)*100)}%)</strong></p>
<div class="progress-bar"><div class="progress-fill"></div></div>
<h2>Completed Requirements</h2>
${checkedProcedures.length === 0 ? "<p><em>No requirements marked as completed yet.</em></p>" : checkedProcedures.map(p => `<div class="procedure"><span class="check">✓</span> ${p.text}</div>`).join("")}
<h2>Pending Requirements</h2>
${pendingProcedures.length === 0 ? "<p><em>All requirements completed.</em></p>" : pendingProcedures.map(p => `<div class="procedure"><span class="circle">○</span> ${p.text}</div>`).join("")}
<h2>Reporting Requirements</h2>
<div class="reporting"><ul>${framework.reportingRequirements.map(r => `<li>${r}</li>`).join("")}</ul></div>
<h2>Certification Note</h2>
<p>${framework.certificationNote}</p>
<div class="disclaimer">⚠ Disclaimer: This report is generated by PhishSim AI as evidence documentation for your phishing simulation and security awareness program. It does not constitute legal certification, audit opinion, or regulatory approval. Consult qualified legal and compliance counsel for regulatory submissions.</div>
<div class="footer">Generated by PhishSim AI | www.phishsimai.com | 443-594-1184 | ${date}</div>
</body>
</html>`;
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `PhishSimAI_${framework.id.toUpperCase()}_ComplianceReport.html`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${framework.name} compliance report downloaded`);
  };

  const filteredFrameworks = FRAMEWORKS.filter(f =>
    activeTab === "all" || f.category === activeTab
  );

  return (
    <AppLayout title="Compliance Center">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold">Compliance &amp; Certification</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Track your compliance posture across {FRAMEWORKS.length} regulatory frameworks. Generate audit-ready reports and compliance certificates.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-secondary/50 border border-border/40 rounded-lg px-3 py-2">
            <ShieldCheck className="w-3.5 h-3.5 text-primary flex-shrink-0" />
            <span>Phishing simulations satisfy requirements across all frameworks below</span>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Mandatory Frameworks", count: FRAMEWORKS.filter(f => f.category === "mandatory").length, color: "text-red-400", bg: "bg-red-500/10" },
            { label: "Recommended Frameworks", count: FRAMEWORKS.filter(f => f.category === "recommended").length, color: "text-amber-400", bg: "bg-amber-500/10" },
            { label: "Industry-Specific", count: FRAMEWORKS.filter(f => f.category === "industry").length, color: "text-blue-400", bg: "bg-blue-500/10" },
          ].map(s => (
            <Card key={s.label} className="border-border/60">
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg ${s.bg} flex items-center justify-center flex-shrink-0`}>
                  <span className={`text-xl font-bold ${s.color}`}>{s.count}</span>
                </div>
                <div className="text-sm font-medium leading-tight">{s.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Framework tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-secondary/50">
            <TabsTrigger value="all">All Frameworks</TabsTrigger>
            <TabsTrigger value="mandatory">Mandatory</TabsTrigger>
            <TabsTrigger value="recommended">Recommended</TabsTrigger>
            <TabsTrigger value="industry">Industry-Specific</TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="mt-4">
            {/* Mandatory alert banner when viewing all or mandatory tab */}
            {(activeTab === "all" || activeTab === "mandatory") && (
              <div className="mb-5 flex items-start gap-3 p-4 rounded-xl bg-red-500/8 border border-red-500/30">
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-semibold text-red-300 mb-1">5 Legally Mandated Frameworks Require Immediate Action</div>
                  <div className="text-xs text-muted-foreground leading-relaxed">
                    HIPAA, GLBA, NERC CIP, CMMC/DFARS, and NY DFS Part 500 are <strong className="text-red-300">federal and state legal requirements</strong> — not best practices.
                    Non-compliance can result in fines up to $1.9M per violation, contract disqualification, and license revocation.
                    Complete all requirements and generate your compliance certificate for each.
                  </div>
                </div>
              </div>
            )}
            <div className="grid lg:grid-cols-2 gap-4">
              {filteredFrameworks.map(fw => {
                const { checked, total } = getProgress(fw);
                const pct = Math.round((checked / total) * 100);
                const Icon = fw.icon;
                const isMandatory = fw.category === "mandatory";
                return (
                  <Card
                    key={fw.id}
                    className={`transition-all cursor-pointer group ${
                      isMandatory
                        ? "border-red-500/40 hover:border-red-500/70 bg-red-500/3"
                        : "border-border/60 hover:border-primary/40"
                    }`}
                    onClick={() => setSelectedFramework(fw)}
                  >
                    <CardContent className="p-5">
                      {isMandatory && (
                        <div className="flex items-center gap-1.5 mb-3 text-xs font-semibold text-red-400 uppercase tracking-widest">
                          <AlertCircle className="w-3.5 h-3.5" />
                          Legally Required
                        </div>
                      )}
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-lg ${fw.bg} flex items-center justify-center flex-shrink-0`}>
                            <Icon className={`w-4 h-4 ${fw.color}`} />
                          </div>
                          <div>
                            <div className="font-bold text-sm">{fw.name}</div>
                            <div className="text-xs text-muted-foreground">{fw.sector}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={`text-xs border ${CATEGORY_LABELS[fw.category].color}`}>
                            {CATEGORY_LABELS[fw.category].label}
                          </Badge>
                          <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mb-4 line-clamp-2">{fw.description}</p>
                      {isMandatory && (
                        <div className="text-xs font-mono text-red-400/60 bg-red-500/5 rounded px-2 py-1 mb-3">
                          {CERT_REGULATORY_LANGUAGE[fw.id]?.citation ?? fw.authority}
                        </div>
                      )}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Requirements completed</span>
                          <span className={`font-semibold ${pct === 100 ? "text-emerald-400" : pct > 50 ? "text-amber-400" : isMandatory ? "text-red-400" : "text-muted-foreground"}`}>
                            {checked}/{total}
                          </span>
                        </div>
                        <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${pct}%`,
                              background: pct === 100
                                ? "oklch(0.70 0.18 145)"
                                : pct > 50
                                  ? "oklch(0.68 0.20 35)"
                                  : isMandatory
                                    ? "oklch(0.60 0.22 25)"
                                    : "oklch(0.62 0.22 265)",
                            }}
                          />
                        </div>
                        {isMandatory && pct < 100 && (
                          <div className="text-xs text-red-400/70 mt-1">
                            {total - checked} requirement{total - checked !== 1 ? "s" : ""} remaining — action required
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Framework Detail Dialog */}
      {selectedFramework && (
        <Dialog open={!!selectedFramework} onOpenChange={() => setSelectedFramework(null)}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <div className="flex items-center gap-3 mb-1">
                <div className={`w-10 h-10 rounded-lg ${selectedFramework.bg} flex items-center justify-center flex-shrink-0`}>
                  <selectedFramework.icon className={`w-5 h-5 ${selectedFramework.color}`} />
                </div>
                <div>
                  <DialogTitle className="text-lg">{selectedFramework.name}</DialogTitle>
                  <p className="text-xs text-muted-foreground">{selectedFramework.fullName}</p>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-5 mt-2">
              {/* Meta */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Authority", value: selectedFramework.authority },
                  { label: "Sector", value: selectedFramework.sector },
                  { label: "Category", value: CATEGORY_LABELS[selectedFramework.category].label },
                  { label: "Penalty", value: selectedFramework.penalty },
                ].map(m => (
                  <div key={m.label} className="bg-secondary/40 rounded-lg p-3">
                    <div className="text-xs text-muted-foreground mb-1">{m.label}</div>
                    <div className="text-xs font-medium leading-snug">{m.value}</div>
                  </div>
                ))}
              </div>

              <p className="text-sm text-muted-foreground">{selectedFramework.description}</p>

              {/* Procedures checklist */}
              <div>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-primary" />
                  Compliance Procedures
                  <span className="text-xs text-muted-foreground font-normal ml-auto">
                    {getProgress(selectedFramework).checked}/{getProgress(selectedFramework).total} completed
                  </span>
                </h3>
                <div className="space-y-2">
                  {selectedFramework.procedures.map((proc, i) => {
                    const isChecked = checkedItems[selectedFramework.id]?.has(proc.id) ?? false;
                    return (
                      <div
                        key={proc.id}
                        className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                          isChecked
                            ? "bg-emerald-500/8 border-emerald-500/25"
                            : "bg-secondary/30 border-border/40 hover:border-primary/30"
                        }`}
                        onClick={() => toggleCheck(selectedFramework.id, proc.id)}
                      >
                        {isChecked
                          ? <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                          : <Circle className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                        }
                        <span className={`text-xs leading-relaxed ${isChecked ? "text-foreground" : "text-muted-foreground"}`}>
                          <span className="text-muted-foreground/60 mr-2">{String(i + 1).padStart(2, "0")}.</span>
                          {proc.text}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Reporting requirements */}
              <div>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary" />
                  Reporting Requirements
                </h3>
                <div className="space-y-2">
                  {selectedFramework.reportingRequirements.map((req, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                      {req}
                    </div>
                  ))}
                </div>
              </div>

              {/* Certification note */}
              <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <Award className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground leading-relaxed">{selectedFramework.certificationNote}</p>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-3 pt-2">
                <Button
                  className="flex-1"
                  onClick={() => generateReport(selectedFramework)}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download Compliance Report
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => openCertificate(selectedFramework)}
                >
                  <Award className="w-4 h-4 mr-2" />
                  Download Certificate
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </AppLayout>
  );
}
