type OutreachLead = { name: string; company: string; country: string; sector: string; email: string }

export function getUsaHipaaEmail(touch: 1|2|3|4, lead: OutreachLead) {
  let subject = '';
  let html = '';
  switch (touch) {
    case 1:
      subject = 'Protect Your Healthcare Organization from Cyber Threats';
      html = `<div style="background-color: #ffffff; max-width: 600px; font-family: sans-serif; padding: 20px;">
        <p>Hi ${lead.name},</p>
        <p>As a ${lead.sector} organization, you're likely aware of the importance of HIPAA compliance.</p>
        <p>Book a demo to learn how PhishSim AI can help: <a href="https://phishsimai.com/demo">https://phishsimai.com/demo</a></p>
        <p>Best, Sarah Mitchell, Founder at PhishSim AI (sarah@phishsimai.com)</p>
        <p>P.S. Non-compliance can result in fines up to $1.9M per violation category per year.</p>
      </div>`;
      break;
    case 2:
      subject = "Don't Let Cyber Attacks Compromise Your Healthcare Data";
      html = `<div style="background-color: #ffffff; max-width: 600px; font-family: sans-serif; padding: 20px;">
        <p>Hi ${lead.name},</p>
        <p>Did you know that 1 in 5 healthcare organizations experience a data breach each year?</p>
        <p>Start a free trial to protect your organization: <a href="https://phishsimai.com/trial">https://phishsimai.com/trial</a></p>
        <p>Best, Sarah Mitchell, Founder at PhishSim AI (sarah@phishsimai.com)</p>
        <p>P.S. Non-compliance can result in fines up to $1.9M per violation category per year.</p>
      </div>`;
      break;
    case 3:
      subject = 'Invest in Cybersecurity to Protect Your Healthcare Organization';
      html = `<div style="background-color: #ffffff; max-width: 600px; font-family: sans-serif; padding: 20px;">
        <p>Hi ${lead.name},</p>
        <p>Every dollar invested in cybersecurity can save up to $3 in breach costs.</p>
        <p>Start your free trial today: <a href="https://phishsimai.com/start">https://phishsimai.com/start</a></p>
        <p>Best, Sarah Mitchell, Founder at PhishSim AI (sarah@phishsimai.com)</p>
        <p>P.S. Non-compliance can result in fines up to $1.9M per violation category per year.</p>
      </div>`;
      break;
    case 4:
      subject = 'Last Chance: Protect Your Healthcare Organization from Cyber Threats';
      html = `<div style="background-color: #ffffff; max-width: 600px; font-family: sans-serif; padding: 20px;">
        <p>Hi ${lead.name},</p>
        <p>This is your last chance to protect your organization from cyber threats.</p>
        <p>Reply to this email to get started: <a href="mailto:sarah@phishsimai.com">sarah@phishsimai.com</a></p>
        <p>Best, Sarah Mitchell, Founder at PhishSim AI (sarah@phishsimai.com)</p>
        <p>P.S. Non-compliance can result in fines up to $1.9M per violation category per year.</p>
      </div>`;
      break;
  }
  return { subject, html };
}

