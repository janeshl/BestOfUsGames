const express = require("express");
const path = require("path");
 
const app = express();
const PORT = process.env.PORT || 3000;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
 
const configuredModel =
  process.env.GROQ_MODEL ||
  process.env.MODEL_NAME ||
  "openai/gpt-oss-120b";
 
const DEPRECATED_MODEL_MAP = new Map([
  ["llama-3.1-8b-instant", "openai/gpt-oss-20b"],
  ["llama-3.3-70b-versatile", "openai/gpt-oss-120b"],
  ["qwen/qwen3-32b", "openai/gpt-oss-120b"],
  ["meta-llama/llama-4-scout-17b-16e-instruct", "openai/gpt-oss-120b"],
  ["llama3-70b-8192", "openai/gpt-oss-120b"],
]);
 
const GROQ_MODEL =
  DEPRECATED_MODEL_MAP.get(configuredModel) || configuredModel;
 
const GROQ_URL =
  "https://api.groq.com/openai/v1/chat/completions";
 
if (!GROQ_API_KEY) {
  console.warn("⚠️ GROQ_API_KEY not set.");
}
 
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));
 
const sessions = new Map();
 
/* ========================
   JSON PARSER
======================== */
 
function extractJson(raw) {
  if (typeof raw !== "string") return null;
 
  const cleaned = raw
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
 
  try {
    return JSON.parse(cleaned);
  } catch {}
 
  const starts = [
    cleaned.indexOf("{"),
    cleaned.indexOf("["),
  ]
    .filter((i) => i >= 0)
    .sort((a, b) => a - b);
 
  for (const start of starts) {
    const open = cleaned[start];
    const close = open === "{" ? "}" : "]";
 
    const end = cleaned.lastIndexOf(close);
 
    if (end > start) {
      try {
        return JSON.parse(
          cleaned.slice(start, end + 1)
        );
      } catch {}
    }
  }
 
  return null;
}
 
/* ========================
   GROQ API
======================== */
 
async function chatCompletion(
  messages,
  temperature = 0.7,
  max_tokens = 256
) {
  if (!GROQ_API_KEY) {
    throw new Error(
      "GROQ_API_KEY is not configured on the server."
    );
  }
 
  const body = {
    model: GROQ_MODEL,
    messages,
    temperature: Math.min(
      2,
      Math.max(0.01, Number(temperature) || 0.7)
    ),
    max_tokens: Math.max(
      64,
      Number(max_tokens) || 256
    ),
  };
 
  const response = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
 
  if (!response.ok) {
    const text = await response.text();
 
    throw new Error(
      `Groq API ${response.status}: ${text.slice(0, 1200)}`
    );
  }
 
  const data = await response.json();
 
  const content =
    data?.choices?.[0]?.message?.content;
 
  if (
    typeof content !== "string" ||
    !content.trim()
  ) {
    throw new Error("Groq returned an empty response.");
  }
 
  return content.trim();
}
 
/* ========================
   RIDDLE QUEST
======================== */
 
const RIDDLE_PROMPT = (theme = "General") => [
  {
    role: "system",
    content: `
Create exactly 5 original, solvable riddles
about the requested theme.
 
Return STRICT JSON ONLY:
 
{
  "riddles": [
    {
      "riddle": "string",
      "answer": "string",
      "hint": "string"
    }
  ]
}
 
Rules:
- Exactly 5 riddles.
- Short and family-friendly.
- One clear answer per riddle.
- No markdown.
- No explanation outside JSON.
`,
  },
  {
    role: "user",
    content: `Theme: ${theme || "General"}. JSON only.`,
  },
];
 
