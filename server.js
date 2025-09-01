require("dotenv").config();
const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");

const app = express();
app.use(cors());
app.use(express.json());

// Basic rate limiting to avoid abuse (super simple)
const WINDOW_MS = 60_000;
const MAX_REQS = 30;
const hits = new Map();
app.use((req, res, next) => {
  const now = Date.now();
  const ip = req.ip;
  const entry = hits.get(ip) || [];
  const recent = entry.filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (recent.length > MAX_REQS) return res.status(429).json({ ok: false, message: "Too many requests, please try later." });
  next();
});

// Setup transporter from .env
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: Number(process.env.SMTP_PORT) === 465, // true for 465, false otherwise
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Quick email validity check
const isEmail = (e) =>
  typeof e === "string" &&
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

app.post("/api/contact", async (req, res) => {
  try {
    const { email, name, contact, message } = req.body || {};

    // Validate
    if (!isEmail(email)) {
      return res.status(400).json({ ok: false, message: "Invalid email." });
    }
    if (!name || String(name).trim().length < 2) {
      return res.status(400).json({ ok: false, message: "Name is required." });
    }
    if (!contact || String(contact).trim().length < 5) {
      return res.status(400).json({ ok: false, message: "Contact is required." });
    }
    if (!message || String(message).trim().length < 2) {
      return res.status(400).json({ ok: false, message: "Message is required." });
    }

    // Compose mail to your inbox
    const html = `
      <h2>New Contact Form Submission</h2>
      <p><strong>Name:</strong> ${String(name).trim()}</p>
      <p><strong>Email:</strong> ${String(email).trim()}</p>
      <p><strong>Contact:</strong> ${String(contact).trim()}</p>
      <p><strong>Message:</strong></p>
      <p>${String(message).trim().replace(/\n/g, "<br>")}</p>
    `;

    await transporter.sendMail({
      from: process.env.INBOX_FROM || process.env.SMTP_USER,           // sender identity
      to: process.env.INBOX_TO,                                       // your inbox
      replyTo: `"${String(name).trim()}" <${String(email).trim()}>`,  // so you can reply directly
      subject: `Kidz Montessori Academy - Contact Form: ${String(name).trim()}`,
      text: `Name: ${name}\nEmail: ${email}\nContact: ${contact}\n\nMessage:\n${message}`,
      html,
    });

    // (Optional) Auto-reply to the user
    // await transporter.sendMail({
    //   from: process.env.INBOX_FROM || process.env.SMTP_USER,
    //   to: email,
    //   subject: "We received your message",
    //   text: `Hi ${name},\n\nThanks for contacting us! We'll get back to you soon.\n\n— Team`,
    // });

    return res.json({ ok: true, message: "Message sent successfully." });
  } catch (err) {
    console.error("Email error:", err);
    return res.status(500).json({ ok: false, message: "Failed to send message." });
  }
});

// Health check
app.get("/", (_req, res) => res.send("Contact API is running."));

const PORT = Number(process.env.PORT || 4000);
app.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