export function getUsaGlbaEmail(touch: 1|2|3|4, lead: OutreachLead) {
  let subject = '';
  let html = '';
  switch (touch) {
    case 1:
      subject = 'Protect Your Financial Institution from Cyber Threats';
      html = `<div style="background-color: #ffffff; max-width: 600px; font-family: sans-serif; padding: 20px;">
        <p>Hi ${lead.name},</p>
        <p>As a ${lead.sector} organization, you're likely aware of the importance of GLBA compliance.</p>
        <p>Book a demo to learn how PhishSim AI can help: <a href="https://phishsimai.com/demo">https://phishsimai.com/demo</a></p>
        <p>Best, Sarah Mitchell, Founder at PhishSim AI (sarah@phishsimai.com)</p>
        <p>P.S. Non-compliance can result in fines up to $100,000 per violation.</p>
      </div>`;
      break;
    case 2:
      subject = "Don't Let Cyber Attacks Compromise Your Financial Data";
      html = `<div style="background-color: #ffffff; max-width: 600px; font-family: sans-serif; padding: 20px;">
        <p>Hi ${lead.name},</p>
        <p>Did you know that 1 in 5 financial institutions experience a data breach each year?</p>
        <p>Start a free trial to protect your organization: <a href="https://phishsimai.com/trial">https://phishsimai.com/trial</a></p>
        <p>Best, Sarah Mitchell, Founder at PhishSim AI (sarah@phishsimai.com)</p>
        <p>P.S. Non-compliance can result in fines up to $100,000 per violation.</p>
      </div>`;
      break;
    case 3:
      subject = 'Invest in Cybersecurity to Protect Your Financial Institution';
      html = `<div style="background-color: #ffffff; max-width: 600px; font-family: sans-serif; padding: 20px;">
        <p>Hi ${lead.name},</p>
        <p>Every dollar invested in cybersecurity can save up to $3 in breach costs.</p>
        <p>Start your free trial today: <a href="https://phishsimai.com/start">https://phishsimai.com/start</a></p>
        <p>Best, Sarah Mitchell, Founder at PhishSim AI (sarah@phishsimai.com)</p>
        <p>P.S. Non-compliance can result in fines up to $100,000 per violation.</p>
      </div>`;
      break;
    case 4:
      subject = 'Last Chance: Protect Your Financial Institution from Cyber Threats';
      html = `<div style="background-color: #ffffff; max-width: 600px; font-family: sans-serif; padding: 20px;">
        <p>Hi ${lead.name},</p>
        <p>This is your last chance to protect your organization from cyber threats.</p>
        <p>Reply to this email to get started: <a href="mailto:sarah@phishsimai.com">sarah@phishsimai.com</a></p>
        <p>Best, Sarah Mitchell, Founder at PhishSim AI (sarah@phishsimai.com)</p>
        <p>P.S. Non-compliance can result in fines up to $100,000 per violation.</p>
      </div>`;
      break;
  }
  return { subject, html };
}

export function getUsaCmmcEmail(touch: 1|2|3|4, lead: OutreachLead) {
  let subject = '';
  let html = '';
  switch (touch) {
    case 1:
      subject = 'Protect Your Defense Organization from Cyber Threats';
      html = `<div style="background-color: #ffffff; max-width: 600px; font-family: sans-serif; padding: 20px;">
        <p>Hi ${lead.name},</p>
        <p>As a ${lead.sector} organization, you're likely aware of the importance of CMMC compliance.</p>
        <p>Book a demo to learn how PhishSim AI can help: <a href="https://phishsimai.com/demo">https://phishsimai.com/demo</a></p>
        <p>Best, Sarah Mitchell, Founder at PhishSim AI (sarah@phishsimai.com)</p>
        <p>P.S. Non-compliance can result in loss of DoD contracts.</p>
      </div>`;
      break;
    case 2:
      subject = "Don't Let Cyber Attacks Compromise Your Defense Data";
      html = `<div style="background-color: #ffffff; max-width: 600px; font-family: sans-serif; padding: 20px;">
        <p>Hi ${lead.name},</p>
        <p>Did you know that 1 in 5 defense organizations experience a data breach each year?</p>
        <p>Start a free trial to protect your organization: <a href="https://phishsimai.com/trial">https://phishsimai.com/trial</a></p>
        <p>Best, Sarah Mitchell, Founder at PhishSim AI (sarah@phishsimai.com)</p>
        <p>P.S. Non-compliance can result in loss of DoD contracts.</p>
      </div>`;
      break;
    case 3:
      subject = 'Invest in Cybersecurity to Protect Your Defense Organization';
      html = `<div style="background-color: #ffffff; max-width: 600px; font-family: sans-serif; padding: 20px;">
        <p>Hi ${lead.name},</p>
        <p>Every dollar invested in cybersecurity can save up to $3 in breach costs.</p>
        <p>Start your free trial today: <a href="https://phishsimai.com/start">https://phishsimai.com/start</a></p>
        <p>Best, Sarah Mitchell, Founder at PhishSim AI (sarah@phishsimai.com)</p>
        <p>P.S. Non-compliance can result in loss of DoD contracts.</p>
      </div>`;
      break;
    case 4:
      subject = 'Last Chance: Protect Your Defense Organization from Cyber Threats';
      html = `<div style="background-color: #ffffff; max-width: 600px; font-family: sans-serif; padding: 20px;">
        <p>Hi ${lead.name},</p>
        <p>This is your last chance to protect your organization from cyber threats.</p>
        <p>Reply to this email to get started: <a href="mailto:sarah@phishsimai.com">sarah@phishsimai.com</a></p>
        <p>Best, Sarah Mitchell, Founder at PhishSim AI (sarah@phishsimai.com)</p>
        <p>P.S. Non-compliance can result in loss of DoD contracts.</p>
      </div>`;
      break;
  }
  return { subject, html };
}