app.post("/api/riddle/start", async (req, res) => {
  try {
    const theme =
      String(req.body?.theme || "General")
        .trim()
        .slice(0, 80) || "General";
 
    const fallback = [
      {
        riddle:
          "I have keys but no locks, space but no room. What am I?",
        answer: "keyboard",
        hint: "You use me to type.",
      },
      {
        riddle:
          "I get wetter as I dry. What am I?",
        answer: "towel",
        hint: "You use me after a bath.",
      },
      {
        riddle:
          "I have hands but cannot clap. What am I?",
        answer: "clock",
        hint: "I tell you the time.",
      },
      {
        riddle:
          "I have one eye but cannot see. What am I?",
        answer: "needle",
        hint: "Thread passes through me.",
      },
      {
        riddle:
          "The more you take, the more you leave behind. What are they?",
        answer: "footsteps",
        hint: "You make them while walking.",
      },
    ];
 
    let riddles = fallback;
 
    try {
      const raw = await chatCompletion(
        RIDDLE_PROMPT(theme),
        0.7,
        900
      );
 
      const parsed = extractJson(raw);
 
      if (
        Array.isArray(parsed?.riddles) &&
        parsed.riddles.length === 5
      ) {
        const cleaned = parsed.riddles
          .map((r) => ({
            riddle: String(r.riddle || "")
              .trim()
              .slice(0, 500),
 
            answer: String(r.answer || "")
              .trim()
              .slice(0, 100),
 
            hint: String(r.hint || "")
              .trim()
              .slice(0, 180),
          }))
          .filter(
            (r) => r.riddle && r.answer
          );
 
        if (cleaned.length === 5) {
          riddles = cleaned;
        }
      }
    } catch (error) {
      console.warn(
        "Riddle generation failed:",
        error.message
      );
    }
 
    const token =
      "RD" +
      Math.random()
        .toString(36)
        .slice(2, 10)
        .toUpperCase();
 
    sessions.set(token, {
      type: "riddle",
      riddles,
      idx: 0,
      score: 0,
      hintsUsed: 0,
      createdAt: Date.now(),
    });
 
    res.json({
      ok: true,
      token,
      total: 5,
      idx: 1,
      score: 0,
      riddle: riddles[0].riddle,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});
 
app.post("/api/riddle/action", (req, res) => {
  try {
    const {
      token,
      action,
      guess,
    } = req.body || {};
 
    const session = sessions.get(token);
 
    if (
      !session ||
      session.type !== "riddle"
    ) {
      return res.status(400).json({
        ok: false,
        error: "Session not found or expired.",
      });
    }
 
    const current =
      session.riddles[session.idx];
 
    if (!current) {
      return res.status(400).json({
        ok: false,
        error: "Invalid riddle state.",
      });
    }
 
    if (action === "hint") {
      session.hintsUsed += 1;
 
      return res.json({
        ok: true,
        hint:
          current.hint ||
          "Think about the wording carefully.",
      });
    }
 
    const normalizedGuess = String(
      guess || ""
    )
      .trim()
      .toLowerCase();
 
    const normalizedAnswer =
      current.answer
        .trim()
        .toLowerCase();
 
    const correct =
      action !== "skip" &&
      normalizedGuess === normalizedAnswer;
 
    if (correct) {
      session.score += 1;
    }
 
    const feedback =
      action === "skip"
        ? `Skipped. Answer: ${current.answer}`
        : correct
        ? "✅ Correct!"
        : `❌ Not quite. Answer: ${current.answer}`;
 
    session.idx += 1;
 
    const done =
      session.idx >= 5;
 
    if (done) {
      const score = session.score;
 
      sessions.delete(token);
 
      return res.json({
        ok: true,
        done: true,
        correct,
        feedback,
        score,
        total: 5,
        message: `Final score: ${score}/5`,
      });
    }
 
    res.json({
      ok: true,
      done: false,
      correct,
      feedback,
      score: session.score,
      idx: session.idx + 1,
      total: 5,
      riddle:
        session.riddles[
          session.idx
        ].riddle,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});
 
/* ========================
   YOUR EXISTING API ROUTES
   Keep all existing routes below
======================== */
 
/*
  IMPORTANT:
  In every existing Groq route, replace:
 
      JSON.parse(raw)
 
  with:
 
      extractJson(raw)
 
  This prevents frontend failures when the
  current Groq model returns JSON inside
  markdown fences or adds a short preamble.
*/
 
/* Example:
 
const raw = await chatCompletion(
  messages,
  0.5,
  1100
);
 
const parsed = extractJson(raw);
 
*/
 
/* ========================
   SAFE JSON
======================== */
 
function safeParseJSON(raw, fallback) {
  const parsed = extractJson(raw);
 
  return parsed === null
    ? fallback
    : parsed;
}
 
/* ========================
   HEALTH CHECK
======================== */
 
app.get("/healthz", (_req, res) => {
  res.json({
    ok: true,
    groqConfigured: Boolean(GROQ_API_KEY),
    model: GROQ_MODEL,
  });
});
 
app.listen(PORT, () => {
  console.log(
    `✅ Server running at http://localhost:${PORT}`
  );
});
