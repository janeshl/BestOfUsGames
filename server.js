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

if (!GROQ_API_KEY) console.warn("⚠️  GROQ_API_KEY not set.");

app.use(express.json({ limit: "1mb" }));
app.use(express.static("public"));
app.use("/api/", rateLimit({ windowMs: 60*1000, max: 30 }));

const sessions = new Map();
const recentByTopic = new Map();
const makeId = customAlphabet("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ", 10);

const PROMPTS = {
  fortune: ({name,birthMonth,favoritePlace}) => [
    { role: "system", content: "You are a funny fortune teller. Create playful, positive predictions in 2-3 sentences. Use the inputs naturally. Keep it light; no health, death, or lottery claims." },
    { role: "user", content: `Make a humorous future prediction for:\nName: ${name}\nBirth month: ${birthMonth}\nFavorite place: ${favoritePlace}` }
  ],
  lieGen: (topic) => [
    { role: "system", content: "Create a Spot-the-Lie quiz. Produce exactly 4 short statements about the given topic: 3 truths and 1 lie. Return strict JSON with keys: statements (array of 4 strings), lieIndex (1-4), hint (short helpful hint). Do NOT add extra text." },
    { role: "user", content: `Topic: ${topic}. JSON only.` }
  ],
  characterCandidates: (topic) => [
    { role: "system", content: "Return STRICT JSON {candidates: string[]} of 5 well-known people or fictional characters related to the topic. No other text." },
    { role: "user", content: `Topic: ${topic}. JSON only.` }
  ],
  characterTurn: ({name, qa, round, text}) => [
    { role: "system", content: `You are running a 20-questions style game. The secret answer is "${name}".
Respond to the user's message as a short yes/no style answer (<= 15 words), without revealing the name.
Also determine if the user is explicitly making a guess of the character's name.
Return strict JSON with keys:
- answer: string
- isGuess: boolean
- guessedName: string
- hint: string (empty if no hint this turn)
If current round is >= 7, include a helpful hint that makes the game easier but does not reveal the name.
Do NOT include extra text.` },
    { role: "user", content: `Previous Q&A:\n${qa}\nCurrent Round: ${round}\nUser message: ${text}` }
  ]
};

async function chatCompletion(messages, temperature = 0.7, max_tokens = 256) {
  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: { "Authorization": `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: GROQ_MODEL, messages, temperature, max_tokens })
  });
  if(!res.ok){ const t = await res.text(); throw new Error(`Groq API ${res.status}: ${t}`); }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content?.trim() ?? "";
}

/* Game 1 */
app.post("/api/predict-future", async (req, res) => {
  try {
    const { name, birthMonth, favoritePlace } = req.body ?? {};
    const messages = PROMPTS.fortune({ name, birthMonth, favoritePlace });
    const content = await chatCompletion(messages, 0.9, 180);
    res.json({ ok: true, content });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

/* Game 2 */
app.post("/api/lie/generate", async (req, res) => {
  try {
    const { topic } = req.body ?? {};
    const messages = PROMPTS.lieGen(topic);
    const raw = await chatCompletion(messages, 0.6, 300);
    let parsed; try { parsed = JSON.parse(raw); } catch { parsed = { statements:[raw,"Option B","Option C","Option D"], lieIndex:1, hint:"One of these looks suspicious." }; }
    const token = makeId();
    sessions.set(token, { lieIndex: parsed.lieIndex, statements: parsed.statements, topic, createdAt: Date.now() });
    res.json({ ok: true, token, statements: parsed.statements, hint: parsed.hint });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.post("/api/lie/verify", (req, res) => {
  const { token, guessIndex } = req.body ?? {};
  const s = sessions.get(token);
  if (!s) return res.status(400).json({ ok: false, error: "Session not found/expired." });
  const correct = Number(guessIndex) === Number(s.lieIndex);
  res.json({ ok: true, correct, answer: s.lieIndex, statements: s.statements });
});

/* Game 3: conversational with hints after round 7 and fresh per-topic choice */
app.post("/api/character/start", async (req, res) => {
  try {
    const { topic } = req.body ?? {};
    const chooseMessages = PROMPTS.characterCandidates(topic);
    let candidates = ["Albert Einstein","Iron Man","Taylor Swift","Narendra Modi","Sherlock Holmes"];
    try {
      const raw = await chatCompletion(chooseMessages, 0.7, 120);
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.candidates) && parsed.candidates.length) candidates = parsed.candidates;
    } catch {}
    const rec = recentByTopic.get(topic) || [];
    let name = candidates.find(c => !rec.map(x=>x.toLowerCase()).includes(c.toLowerCase())) || candidates[0];
    recentByTopic.set(topic, [name, ...rec].slice(0,5));
    const id = makeId();
    sessions.set(id, { type: "character", topic, name, rounds: 0, history: [], createdAt: Date.now() });
    res.json({ ok: true, sessionId: id, message: "Ask yes/no questions about the secret character. You have 10 rounds. Natural guesses are accepted." });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.post("/api/character/turn", async (req, res) => {
  try {
    const { sessionId, text } = req.body ?? {};
    const s = sessions.get(sessionId);
    if (!s) return res.status(400).json({ ok: false, error: "Session not found." });

    const qa = s.history.map((h,i)=>`Q${i+1}: ${h.q}\nA${i+1}: ${h.a}`).join("\n");
    const messages = PROMPTS.characterTurn({ name: s.name, qa, round: s.rounds+1, text });

    let parsed = { answer: "Okay.", isGuess: false, guessedName: "", hint: "" };
    try { const raw = await chatCompletion(messages, 0.4, 160); parsed = JSON.parse(raw); } catch {}

    s.rounds += 1;
    s.history.push({ q: text || "", a: parsed.answer || "" });

    if (parsed.isGuess && parsed.guessedName) {
      const correct = parsed.guessedName.trim().toLowerCase() === s.name.trim().toLowerCase();
      if (correct) {
        sessions.delete(sessionId);
        return res.json({ ok: true, done: true, win: true, name: s.name, answer: parsed.answer, hint: parsed.hint || "" });
      }
    }

    if (s.rounds >= 10) {
      const reveal = `Out of rounds! The character was: ${s.name}.`;
      sessions.delete(sessionId);
      return res.json({ ok: true, done: true, win: false, name: s.name, answer: parsed.answer, hint: parsed.hint || "", message: reveal });
    }

    const showHint = (s.rounds >= 7) && (parsed.hint || "").trim().length;
    res.json({ ok: true, done: false, answer: parsed.answer, hint: showHint ? parsed.hint : "", roundsLeft: 10 - s.rounds });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.get("/healthz", (_req, res) => res.json({ ok: true }));
app.listen(PORT, () => console.log(`✅ http://localhost:${PORT}`));