export function getUkEmail(touch: 1|2|3|4, lead: OutreachLead) {
  let subject = '';
  let html = '';
  switch (touch) {
    case 1:
      subject = 'Protect Your UK Organization from Cyber Threats';
      html = `<div style="background-color: #ffffff; max-width: 600px; font-family: sans-serif; padding: 20px;">
        <p>Hi ${lead.name},</p>
        <p>As a ${lead.sector} organization, you're likely aware of the importance of ICO/GDPR compliance.</p>
        <p>Book a demo to learn how PhishSim AI can help: <a href="https://phishsimai.com/demo">https://phishsimai.com/demo</a></p>
        <p>Best, Sarah Mitchell, Founder at PhishSim AI (sarah@phishsimai.com)</p>
        <p>P.S. Non-compliance can result in fines up to £17.5M or 4% global turnover.</p>
      </div>`;
      break;
    case 2:
      subject = "Don't Let Cyber Attacks Compromise Your UK Data";
      html = `<div style="background-color: #ffffff; max-width: 600px; font-family: sans-serif; padding: 20px;">
        <p>Hi ${lead.name},</p>
        <p>Did you know that 1 in 5 UK organizations experience a data breach each year?</p>
        <p>Start a free trial to protect your organization: <a href="https://phishsimai.com/trial">https://phishsimai.com/trial</a></p>
        <p>Best, Sarah Mitchell, Founder at PhishSim AI (sarah@phishsimai.com)</p>
        <p>P.S. Non-compliance can result in fines up to £17.5M or 4% global turnover.</p>
      </div>`;
      break;
    case 3:
      subject = 'Invest in Cybersecurity to Protect Your UK Organization';
      html = `<div style="background-color: #ffffff; max-width: 600px; font-family: sans-serif; padding: 20px;">
        <p>Hi ${lead.name},</p>
        <p>Every dollar invested in cybersecurity can save up to $3 in breach costs.</p>
        <p>Start your free trial today: <a href="https://phishsimai.com/start">https://phishsimai.com/start</a></p>
        <p>Best, Sarah Mitchell, Founder at PhishSim AI (sarah@phishsimai.com)</p>
        <p>P.S. Non-compliance can result in fines up to £17.5M or 4% global turnover.</p>
      </div>`;
      break;
    case 4:
      subject = 'Last Chance: Protect Your UK Organization from Cyber Threats';
      html = `<div style="background-color: #ffffff; max-width: 600px; font-family: sans-serif; padding: 20px;">
        <p>Hi ${lead.name},</p>
        <p>This is your last chance to protect your organization from cyber threats.</p>
        <p>Reply to this email to get started: <a href="mailto:sarah@phishsimai.com">sarah@phishsimai.com</a></p>
        <p>Best, Sarah Mitchell, Founder at PhishSim AI (sarah@phishsimai.com)</p>
        <p>P.S. Non-compliance can result in fines up to £17.5M or 4% global turnover.</p>
      </div>`;
      break;
  }
  return { subject, html };
}

