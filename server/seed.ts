// Built-in phishing templates and training modules seed data

export const BUILT_IN_TEMPLATES = [
  // ── English Templates ──────────────────────────────────────────────────────
  {
    name: "IT Password Reset Alert",
    subject: "URGENT: Your password will expire in 24 hours",
    htmlBody: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;border:1px solid #e0e0e0;border-radius:8px">
<div style="background:#0078d4;padding:16px;border-radius:6px 6px 0 0;text-align:center">
<h2 style="color:white;margin:0">IT Security Notice</h2></div>
<div style="padding:24px">
<p>Dear Employee,</p>
<p>Our system has detected that your corporate password is scheduled to expire in <strong>24 hours</strong>. Failure to update your password will result in account lockout.</p>
<p>Please click the link below to update your password immediately:</p>
<p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#0078d4;color:white;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block">Update Password Now</a></p>
<p style="color:#666;font-size:12px">If you did not request this, please contact IT Support immediately.</p>
</div></div>`,
    language: "en" as const,
    attackType: "credential_harvest" as const,
    industry: "All Industries",
    difficulty: "easy" as const,
    tags: ["IT", "password", "urgent"],
  },
  {
    name: "Microsoft 365 Account Suspended",
    subject: "Action Required: Your Microsoft 365 account has been suspended",
    htmlBody: `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
<div style="text-align:center;padding:20px 0"><img src="https://upload.wikimedia.org/wikipedia/commons/thumb/4/44/Microsoft_logo.svg/200px-Microsoft_logo.svg.png" alt="Microsoft" style="height:30px"></div>
<div style="border:1px solid #ddd;padding:30px;border-radius:4px">
<h2 style="color:#d83b01">Account Suspended</h2>
<p>We've detected unusual sign-in activity on your Microsoft 365 account. To protect your account, we've temporarily suspended access.</p>
<p>To restore access, please verify your identity:</p>
<p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#0078d4;color:white;padding:12px 24px;text-decoration:none;border-radius:2px;display:inline-block">Verify My Account</a></p>
<p style="font-size:12px;color:#666">Microsoft will never ask for your password via email.</p>
</div></div>`,
    language: "en" as const,
    attackType: "credential_harvest" as const,
    industry: "Technology",
    difficulty: "medium" as const,
    tags: ["Microsoft", "O365", "account"],
  },
  {
    name: "HR Benefits Enrollment Deadline",
    subject: "Last chance: Open enrollment closes Friday",
    htmlBody: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
<div style="background:#2e7d32;padding:16px;text-align:center;border-radius:6px 6px 0 0">
<h2 style="color:white;margin:0">Human Resources</h2></div>
<div style="border:1px solid #ddd;padding:24px">
<p>Dear Team Member,</p>
<p>This is your final reminder that <strong>open enrollment for 2025 benefits closes this Friday at 5:00 PM</strong>.</p>
<p>If you do not complete your enrollment, you will be automatically enrolled in the default plan, which may not meet your needs.</p>
<p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#2e7d32;color:white;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block">Complete Enrollment</a></p>
<p style="font-size:12px;color:#666">Questions? Contact HR at hr@company.com</p>
</div></div>`,
    language: "en" as const,
    attackType: "credential_harvest" as const,
    industry: "Healthcare",
    difficulty: "medium" as const,
    tags: ["HR", "benefits", "enrollment"],
  },
  {
    name: "CEO Wire Transfer Request",
    subject: "Confidential: Urgent wire transfer needed",
    htmlBody: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
<p>Hi,</p>
<p>I'm currently in a board meeting and need you to process an urgent wire transfer. This is time-sensitive and confidential — please don't discuss with anyone else until it's complete.</p>
<p>Amount: <strong>$47,500</strong><br>Please click below to access the secure transfer portal:</p>
<p><a href="{{TRACKING_LINK}}">Access Secure Transfer Portal</a></p>
<p>I'll explain the details after the meeting. Please confirm receipt of this email.</p>
<p>Best,<br>CEO</p>
</div>`,
    language: "en" as const,
    attackType: "pretexting" as const,
    industry: "Finance",
    difficulty: "hard" as const,
    tags: ["BEC", "CEO fraud", "wire transfer"],
  },
  {
    name: "DocuSign Document Ready",
    subject: "You have a document to review and sign",
    htmlBody: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#f5f5f5">
<div style="background:white;border-radius:8px;overflow:hidden">
<div style="background:#1a1a2e;padding:20px;text-align:center">
<h2 style="color:white;margin:0">DocuSign</h2></div>
<div style="padding:30px">
<p>A document has been sent to you for signature.</p>
<div style="background:#f9f9f9;border:1px solid #ddd;padding:16px;border-radius:4px;margin:16px 0">
<strong>Document:</strong> Employment Agreement 2025<br>
<strong>From:</strong> Legal Department<br>
<strong>Expires:</strong> 48 hours
</div>
<p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#f5a623;color:white;padding:14px 32px;text-decoration:none;border-radius:4px;display:inline-block;font-weight:bold">Review Document</a></p>
</div></div></div>`,
    language: "en" as const,
    attackType: "link_click" as const,
    industry: "Legal",
    difficulty: "medium" as const,
    tags: ["DocuSign", "document", "signature"],
  },
  {
    name: "Payroll Direct Deposit Update",
    subject: "Action needed: Verify your direct deposit information",
    htmlBody: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
<div style="background:#1565c0;padding:16px;text-align:center;border-radius:6px 6px 0 0">
<h2 style="color:white;margin:0">Payroll Services</h2></div>
<div style="border:1px solid #ddd;padding:24px">
<p>Dear Employee,</p>
<p>We are updating our payroll system and require all employees to verify their direct deposit information by <strong>end of business today</strong>.</p>
<p>Failure to verify may result in a delay in your next paycheck.</p>
<p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#1565c0;color:white;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block">Verify Banking Info</a></p>
</div></div>`,
    language: "en" as const,
    attackType: "credential_harvest" as const,
    industry: "Finance",
    difficulty: "easy" as const,
    tags: ["payroll", "banking", "direct deposit"],
  },
  {
    name: "Shared File Notification",
    subject: "John Smith shared a file with you",
    htmlBody: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#f0f2f5">
<div style="background:white;border-radius:8px;padding:30px">
<div style="text-align:center;margin-bottom:20px">
<div style="width:48px;height:48px;background:#0061ff;border-radius:8px;margin:0 auto;display:flex;align-items:center;justify-content:center">
<span style="color:white;font-size:24px">📁</span></div></div>
<h3 style="text-align:center">John Smith shared "Q4 Financial Report.xlsx" with you</h3>
<p style="color:#666;text-align:center">Click below to view the document</p>
<p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#0061ff;color:white;padding:12px 28px;text-decoration:none;border-radius:6px;display:inline-block">Open File</a></p>
</div></div>`,
    language: "en" as const,
    attackType: "link_click" as const,
    industry: "All Industries",
    difficulty: "easy" as const,
    tags: ["file sharing", "Dropbox", "OneDrive"],
  },
  // ── Spanish Templates ──────────────────────────────────────────────────────
  {
    name: "Alerta de Contraseña Expirada (ES)",
    subject: "URGENTE: Su contraseña expirará en 24 horas",
    htmlBody: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;border:1px solid #e0e0e0;border-radius:8px">
<div style="background:#0078d4;padding:16px;border-radius:6px 6px 0 0;text-align:center">
<h2 style="color:white;margin:0">Aviso de Seguridad TI</h2></div>
<div style="padding:24px">
<p>Estimado empleado,</p>
<p>Nuestro sistema ha detectado que su contraseña corporativa expirará en <strong>24 horas</strong>. No actualizar su contraseña resultará en el bloqueo de su cuenta.</p>
<p>Por favor, haga clic en el siguiente enlace para actualizar su contraseña de inmediato:</p>
<p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#0078d4;color:white;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block">Actualizar Contraseña</a></p>
</div></div>`,
    language: "es" as const,
    attackType: "credential_harvest" as const,
    industry: "All Industries",
    difficulty: "easy" as const,
    tags: ["contraseña", "IT", "urgente"],
  },
  {
    name: "Notificación de Nómina (ES)",
    subject: "Acción requerida: Verifique su información de depósito directo",
    htmlBody: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
<div style="background:#1565c0;padding:16px;text-align:center;border-radius:6px 6px 0 0">
<h2 style="color:white;margin:0">Servicios de Nómina</h2></div>
<div style="border:1px solid #ddd;padding:24px">
<p>Estimado empleado,</p>
<p>Estamos actualizando nuestro sistema de nómina y necesitamos que todos los empleados verifiquen su información de depósito directo antes del <strong>final del día de hoy</strong>.</p>
<p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#1565c0;color:white;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block">Verificar Información Bancaria</a></p>
</div></div>`,
    language: "es" as const,
    attackType: "credential_harvest" as const,
    industry: "Finance",
    difficulty: "easy" as const,
    tags: ["nómina", "banco", "depósito"],
  },
  // ── Turkish Templates ──────────────────────────────────────────────────────
  {
    name: "BT Şifre Sıfırlama Uyarısı (TR)",
    subject: "ACİL: Şifrenizin süresi 24 saat içinde dolacak",
    htmlBody: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;border:1px solid #e0e0e0;border-radius:8px">
<div style="background:#0078d4;padding:16px;border-radius:6px 6px 0 0;text-align:center">
<h2 style="color:white;margin:0">BT Güvenlik Bildirimi</h2></div>
<div style="padding:24px">
<p>Sayın Çalışan,</p>
<p>Sistemimiz, kurumsal şifrenizin <strong>24 saat içinde</strong> sona ereceğini tespit etti. Şifrenizi güncellememek hesabınızın kilitlenmesine neden olacaktır.</p>
<p>Şifrenizi hemen güncellemek için aşağıdaki bağlantıya tıklayın:</p>
<p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#0078d4;color:white;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block">Şifreyi Güncelle</a></p>
</div></div>`,
    language: "tr" as const,
    attackType: "credential_harvest" as const,
    industry: "All Industries",
    difficulty: "easy" as const,
    tags: ["şifre", "BT", "acil"],
  },
  {
    name: "Microsoft Hesap Askıya Alındı (TR)",
    subject: "İşlem Gerekli: Microsoft hesabınız askıya alındı",
    htmlBody: `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
<div style="border:1px solid #ddd;padding:30px;border-radius:4px">
<h2 style="color:#d83b01">Hesap Askıya Alındı</h2>
<p>Microsoft 365 hesabınızda olağandışı oturum açma etkinliği tespit ettik. Hesabınızı korumak için erişimi geçici olarak askıya aldık.</p>
<p>Erişimi geri yüklemek için kimliğinizi doğrulayın:</p>
<p style="text-align:center"><a href="{{TRACKING_LINK}}" style="background:#0078d4;color:white;padding:12px 24px;text-decoration:none;border-radius:2px;display:inline-block">Hesabımı Doğrula</a></p>
</div></div>`,
    language: "tr" as const,
    attackType: "credential_harvest" as const,
    industry: "Technology",
    difficulty: "medium" as const,
    tags: ["Microsoft", "hesap", "doğrulama"],
  },
];

export const BUILT_IN_TRAINING_MODULES = [
  {
    title: "Introduction to Phishing",
    description: "Learn to identify and avoid phishing attacks — the #1 cyber threat.",
    category: "Phishing Awareness",
    content: `# Introduction to Phishing

## What is Phishing?
Phishing is a type of social engineering attack where cybercriminals impersonate trusted entities to steal sensitive information such as passwords, credit card numbers, or personal data.

## How Phishing Works
1. **The Hook**: You receive an email, text, or call that appears to be from a legitimate source (your bank, IT department, or a colleague).
2. **The Bait**: The message creates urgency — "Your account will be locked!" or "Verify your information now!"
3. **The Trap**: You click a link or open an attachment that leads to a fake website or installs malware.

## Red Flags to Watch For
- Unexpected urgency or threats
- Generic greetings ("Dear Customer" instead of your name)
- Mismatched or suspicious URLs (hover before clicking!)
- Requests for sensitive information via email
- Poor grammar or spelling
- Unexpected attachments

## The Golden Rule
**When in doubt, don't click.** Contact the sender through a known, trusted channel to verify the request.`,
    quizJson: [
      { id: "q1", question: "What is the primary goal of a phishing attack?", options: ["To crash your computer", "To steal sensitive information", "To slow down your network", "To send spam emails"], correctIndex: 1, explanation: "Phishing attacks aim to trick you into revealing sensitive information like passwords or financial data." },
      { id: "q2", question: "Which of the following is a red flag in an email?", options: ["Your name in the greeting", "A familiar sender address", "Unexpected urgency to act immediately", "A professional signature"], correctIndex: 2, explanation: "Urgency is a classic manipulation tactic used in phishing emails to prevent you from thinking critically." },
      { id: "q3", question: "What should you do if you receive a suspicious email?", options: ["Click the link to check if it's real", "Forward it to colleagues", "Contact the sender through a known channel to verify", "Delete it and ignore it forever"], correctIndex: 2, explanation: "Always verify suspicious requests through a trusted, independent channel before taking action." },
    ],
    durationMinutes: 5,
    difficulty: "beginner" as const,
    language: "en" as const,
    isBuiltIn: true,
    sortOrder: 1,
  },
  {
    title: "Password Security Best Practices",
    description: "Create strong passwords and protect your accounts from unauthorized access.",
    category: "Password Security",
    content: `# Password Security Best Practices

## Why Password Security Matters
Weak passwords are one of the most common ways attackers gain access to accounts. A single compromised password can lead to a data breach affecting thousands of people.

## Creating Strong Passwords
- **Length**: Use at least 12-16 characters
- **Complexity**: Mix uppercase, lowercase, numbers, and symbols
- **Uniqueness**: Never reuse passwords across accounts
- **Unpredictability**: Avoid dictionary words, names, or dates

## Password Manager
Use a reputable password manager (like Bitwarden, 1Password, or LastPass) to:
- Generate strong, unique passwords for every account
- Store them securely encrypted
- Auto-fill without typing

## Multi-Factor Authentication (MFA)
Enable MFA on every account that supports it. Even if your password is stolen, MFA provides a second layer of protection.

## What NOT to Do
- Don't write passwords on sticky notes
- Don't share passwords via email or chat
- Don't use the same password for work and personal accounts
- Don't use obvious passwords like "Password123" or your company name`,
    quizJson: [
      { id: "q1", question: "What is the minimum recommended password length?", options: ["6 characters", "8 characters", "12 characters", "20 characters"], correctIndex: 2, explanation: "Security experts recommend at least 12-16 characters for strong passwords." },
      { id: "q2", question: "What is Multi-Factor Authentication (MFA)?", options: ["Using two different passwords", "A second verification step beyond your password", "Changing your password every month", "Using a longer password"], correctIndex: 1, explanation: "MFA adds a second layer of security, requiring something you know (password) plus something you have (phone) or are (fingerprint)." },
      { id: "q3", question: "Which password is the strongest?", options: ["Password123", "MyDog2015!", "xK#9mP$2vL@nQ7", "CompanyName2024"], correctIndex: 2, explanation: "A random mix of characters with no recognizable words or patterns is the strongest type of password." },
    ],
    durationMinutes: 4,
    difficulty: "beginner" as const,
    language: "en" as const,
    isBuiltIn: true,
    sortOrder: 2,
  },
  {
    title: "Social Engineering Tactics",
    description: "Understand how attackers manipulate human psychology to bypass security.",
    category: "Social Engineering",
    content: `# Social Engineering Tactics

## What is Social Engineering?
Social engineering is the art of manipulating people into divulging confidential information or performing actions that compromise security. It exploits human psychology rather than technical vulnerabilities.

## Common Tactics

### Pretexting
The attacker creates a fabricated scenario (pretext) to gain trust. Example: "I'm from IT and need your credentials to fix an issue."

### Vishing (Voice Phishing)
Phone-based attacks where callers impersonate IT support, banks, or government agencies.

### Smishing (SMS Phishing)
Text messages with malicious links or urgent requests.

### Baiting
Leaving infected USB drives in public places, hoping someone will plug them in.

### Tailgating
Physically following an authorized person into a restricted area.

## Psychological Triggers Used
- **Authority**: "I'm the CEO and I need this now"
- **Urgency**: "Your account will be deleted in 1 hour"
- **Fear**: "You've been hacked, act immediately"
- **Reciprocity**: "I did you a favor, now help me"
- **Social proof**: "Everyone else has already done this"

## Defense Strategies
- Verify identity through official channels before complying
- Be skeptical of unsolicited requests, even from apparent authority figures
- Follow your organization's security policies — they exist for a reason
- Report suspicious contacts to your security team`,
    quizJson: [
      { id: "q1", question: "What is 'pretexting' in social engineering?", options: ["Sending fake text messages", "Creating a fabricated scenario to gain trust", "Pretending to be a technical expert", "Using pre-written email templates"], correctIndex: 1, explanation: "Pretexting involves creating a believable fake scenario to manipulate a target into providing information or access." },
      { id: "q2", question: "An attacker calls claiming to be from IT and asks for your password. What should you do?", options: ["Provide the password since they're from IT", "Ask for their employee ID and call back through the official IT number", "Email them the password instead", "Give them a temporary password"], correctIndex: 1, explanation: "Always verify the identity of anyone requesting sensitive information through an independent, trusted channel." },
    ],
    durationMinutes: 5,
    difficulty: "intermediate" as const,
    language: "en" as const,
    isBuiltIn: true,
    sortOrder: 3,
  },
  {
    title: "HIPAA Security Awareness",
    description: "Protect patient health information and maintain HIPAA compliance.",
    category: "Compliance - HIPAA",
    content: `# HIPAA Security Awareness

## What is HIPAA?
The Health Insurance Portability and Accountability Act (HIPAA) establishes national standards for protecting sensitive patient health information (PHI — Protected Health Information).

## What Counts as PHI?
Any information that can identify a patient and relates to their health, including:
- Names, addresses, dates of birth
- Medical record numbers
- Health conditions and treatment history
- Insurance information
- Any combination of data that could identify an individual

## Your Obligations Under HIPAA
1. **Access Control**: Only access PHI you need to do your job (minimum necessary rule)
2. **Secure Communication**: Never send PHI via unencrypted email
3. **Physical Security**: Lock your screen when away from your desk
4. **Reporting**: Report any suspected breach immediately
5. **Training**: Complete required HIPAA training annually

## Common HIPAA Violations
- Discussing patient information in public areas
- Sending PHI to personal email accounts
- Leaving patient records visible on screen
- Sharing login credentials

## Penalties
HIPAA violations can result in fines from $100 to $50,000 per violation, with annual maximums up to $1.9 million.`,
    quizJson: [
      { id: "q1", question: "What does PHI stand for?", options: ["Personal Health Insurance", "Protected Health Information", "Private Healthcare Identifier", "Patient Health Index"], correctIndex: 1, explanation: "PHI stands for Protected Health Information — any information that identifies a patient and relates to their health." },
      { id: "q2", question: "Under HIPAA's 'minimum necessary' rule, you should:", options: ["Access all patient records to be thorough", "Only access PHI needed to perform your job duties", "Share PHI freely within your organization", "Store PHI on personal devices for convenience"], correctIndex: 1, explanation: "The minimum necessary rule requires limiting PHI access and disclosure to only what is needed for the specific task." },
      { id: "q3", question: "You receive a phishing email asking you to log into a patient portal. What should you do?", options: ["Log in to check if there's an issue", "Forward it to your colleagues", "Report it to your security team and do not click any links", "Reply asking for more information"], correctIndex: 2, explanation: "Phishing attacks targeting healthcare workers can lead to HIPAA breaches. Always report suspicious emails." },
    ],
    durationMinutes: 5,
    difficulty: "intermediate" as const,
    language: "en" as const,
    isBuiltIn: true,
    sortOrder: 4,
  },
  {
    title: "PCI DSS Compliance Basics",
    description: "Protect cardholder data and understand your PCI DSS responsibilities.",
    category: "Compliance - PCI DSS",
    content: `# PCI DSS Compliance Basics

## What is PCI DSS?
The Payment Card Industry Data Security Standard (PCI DSS) is a set of security requirements designed to protect cardholder data for organizations that handle credit card transactions.

## Who Must Comply?
Any organization that stores, processes, or transmits cardholder data — from small retailers to large enterprises.

## Key Requirements
1. **Protect cardholder data**: Never store full card numbers, CVV codes, or PINs unnecessarily
2. **Encrypt transmission**: Always use encryption when transmitting cardholder data
3. **Access control**: Restrict access to cardholder data on a need-to-know basis
4. **Monitor and test**: Regularly test security systems and processes
5. **Maintain a security policy**: Keep an information security policy for all personnel

## What You Should Never Do
- Write down card numbers or CVV codes
- Email cardholder data
- Store CVV codes after authorization
- Share access credentials to payment systems

## Phishing and PCI DSS
Phishing attacks targeting payment systems are a major PCI DSS risk. A successful phishing attack can lead to:
- Cardholder data theft
- PCI DSS non-compliance
- Fines up to $100,000 per month
- Loss of ability to process card payments`,
    quizJson: [
      { id: "q1", question: "Which of the following should NEVER be stored after a transaction?", options: ["Cardholder name", "Last 4 digits of card number", "CVV/CVC security code", "Transaction date"], correctIndex: 2, explanation: "CVV/CVC codes must never be stored after authorization — this is a core PCI DSS requirement." },
      { id: "q2", question: "A customer calls and asks you to process their payment over email. You should:", options: ["Accept the card details via email for convenience", "Refuse and direct them to a secure payment channel", "Write down the details and process later", "Forward the email to billing"], correctIndex: 1, explanation: "Cardholder data must never be transmitted via email. Always use secure, PCI-compliant payment channels." },
    ],
    durationMinutes: 4,
    difficulty: "intermediate" as const,
    language: "en" as const,
    isBuiltIn: true,
    sortOrder: 5,
  },
  {
    title: "GDPR Data Protection Essentials",
    description: "Understand your obligations under GDPR and protect personal data.",
    category: "Compliance - GDPR",
    content: `# GDPR Data Protection Essentials

## What is GDPR?
The General Data Protection Regulation (GDPR) is a European Union law that governs how organizations collect, store, and process personal data of EU residents.

## Key Principles
1. **Lawfulness**: You must have a legal basis for processing personal data
2. **Purpose limitation**: Data collected for one purpose cannot be used for another
3. **Data minimization**: Only collect data that is necessary
4. **Accuracy**: Keep personal data accurate and up to date
5. **Storage limitation**: Don't keep data longer than necessary
6. **Security**: Protect data against unauthorized access

## Individual Rights Under GDPR
- Right to access their data
- Right to correct inaccurate data
- Right to erasure ("right to be forgotten")
- Right to data portability
- Right to object to processing

## Breach Notification
Under GDPR, data breaches must be reported to the supervisory authority within **72 hours** of discovery.

## Penalties
GDPR fines can reach up to **€20 million or 4% of global annual turnover**, whichever is higher.

## Phishing and GDPR
A successful phishing attack that leads to a personal data breach triggers GDPR breach notification obligations and potential fines.`,
    quizJson: [
      { id: "q1", question: "Under GDPR, how quickly must a data breach be reported to authorities?", options: ["24 hours", "48 hours", "72 hours", "7 days"], correctIndex: 2, explanation: "GDPR requires notification of data breaches to the supervisory authority within 72 hours of becoming aware of the breach." },
      { id: "q2", question: "What is the 'right to be forgotten' under GDPR?", options: ["The right to forget your password", "The right to have your personal data deleted", "The right to opt out of marketing emails", "The right to remain anonymous online"], correctIndex: 1, explanation: "The right to erasure (right to be forgotten) allows individuals to request deletion of their personal data." },
    ],
    durationMinutes: 5,
    difficulty: "intermediate" as const,
    language: "en" as const,
    isBuiltIn: true,
    sortOrder: 6,
  },
  {
    title: "Email Security and Safe Practices",
    description: "Master email security to prevent data breaches and malware infections.",
    category: "Email Security",
    content: `# Email Security and Safe Practices

## Why Email is Risky
Email is the #1 attack vector for cybercriminals. Over 90% of cyberattacks begin with a phishing email.

## Identifying Suspicious Emails

### Check the Sender
- Look at the full email address, not just the display name
- "John from IT" could be sending from john@evil-domain.com
- Watch for subtle misspellings: micros0ft.com, paypa1.com

### Examine Links Before Clicking
- Hover over links to see the actual destination URL
- Look for HTTPS (but note: phishing sites can also use HTTPS)
- Be suspicious of shortened URLs (bit.ly, tinyurl)

### Attachments
- Never open unexpected attachments, even from known senders
- Be especially cautious with: .exe, .zip, .doc with macros, .pdf
- When in doubt, contact the sender via phone to verify

## Safe Email Practices
- Use your corporate email for work — not personal email
- Don't forward sensitive information to personal accounts
- Enable spam filters and report phishing emails
- Use email encryption for sensitive communications
- Think before you click — every time

## What to Do if You Click a Phishing Link
1. Disconnect from the network immediately
2. Report to your IT/security team
3. Change your passwords from a clean device
4. Monitor your accounts for suspicious activity`,
    quizJson: [
      { id: "q1", question: "How can you check where a link actually goes before clicking?", options: ["Click it quickly and close if suspicious", "Hover your mouse over the link to see the URL", "Copy and paste it into a new tab", "Ask the sender to confirm it's safe"], correctIndex: 1, explanation: "Hovering over a link reveals the actual destination URL in your browser's status bar, helping you spot suspicious links." },
      { id: "q2", question: "You receive an unexpected invoice attachment from a vendor you know. What should you do?", options: ["Open it — it's from someone you know", "Call the vendor through their official number to verify before opening", "Forward it to your manager", "Save it for later"], correctIndex: 1, explanation: "Attackers often compromise or spoof known contacts. Always verify unexpected attachments through a separate communication channel." },
    ],
    durationMinutes: 5,
    difficulty: "beginner" as const,
    language: "en" as const,
    isBuiltIn: true,
    sortOrder: 7,
  },
  {
    title: "Remote Work Security",
    description: "Stay secure while working from home or on the go.",
    category: "Remote Work",
    content: `# Remote Work Security

## The Remote Work Risk Landscape
Remote work expands the attack surface significantly. Home networks, personal devices, and public Wi-Fi create new vulnerabilities.

## Secure Your Home Network
- Change your router's default password
- Use WPA3 or WPA2 encryption
- Keep router firmware updated
- Create a separate guest network for IoT devices

## VPN Usage
Always connect through your company's VPN when accessing corporate resources. VPN encrypts your traffic and routes it through a secure server.

## Device Security
- Lock your screen when stepping away (Windows: Win+L, Mac: Cmd+Ctrl+Q)
- Use full-disk encryption (BitLocker on Windows, FileVault on Mac)
- Keep your OS and applications updated
- Don't use personal devices for work without IT approval

## Public Wi-Fi Dangers
- Never access sensitive work systems on public Wi-Fi without VPN
- Attackers can set up fake "free Wi-Fi" hotspots
- Even legitimate public Wi-Fi can be monitored

## Video Conferencing Security
- Use meeting passwords and waiting rooms
- Be aware of what's visible in your background
- Don't share screen unless necessary
- Verify participants before discussing sensitive topics`,
    quizJson: [
      { id: "q1", question: "What should you always use when accessing company resources remotely?", options: ["A strong password", "A VPN", "Two monitors", "A personal email account"], correctIndex: 1, explanation: "A VPN (Virtual Private Network) encrypts your connection and ensures secure access to corporate resources from remote locations." },
      { id: "q2", question: "You're at a coffee shop and need to check work email. What should you do?", options: ["Connect to the free café Wi-Fi — it's convenient", "Use your phone's hotspot or VPN before connecting", "Wait until you get home", "Use a different email account"], correctIndex: 1, explanation: "Public Wi-Fi is unsecured. Always use a VPN or your phone's personal hotspot for work activities in public." },
    ],
    durationMinutes: 4,
    difficulty: "beginner" as const,
    language: "en" as const,
    isBuiltIn: true,
    sortOrder: 8,
  },
  {
    title: "Ransomware Prevention",
    description: "Understand ransomware threats and how to prevent devastating attacks.",
    category: "Malware Awareness",
    content: `# Ransomware Prevention

## What is Ransomware?
Ransomware is malicious software that encrypts your files and demands payment (ransom) for the decryption key. Modern ransomware attacks can cost organizations millions of dollars.

## How Ransomware Spreads
1. **Phishing emails** with malicious attachments or links (most common)
2. **Malicious websites** that exploit browser vulnerabilities
3. **Infected USB drives** or external media
4. **Remote Desktop Protocol (RDP)** vulnerabilities
5. **Software vulnerabilities** in unpatched systems

## Prevention Strategies
- **Backup regularly**: Follow the 3-2-1 rule (3 copies, 2 different media, 1 offsite)
- **Keep software updated**: Patches fix vulnerabilities ransomware exploits
- **Don't click suspicious links**: Most ransomware starts with phishing
- **Disable macros**: Don't enable macros in Office documents from unknown sources
- **Use endpoint protection**: Keep antivirus/EDR software current

## If You Suspect Ransomware
1. **Immediately disconnect** from the network (unplug ethernet, disable Wi-Fi)
2. **Do NOT pay the ransom** — it doesn't guarantee file recovery
3. **Report immediately** to IT security
4. **Preserve evidence** — don't restart or shut down the computer

## The Cost of Ransomware
- Average ransom payment: $812,000 (2022)
- Average total cost including downtime: $4.5 million
- Recovery time: Average 23 days`,
    quizJson: [
      { id: "q1", question: "What is the most common way ransomware infects systems?", options: ["USB drives", "Phishing emails", "Software downloads", "Network scanning"], correctIndex: 1, explanation: "Phishing emails with malicious attachments or links are the most common ransomware delivery mechanism." },
      { id: "q2", question: "If you suspect your computer has ransomware, what should you do FIRST?", options: ["Pay the ransom to recover files quickly", "Restart the computer", "Disconnect from the network immediately", "Call your manager"], correctIndex: 2, explanation: "Immediately disconnecting from the network prevents ransomware from spreading to other systems and network shares." },
    ],
    durationMinutes: 5,
    difficulty: "intermediate" as const,
    language: "en" as const,
    isBuiltIn: true,
    sortOrder: 9,
  },
  {
    title: "Insider Threat Awareness",
    description: "Recognize and prevent insider threats within your organization.",
    category: "Insider Threats",
    content: `# Insider Threat Awareness

## What is an Insider Threat?
An insider threat is a security risk that originates from within the organization — employees, contractors, or business partners who misuse their authorized access.

## Types of Insider Threats

### Malicious Insiders
Employees who intentionally steal data, sabotage systems, or assist external attackers — often motivated by financial gain, revenge, or ideology.

### Negligent Insiders
Well-meaning employees who accidentally cause security incidents through careless behavior — clicking phishing links, mishandling data, or losing devices.

### Compromised Insiders
Employees whose credentials have been stolen by external attackers, who then use those credentials to access systems.

## Warning Signs
- Accessing data outside normal job responsibilities
- Downloading large amounts of data
- Working odd hours with unusual system access
- Expressing dissatisfaction or grievances
- Attempting to bypass security controls

## Prevention
- Follow the principle of least privilege
- Report suspicious colleague behavior to security (not to the colleague)
- Secure your credentials — never share passwords
- Lock your screen and secure physical documents
- Follow data handling policies

## Your Responsibility
If you see something, say something. Reporting suspicious behavior is not betrayal — it protects everyone.`,
    quizJson: [
      { id: "q1", question: "Which type of insider threat is caused by careless but well-meaning employees?", options: ["Malicious insider", "Negligent insider", "Compromised insider", "External insider"], correctIndex: 1, explanation: "Negligent insiders cause security incidents through careless behavior, not malicious intent — like clicking phishing links." },
      { id: "q2", question: "A colleague asks to borrow your login credentials 'just this once.' What should you do?", options: ["Share them — they're a trusted colleague", "Refuse and report the request to your security team", "Give them a temporary password", "Let them use your computer while you watch"], correctIndex: 1, explanation: "Sharing credentials violates security policy and creates accountability issues. Report such requests to your security team." },
    ],
    durationMinutes: 4,
    difficulty: "intermediate" as const,
    language: "en" as const,
    isBuiltIn: true,
    sortOrder: 10,
  },
  {
    title: "Data Classification and Handling",
    description: "Learn how to properly classify and handle sensitive organizational data.",
    category: "Data Security",
    content: `# Data Classification and Handling

## Why Data Classification Matters
Not all data is equally sensitive. Proper classification ensures that the right level of protection is applied to the right data.

## Common Classification Levels

### Public
Information that can be freely shared with anyone. Example: marketing materials, press releases.

### Internal
Information for employees only. Example: internal policies, org charts, meeting notes.

### Confidential
Sensitive business information with limited distribution. Example: financial reports, customer lists, contracts.

### Restricted / Top Secret
Highly sensitive data requiring the strictest controls. Example: trade secrets, personal health information, payment card data.

## Handling Guidelines

| Classification | Storage | Transmission | Disposal |
|---|---|---|---|
| Public | Any system | Any method | Regular deletion |
| Internal | Corporate systems | Corporate email | Secure deletion |
| Confidential | Encrypted storage | Encrypted email | Shredding/secure wipe |
| Restricted | Encrypted, access-controlled | Encrypted, need-to-know | Certified destruction |

## Common Mistakes
- Sending confidential data via personal email
- Storing sensitive files on unencrypted USB drives
- Leaving printed sensitive documents on desks
- Sharing confidential information in public places

## Your Responsibility
Always identify the classification of data before sharing, storing, or transmitting it.`,
    quizJson: [
      { id: "q1", question: "Which data classification level requires the strictest protection?", options: ["Public", "Internal", "Confidential", "Restricted"], correctIndex: 3, explanation: "Restricted (or Top Secret) data requires the highest level of protection, including encryption, strict access controls, and certified destruction." },
      { id: "q2", question: "How should you dispose of printed confidential documents?", options: ["Throw them in the recycling bin", "Leave them in the printer tray", "Shred them using a cross-cut shredder", "Tear them by hand"], correctIndex: 2, explanation: "Confidential printed documents should be shredded using a cross-cut shredder to prevent reconstruction." },
    ],
    durationMinutes: 4,
    difficulty: "beginner" as const,
    language: "en" as const,
    isBuiltIn: true,
    sortOrder: 11,
  },
  {
    title: "Business Email Compromise (BEC)",
    description: "Recognize and prevent sophisticated BEC attacks targeting your organization.",
    category: "Phishing Awareness",
    content: `# Business Email Compromise (BEC)

## What is BEC?
Business Email Compromise is a sophisticated scam targeting organizations that conduct wire transfers or handle sensitive data. Attackers impersonate executives, vendors, or trusted parties to authorize fraudulent transfers.

## How BEC Works
1. **Reconnaissance**: Attackers research your organization — executives' names, vendor relationships, ongoing deals
2. **Impersonation**: They spoof or compromise a trusted email account
3. **Request**: They send an urgent request for a wire transfer, gift cards, or sensitive data
4. **Pressure**: They create urgency and ask for secrecy ("Don't tell anyone until it's done")

## Common BEC Scenarios
- **CEO Fraud**: "CEO" requests urgent wire transfer while traveling
- **Vendor Impersonation**: Fake invoice from a real vendor with changed bank details
- **Attorney Impersonation**: Fake lawyer requests confidential information
- **Employee Payroll Diversion**: Request to change direct deposit information

## Red Flags
- Unusual urgency or secrecy
- Request to bypass normal approval processes
- Last-minute changes to payment instructions
- Pressure to act before verifying

## Prevention
- Verify all wire transfer requests via phone using a known number
- Implement dual-approval for large transfers
- Confirm any changes to vendor banking information independently
- Train finance and HR staff specifically on BEC

## The Numbers
BEC attacks cost organizations over **$2.7 billion** in 2022 (FBI IC3 Report).`,
    quizJson: [
      { id: "q1", question: "What is the most effective way to verify a wire transfer request from your CEO?", options: ["Reply to the email asking for confirmation", "Call the CEO using a number you already have on file", "Check if the email address looks correct", "Ask a colleague if the request seems legitimate"], correctIndex: 1, explanation: "Always verify wire transfer requests by calling the requester using a phone number you already have — not one provided in the suspicious email." },
      { id: "q2", question: "A vendor emails saying their bank account has changed and asks you to update payment details. What should you do?", options: ["Update the details — they're a trusted vendor", "Call the vendor using their official number to verify the change", "Email back asking for proof", "Process the next payment to the new account to test it"], correctIndex: 1, explanation: "Bank account change requests are a classic BEC tactic. Always verify through an independent, pre-established communication channel." },
    ],
    durationMinutes: 5,
    difficulty: "advanced" as const,
    language: "en" as const,
    isBuiltIn: true,
    sortOrder: 12,
  },
  {
    title: "Mobile Device Security",
    description: "Protect your mobile devices and the data they contain.",
    category: "Device Security",
    content: `# Mobile Device Security

## Why Mobile Security Matters
Mobile devices contain enormous amounts of sensitive data — emails, contacts, documents, and access to corporate systems. Lost or compromised devices can lead to significant data breaches.

## Essential Security Measures

### Device Protection
- Use a strong PIN, password, or biometric lock
- Enable automatic screen lock after 1-2 minutes of inactivity
- Enable remote wipe capability (Find My iPhone / Android Device Manager)
- Keep your OS and apps updated

### App Security
- Only install apps from official stores (App Store, Google Play)
- Review app permissions — does a flashlight app need access to your contacts?
- Remove apps you no longer use
- Be cautious of apps requesting excessive permissions

### Network Security
- Avoid connecting to unknown Wi-Fi networks
- Use a VPN on public Wi-Fi
- Disable Bluetooth and Wi-Fi when not in use
- Be cautious of QR codes — they can redirect to malicious sites

### Smishing (SMS Phishing)
- Be suspicious of unexpected text messages with links
- Don't click links in texts from unknown numbers
- Banks and government agencies don't ask for sensitive info via text

## If Your Device is Lost or Stolen
1. Report to IT immediately
2. Remotely wipe the device if possible
3. Change passwords for all accounts accessed on the device
4. Report to your carrier to suspend service`,
    quizJson: [
      { id: "q1", question: "What should you do immediately if your work phone is lost or stolen?", options: ["Wait to see if it turns up", "Report to IT and remotely wipe if possible", "Change your email password only", "Buy a new phone first"], correctIndex: 1, explanation: "Immediately reporting a lost device to IT allows them to remotely wipe sensitive data before it can be accessed." },
      { id: "q2", question: "You receive a text message with a link saying your bank account is locked. What should you do?", options: ["Click the link to check your account", "Call your bank using the number on the back of your card", "Reply to the text asking for more information", "Forward it to your bank's email"], correctIndex: 1, explanation: "This is a classic smishing attack. Always contact your bank directly using their official phone number, never through a link in a text message." },
    ],
    durationMinutes: 4,
    difficulty: "beginner" as const,
    language: "en" as const,
    isBuiltIn: true,
    sortOrder: 13,
  },
  {
    title: "Incident Response Basics",
    description: "Know what to do when a security incident occurs.",
    category: "Incident Response",
    content: `# Incident Response Basics

## What is a Security Incident?
A security incident is any event that threatens the confidentiality, integrity, or availability of information or systems. Examples include:
- Clicking a phishing link
- Receiving suspicious emails
- Noticing unusual account activity
- Finding a USB drive in the parking lot
- Witnessing a colleague accessing unauthorized data

## Why Reporting Matters
**Early reporting saves organizations millions.** The average time to identify a breach is 207 days — the longer it takes, the more damage is done. Your report could stop an attack in its tracks.

## The Incident Response Process
1. **Identify**: Recognize that something suspicious has occurred
2. **Contain**: Stop the spread (disconnect from network, don't forward suspicious emails)
3. **Report**: Notify your IT/security team immediately
4. **Preserve**: Don't delete anything — evidence is critical
5. **Cooperate**: Work with the security team during investigation

## What to Report
- Suspicious emails (even if you didn't click)
- Unusual system behavior
- Unexpected password change notifications
- Unauthorized access attempts
- Lost or stolen devices
- Accidental data disclosure

## How to Report
Know your organization's reporting procedure:
- Security team email/hotline
- IT helpdesk
- Your manager (for physical security incidents)

## Common Mistakes
- Waiting to see if the problem resolves itself
- Trying to fix it yourself without reporting
- Deleting suspicious emails before IT can analyze them
- Being embarrassed to report — it happens to everyone`,
    quizJson: [
      { id: "q1", question: "You accidentally clicked a link in a suspicious email. What should you do?", options: ["Close the browser and hope nothing happened", "Immediately disconnect from the network and report to IT", "Run a quick antivirus scan and continue working", "Delete the email and don't tell anyone"], correctIndex: 1, explanation: "Immediate disconnection and reporting gives the security team the best chance to contain any potential damage." },
      { id: "q2", question: "Why is it important to report security incidents quickly?", options: ["To avoid getting in trouble", "To help IT improve their systems", "To minimize damage — early detection significantly reduces breach costs", "It's required by company policy"], correctIndex: 2, explanation: "Early detection and reporting dramatically reduces the cost and impact of security incidents. Every hour of delay increases potential damage." },
    ],
    durationMinutes: 4,
    difficulty: "beginner" as const,
    language: "en" as const,
    isBuiltIn: true,
    sortOrder: 14,
  },
  {
    title: "Cloud Security Awareness",
    description: "Securely use cloud services and protect data stored in the cloud.",
    category: "Cloud Security",
    content: `# Cloud Security Awareness

## Cloud Security Risks
Cloud services (Google Drive, OneDrive, Dropbox, AWS) offer convenience but introduce new security risks if not used properly.

## Common Cloud Security Mistakes

### Oversharing
- Sharing files with "Anyone with the link" when only specific people need access
- Forgetting to revoke access when someone leaves the organization
- Using personal cloud accounts for work data

### Weak Authentication
- Not enabling MFA on cloud accounts
- Using weak or reused passwords
- Sharing account credentials with colleagues

### Shadow IT
Using unauthorized cloud services (personal Dropbox, free file sharing sites) for work data — IT can't protect what they don't know about.

## Best Practices

### Access Control
- Share files with specific people, not "anyone with the link"
- Regularly review and revoke unnecessary sharing
- Use your organization's approved cloud services only

### Authentication
- Enable MFA on all cloud accounts
- Use strong, unique passwords
- Review active sessions and revoke unknown devices

### Data Protection
- Understand what data is appropriate for cloud storage
- Don't store highly sensitive data in personal cloud accounts
- Be aware of where your data is physically stored (data residency)

## Cloud Phishing
Attackers increasingly use cloud platforms to host phishing pages (Google Forms, OneDrive, SharePoint) because they appear legitimate. Always verify the URL carefully.`,
    quizJson: [
      { id: "q1", question: "What is 'Shadow IT'?", options: ["IT systems that run at night", "Unauthorized technology used without IT's knowledge", "Backup systems in case of failure", "IT systems used by executives"], correctIndex: 1, explanation: "Shadow IT refers to technology, software, or services used within an organization without IT department approval or knowledge." },
      { id: "q2", question: "You need to share a confidential document with one colleague. What is the most secure option?", options: ["Share with 'Anyone with the link' for convenience", "Post it in a public folder", "Share specifically with their email address and set an expiration", "Email it as an attachment instead"], correctIndex: 2, explanation: "Sharing with a specific person and setting an expiration date ensures only the intended recipient can access the file for a limited time." },
    ],
    durationMinutes: 4,
    difficulty: "intermediate" as const,
    language: "en" as const,
    isBuiltIn: true,
    sortOrder: 15,
  },
];
