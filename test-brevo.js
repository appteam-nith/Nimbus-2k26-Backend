import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

console.log("Testing Brevo SMTP connection...");
console.log("SMTP_HOST:", process.env.SMTP_HOST || "smtp-relay.brevo.com");
console.log("SMTP_PORT:", process.env.SMTP_PORT || 587);
console.log("EMAIL_USER:", process.env.EMAIL_USER);

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp-relay.brevo.com",
    port: 2525,
    secure: false, 
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
});

async function main() {
    try {
        await transporter.verify();
        console.log("✅ SMTP Connection verified successfully!");
        
        // Try sending a test email to the same address
        const info = await transporter.sendMail({
            from: `"Nimbus Test" <${process.env.EMAIL_USER}>`,
            to: process.env.EMAIL_USER, // Send to self
            subject: "Brevo SMTP Test",
            text: "If you receive this, Brevo SMTP is working!"
        });
        
        console.log("✅ Test email sent! Message ID:", info.messageId);
    } catch (error) {
        console.error("❌ SMTP Error:", error.message);
    }
}

main();
