import { Resend } from 'resend';
import dotenv from 'dotenv';
import path from 'path';

// Load .env
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function testEmail() {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error("❌ RESEND_API_KEY is not defined in .env");
      process.exit(1);
    }
    console.log("Using Resend API Key:", apiKey.substring(0, 8) + '...');

    const resend = new Resend(apiKey);
    
    // Using default onboarding email if no specific custom from domain is verified
    const fromEmail = 'onboarding@resend.dev';
    const toEmail = 'abpb2007@gmail.com'; 
    
    console.log(`Sending test email from ${fromEmail} to ${toEmail}...`);
    
    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: toEmail,
      subject: 'Resend Connection Test',
      html: '<p>If you see this, <strong>Resend</strong> is successfully configured and working in your Nimbus Backend!</p>'
    });

    if (error) {
      console.error("❌ Failed to send email:", error);
      process.exit(1);
    }
    
    console.log("✅ Email sent successfully! Data:", data);
  } catch (err) {
    console.error("❌ Unexpected error:", err);
    process.exit(1);
  }
}

testEmail();
