import express from "express";
import compression from "compression";
import cors from "cors";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();


// ============================================================
// Paths
// ============================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


// ============================================================
// App Configuration
// ============================================================

const app = express();

app.use(compression());

app.use(cors());

app.use(
  express.json({
    limit: "1mb"
  })
);


// ============================================================
// Environment Variables
// ============================================================

const GROQ_API_KEY =
  process.env.GROQ_API_KEY || "";

const MODEL_NAME =
  process.env.MODEL_NAME ||
  "openai/gpt-oss-120b";

const GROQ_URL =
  "https://api.groq.com/openai/v1/chat/completions";

const PORT =
  process.env.PORT || 3000;


// ============================================================
// Startup Validation
// ============================================================

if (!GROQ_API_KEY) {
  console.warn(
    "WARNING: GROQ_API_KEY is not configured."
  );
}

console.log(
  "Configured Groq model:",
  MODEL_NAME
);


// ============================================================
// Health Check
// ============================================================

app.get("/api/health", (req, res) => {

  res.json({
    status: "ok",
    service: "AI Games Hub",
    groqConfigured: Boolean(GROQ_API_KEY),
    model: MODEL_NAME
  });

});


// ============================================================
// Groq Chat Proxy
// ============================================================

app.post("/api/chat", async (req, res) => {

  try {

    // --------------------------------------------------------
    // Validate API key
    // --------------------------------------------------------

    if (!GROQ_API_KEY) {

      return res.status(500).json({
        error: "GROQ_API_KEY missing on server"
      });

    }


    // --------------------------------------------------------
    // Get request data
    // --------------------------------------------------------

    const {
      messages = [],
      temperature = 0.9,
      response_format
    } = req.body || {};


    // --------------------------------------------------------
    // Validate messages
    // --------------------------------------------------------

    if (!Array.isArray(messages)) {

      return res.status(400).json({
        error: "messages must be an array"
      });

    }


    if (messages.length === 0) {

      return res.status(400).json({
        error: "messages cannot be empty"
      });

    }


    // --------------------------------------------------------
    // Build Groq payload
    //
    // IMPORTANT:
    // Model is controlled by .env.
    //
    // The browser cannot override MODEL_NAME.
    // --------------------------------------------------------

    const payload = {

      model: MODEL_NAME,

      temperature: Number.isFinite(
        Number(temperature)
      )
        ? Number(temperature)
        : 0.9,

      messages

    };


    // --------------------------------------------------------
    // JSON response mode
    // --------------------------------------------------------

    if (response_format) {

      payload.response_format =
        response_format;

    }


    // --------------------------------------------------------
    // Call Groq
    // --------------------------------------------------------

    const groqResponse =
      await fetch(
        GROQ_URL,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            "Authorization":
              `Bearer ${GROQ_API_KEY}`
          },

          body:
            JSON.stringify(payload)
        }
      );


    // --------------------------------------------------------
    // Read Groq response
    // --------------------------------------------------------

    const data =
      await groqResponse.json();


    // --------------------------------------------------------
    // Handle Groq errors
    // --------------------------------------------------------

    if (!groqResponse.ok) {

      console.error(
        "Groq API error:",
        {
          status:
            groqResponse.status,

          data
        }
      );


      return res.status(
        groqResponse.status
      ).json(data);

    }


    // --------------------------------------------------------
    // Return Groq response to frontend
    // --------------------------------------------------------

    return res.json(data);

  } catch (err) {

    console.error(
      "Groq proxy failed:",
      err
    );


    return res.status(500).json({

      error:
        "proxy_failed",

      details:
        String(err?.message || err)

    });

  }

});


// ============================================================
// Static Files
// ============================================================

app.use(
  express.static(
    path.join(
      __dirname,
      "public"
    ),
    {
      extensions: ["html"]
    }
  )
);


// ============================================================
// SPA / Page Fallback
// ============================================================

app.get("*", (req, res) => {

  res.sendFile(
    path.join(
      __dirname,
      "public",
      "index.html"
    )
  );

});


// ============================================================
// Start Server
// ============================================================

app.listen(
  PORT,
  () => {

    console.log(
      `AI Games Hub running on port ${PORT}`
    );

    console.log(
      `Groq model: ${MODEL_NAME}`
    );

  }
);
