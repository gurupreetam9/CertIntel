
'use server';

import nodemailer from 'nodemailer';

export interface EmailOptions {
  to: string;
  subject: string;
  text: string;
  html: string;
}

const GMAIL_EMAIL_ADDRESS = process.env.GMAIL_EMAIL_ADDRESS;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;

let transporter: nodemailer.Transporter | null = null;

if (GMAIL_EMAIL_ADDRESS && GMAIL_APP_PASSWORD) {
  try {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: GMAIL_EMAIL_ADDRESS,
        pass: GMAIL_APP_PASSWORD,
      },
    });
    console.log("emailUtils: Nodemailer transporter configured successfully with Gmail credentials.");
  } catch (error) {
    console.error("emailUtils: Failed to create Nodemailer transporter. Check Gmail service or auth configuration.", error);
    transporter = null; // Ensure transporter is null if setup fails
  }
} else {
  console.warn("emailUtils: Gmail credentials (GMAIL_EMAIL_ADDRESS or GMAIL_APP_PASSWORD) are not set in .env.local. Email sending will be simulated to console.");
}

export async function sendEmail(options: EmailOptions): Promise<{ success: boolean; message: string; error?: any }> {
  if (!GMAIL_EMAIL_ADDRESS || !GMAIL_APP_PASSWORD) {
    console.warn("emailUtils: Attempted to send email, but Gmail credentials are not set. Simulating.");
    console.log(`[EMAIL SIMULATION - Credentials Missing] To: ${options.to}, Subject: "${options.subject}", Text: ${options.text.substring(0,100)}...`);
    return { success: true, message: "Email simulated to console (Gmail credentials missing)." };
  }
  
  if (!transporter) {
    console.error("emailUtils: Attempted to send email, but Nodemailer transporter is not initialized. This usually means an issue during setup (e.g., invalid service). Simulating.");
    console.log(`[EMAIL SIMULATION - Transporter Error] To: ${options.to}, Subject: "${options.subject}", Text: ${options.text.substring(0,100)}...`);
    return { success: false, message: "Email simulated to console (Nodemailer transporter not initialized due to setup error)." };
  }

  const mailOptions = {
    from: `"CertIntel" <${GMAIL_EMAIL_ADDRESS}>`,
    ...options,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`Email sent successfully to ${options.to} with subject "${options.subject}". Message ID: ${info.messageId}`);
    return { success: true, message: 'Email sent successfully.' };
  } catch (error: any) {
    console.error(`Error sending email to ${options.to} (Subject: "${options.subject}"):`, error);
    // Fallback log to console if actual sending fails
    console.log(`[EMAIL FALLBACK - Send Error] To: ${options.to}, Subject: "${options.subject}", Text (first 100 chars): ${options.text.substring(0,100)}...`);
    return { success: false, message: `Failed to send email: ${error.message}. Email (for testing): content logged to console.`, error };
  }
}
