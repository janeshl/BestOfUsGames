
import express from "express";
import compression from "compression";
import cors from "cors";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(compression());
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

// Proxy endpoint for Groq (OpenAI-compatible)
app.post("/api/chat", async (req, res) => {
  try{
    if(!GROQ_API_KEY){
      return res.status(500).json({ error: "GROQ_API_KEY missing on server" });
    }
    const { messages=[], model="llama-3.3-70b-versatile", temperature=0.9, response_format } = req.body || {};

    const payload = { model, temperature, messages };
    if(response_format) payload.response_format = response_format;

    const r = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify(payload)
    });
    const data = await r.json();
    if(!r.ok){
      console.error("Groq error:", data);
      return res.status(r.status).json(data);
    }
    res.json(data);
  }catch(err){
    console.error("Proxy failed:", err);
    res.status(500).json({ error: "proxy_failed", details: String(err) });
  }
});

// Static files
app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));

// Fallback route -> index.html
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("AI Games Hub running on port", PORT));
