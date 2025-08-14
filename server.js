import express from "express";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import { customAlphabet } from "nanoid";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || "llama3-70b-8192";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

if (!GROQ_API_KEY) {
  console.warn("⚠️  GROQ_API_KEY is not set. API routes will fail until you provide it.");
}

app.use(express.json({ limit: "1mb" }));
app.use(express.static("public"));

// Rate limit for API
const limiter = rateLimit({ windowMs: 60 * 1000, max: 30 });
app.use("/api/", limiter);

// Simple in-memory sessions for Character game
const sessions = new Map();
const makeId = customAlphabet("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ", 10);

// Helper to call Groq (OpenAI-compatible chat)
async function chatCompletion(messages, temperature = 0.7, max_tokens = 256) {
  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ model: GROQ_MODEL, messages, temperature, max_tokens })
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Groq API ${res.status}: ${t}`);
  }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content?.trim() ?? "";
}

/* ========== Game 1: Predict the future ========== */
app.post("/api/predict-future", async (req, res) => {
  try {
    const { name, birthMonth, favoritePlace } = req.body ?? {};
    const messages = [
      { role: "system", content: "You are a funny fortune teller. Create funny, technology related positive predictions in 2-3 sentences. Use the inputs naturally. Keep it light; no health, death, or lottery claims." },
      { role: "user", content: `Make a humorous future prediction for:\nName: ${name}\nBirth month: ${birthMonth}\nFavorite place: ${favoritePlace}` }
    ];
    const content = await chatCompletion(messages, 0.9, 180);
    res.json({ ok: true, content });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* ========== Game 2: Spot the lie ========== */
app.post("/api/lie/generate", async (req, res) => {
  try {
    const { topic } = req.body ?? {};
    const messages = [
      { role: "system", content: "Create a Spot-the-Lie quiz. Produce exactly 4 short statements about the given topic: 3 truths and 1 lie. Return strict JSON with keys: statements (array of 4 strings), lieIndex (1-4), hint (short helpful hint). Do NOT add extra text." },
      { role: "user", content: `Topic: ${topic}. JSON only.` }
    ];
    const raw = await chatCompletion(messages, 0.6, 300);
    let parsed;
    try { parsed = JSON.parse(raw); }
    catch {
      parsed = { statements: [raw, "Option B", "Option C", "Option D"], lieIndex: 1, hint: "One of these looks suspicious." };
    }
    const token = makeId();
    sessions.set(token, { lieIndex: parsed.lieIndex, statements: parsed.statements, topic, createdAt: Date.now() });
    res.json({ ok: true, token, statements: parsed.statements, hint: parsed.hint });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post("/api/lie/verify", (req, res) => {
  const { token, guessIndex } = req.body ?? {};
  const s = sessions.get(token);
  if (!s) return res.status(400).json({ ok: false, error: "Session not found/expired." });
  const correct = Number(guessIndex) === Number(s.lieIndex);
  res.json({ ok: true, correct, answer: s.lieIndex, statements: s.statements });
});


/* ========== Game 3 (revised): Player asks questions, AI answers ========== */
/** Start session: AI secretly picks a famous person/character from topic. */
app.post("/api/character/start", async (req, res) => {
  try {
    const { topic } = req.body ?? {};
    const chooseMessages = [
      { role: "system", content: "Pick a single well-known person or fictional character related to the user's topic. Return strict JSON {name:string}. Do not include any other text." },
      { role: "user", content: `Topic: ${topic}.` }
    ];
    const raw = await chatCompletion(chooseMessages, 0.7, 40);
    let name = "a famous person";
    try { name = JSON.parse(raw).name; } catch {}

    const id = makeId();
    sessions.set(id, { type: "character", topic, name, rounds: 0, history: [], createdAt: Date.now() });
    res.json({ ok: true, sessionId: id, message: "Think of good yes/no questions about the secret character. You have 10 rounds!" });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/** Turn: player asks a question and may also guess the character */
app.post("/api/character/turn", async (req, res) => {
  try {
    const { sessionId, question, guess } = req.body ?? {};
    const s = sessions.get(sessionId);
    if (!s) return res.status(400).json({ ok: false, error: "Session not found." });

    // If a guess is provided, check first for an early win
    if (guess && guess.trim().length) {
      const correct = guess.trim().toLowerCase() === s.name.trim().toLowerCase();
      if (correct) {
        sessions.delete(sessionId);
        return res.json({ ok: true, done: true, win: true, name: s.name, answer: "🎯 Correct guess!" });
      }
    }

    // Build an answer to the player's question WITHOUT revealing the character
    const qaContext = s.history.map((h, i) => `Q${i+1}: ${h.q}
A${i+1}: ${h.a}`).join("
");
    const answerMessages = [
      { role: "system", content:
        `You are answering yes/no questions about a secret character: "${s.name}".
Rules:
- Answer the user's question truthfully as short "Yes/No" plus up to ~10 words of context.
- Never reveal, spell, hint at, or anagram the character name.
- If asked directly "are you <name>" or similar, deflect with a playful hint but do not reveal.
- Keep answers under 15 words.`
      },
      { role: "user", content: `Previous Q&A:
${qaContext}

User question: ${question || ""}` }
    ];
    const aiAnswer = await chatCompletion(answerMessages, 0.3, 60);

    // Update rounds and history
    s.rounds += 1;
    s.history.push({ q: question || "", a: aiAnswer || "" });

    if (s.rounds >= 10) {
      const reveal = `Out of rounds! The character was: ${s.name}.`;
      sessions.delete(sessionId);
      return res.json({ ok: true, done: true, win: false, name: s.name, answer: aiAnswer, message: reveal });
    }

    const roundsLeft = 10 - s.rounds;
    res.json({ ok: true, done: false, answer: aiAnswer, roundsLeft });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});


app.listen(PORT, () => {
  console.log(`✅ http://localhost:${PORT}`);
});