export function getCanadaEmail(touch: 1|2|3|4, lead: OutreachLead) {
  let subject = '';
  let html = '';
  switch (touch) {
    case 1:
      subject = 'Protect Your Canadian Organization from Cyber Threats';
      html = `<div style="background-color: #ffffff; max-width: 600px; font-family: sans-serif; padding: 20px;">
        <p>Hi ${lead.name},</p>
        <p>As a ${lead.sector} organization, you're likely aware of the importance of PIPEDA compliance.</p>
        <p>Book a demo to learn how PhishSim AI can help: <a href="https://phishsimai.com/demo">https://phishsimai.com/demo</a></p>
        <p>Best, Sarah Mitchell, Founder at PhishSim AI (sarah@phishsimai.com)</p>
        <p>P.S. Non-compliance can result in fines up to CAD $100,000 per violation.</p>
      </div>`;
      break;
    case 2:
      subject = "Don't Let Cyber Attacks Compromise Your Canadian Data";
      html = `<div style="background-color: #ffffff; max-width: 600px; font-family: sans-serif; padding: 20px;">
        <p>Hi ${lead.name},</p>
        <p>Did you know that 1 in 5 Canadian organizations experience a data breach each year?</p>
        <p>Start a free trial to protect your organization: <a href="https://phishsimai.com/trial">https://phishsimai.com/trial</a></p>
        <p>Best, Sarah Mitchell, Founder at PhishSim AI (sarah@phishsimai.com)</p>
        <p>P.S. Non-compliance can result in fines up to CAD $100,000 per violation.</p>
      </div>`;
      break;
    case 3:
      subject = 'Invest in Cybersecurity to Protect Your Canadian Organization';
      html = `<div style="background-color: #ffffff; max-width: 600px; font-family: sans-serif; padding: 20px;">
        <p>Hi ${lead.name},</p>
        <p>Every dollar invested in cybersecurity can save up to $3 in breach costs.</p>
        <p>Start your free trial today: <a href="https://phishsimai.com/start">https://phishsimai.com/start</a></p>
        <p>Best, Sarah Mitchell, Founder at PhishSim AI (sarah@phishsimai.com)</p>
        <p>P.S. Non-compliance can result in fines up to CAD $100,000 per violation.</p>
      </div>`;
      break;
    case 4:
      subject = 'Last Chance: Protect Your Canadian Organization from Cyber Threats';
      html = `<div style="background-color: #ffffff; max-width: 600px; font-family: sans-serif; padding: 20px;">
        <p>Hi ${lead.name},</p>
        <p>This is your last chance to protect your organization from cyber threats.</p>
        <p>Reply to this email to get started: <a href="mailto:sarah@phishsimai.com">sarah@phishsimai.com</a></p>
        <p>Best, Sarah Mitchell, Founder at PhishSim AI (sarah@phishsimai.com)</p>
        <p>P.S. Non-compliance can result in fines up to CAD $100,000 per violation.</p>
      </div>`;
      break;
  }
  return { subject, html };
}

export function getAustraliaEmail(touch: 1|2|3|4, lead: OutreachLead): { subject: string; html: string } {
  let subject = '';
  let html = '';
  switch (touch) {
    case 1:
      subject = 'Protect Your Australian Organization from Cyber Threats';
      html = `<div style="background-color: #ffffff; max-width: 600px; font-family: sans-serif; padding: 20px;">Dear ${lead.name},<br><br>We wanted to remind you that as an Australian organization, you are required to comply with the Privacy Act. Our solution can help you achieve this compliance and protect your organization from cyber threats. <a href="#" style="background-color: #007bff; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Book a demo</a> to learn more.<br><br>Best regards,<br>Sarah Mitchell<br><br>P.S. Non-compliance can result in fines up to AUD $50M per violation.</div>`;
      break;
    case 2:
      subject = "Don't Let Cyber Attacks Compromise Your Australian Data";
      html = `<div style="background-color: #ffffff; max-width: 600px; font-family: sans-serif; padding: 20px;">Dear ${lead.name},<br><br>Did you know that 1 in 5 Australian organizations have been breached? Our solution can help you protect your data and prevent cyber attacks. <a href="#" style="background-color: #007bff; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Start your free trial</a> today.<br><br>Best regards,<br>Sarah Mitchell<br><br>P.S. Non-compliance can result in fines up to AUD $50M per violation.</div>`;
      break;
    case 3:
      subject = 'Invest in Cybersecurity to Protect Your Australian Organization';
      html = `<div style="background-color: #ffffff; max-width: 600px; font-family: sans-serif; padding: 20px;">Dear ${lead.name},<br><br>Investing in cybersecurity can have a significant return on investment for your organization. Our solution can help you protect your data and prevent cyber attacks. <a href="#" style="background-color: #007bff; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Start your free trial</a> today.<br><br>Best regards,<br>Sarah Mitchell<br><br>P.S. Non-compliance can result in fines up to AUD $50M per violation.</div>`;
      break;
    case 4:
      subject = 'Last Chance: Protect Your Australian Organization';
      html = `<div style="background-color: #ffffff; max-width: 600px; font-family: sans-serif; padding: 20px;">Dear ${lead.name},<br><br>This is your last chance to protect your Australian organization from cyber threats. If you have any questions or would like to learn more, please <a href="mailto:sarah.mitchell@example.com" style="color: #007bff; text-decoration: none;">reply to this email</a>.<br><br>Best regards,<br>Sarah Mitchell<br><br>P.S. Non-compliance can result in fines up to AUD $50M per violation.</div>`;
      break;
  }
  return { subject, html };
}

export function getUsaDefaultEmail(touch: 1|2|3|4, lead: OutreachLead): { subject: string; html: string } {
  let subject = '';
  let html = '';
  switch (touch) {
    case 1:
      subject = 'Protect Your Organization from Cyber Threats';
      html = `<div style="background-color: #ffffff; max-width: 600px; font-family: sans-serif; padding: 20px;">Dear ${lead.name},<br><br>We wanted to remind you that as a US organization, you are required to comply with various regulations. Our solution can help you achieve this compliance and protect your organization from cyber threats. <a href="#" style="background-color: #007bff; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Book a demo</a> to learn more.<br><br>Best regards,<br>Sarah Mitchell<br><br>P.S. Non-compliance can result in fines up to $50,000 per violation.</div>`;
      break;
    case 2:
      subject = "Don't Let Cyber Attacks Compromise Your Data";
      html = `<div style="background-color: #ffffff; max-width: 600px; font-family: sans-serif; padding: 20px;">Dear ${lead.name},<br><br>Did you know that many US organizations have been breached? Our solution can help you protect your data and prevent cyber attacks. <a href="#" style="background-color: #007bff; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Start your free trial</a> today.<br><br>Best regards,<br>Sarah Mitchell<br><br>P.S. Non-compliance can result in fines up to $50,000 per violation.</div>`;
      break;
    case 3:
      subject = 'Invest in Cybersecurity to Protect Your Organization';
      html = `<div style="background-color: #ffffff; max-width: 600px; font-family: sans-serif; padding: 20px;">Dear ${lead.name},<br><br>Investing in cybersecurity can have a significant return on investment for your organization. Our solution can help you protect your data and prevent cyber attacks. <a href="#" style="background-color: #007bff; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Start your free trial</a> today.<br><br>Best regards,<br>Sarah Mitchell<br><br>P.S. Non-compliance can result in fines up to $50,000 per violation.</div>`;
      break;
    case 4:
      subject = 'Last Chance: Protect Your Organization from Cyber Threats';
      html = `<div style="background-color: #ffffff; max-width: 600px; font-family: sans-serif; padding: 20px;">Dear ${lead.name},<br><br>This is your last chance to protect your organization from cyber threats. If you have any questions or would like to learn more, please <a href="mailto:sarah.mitchell@example.com" style="color: #007bff; text-decoration: none;">reply to this email</a>.<br><br>Best regards,<br>Sarah Mitchell<br><br>P.S. Non-compliance can result in fines up to $50,000 per violation.</div>`;
      break;
  }
  return { subject, html };
}
