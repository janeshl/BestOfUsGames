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
app.use("/api/", rateLimit({ windowMs: 60 * 1000, max: 30 }));

// In-memory session store (demo only)
const sessions = new Map();
const recentByTopic = new Map();          // character selections
const recentQuizByTopic = new Map();      // de-dup quiz questions per topic
const makeId = customAlphabet("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ", 10);

/* --------------------------------
   PROMPTS (all games)
--------------------------------- */
const PROMPTS = {
  // Game 1: Predict the Future
  fortune: ({ name, birthMonth, favoritePlace }) => [
    {
      role: "system",
      content:
        "You are a funny fortune teller. Create playful, positive predictions in 2-3 sentences. Use the inputs naturally. Keep it light; no health, death, or lottery claims.",
    },
    {
      role: "user",
      content: `Make a humorous future prediction for:
Name: ${name}
Birth month: ${birthMonth}
Favorite place: ${favoritePlace}`,
    },
  ],

  // Game 2: 5-Round Quiz (HARD, avoid repeats)
  quizHard: ({ topic, avoid }) => [
    {
      role: "system",
      content: `Create a HARD 5-question multiple-choice quiz for the given topic.
STRICT JSON ONLY with shape:
{ "questions": [ { "question": string, "options": string[4], "answerIndex": 1|2|3|4, "explanation": string } x5 ] }
Rules:
- Difficulty: HARD
- No question should match any in this AVOID list (exact or near-duplicate). Use different angles/facts.
- Cover varied subtopics and require reasoning or detailed facts.
- No extra commentary.`,
    },
    {
      role: "user",
      content: `Topic: ${topic}
AVOID: ${Array.isArray(avoid) && avoid.length ? avoid.join(" | ") : "(none)"}.
Return JSON only.`,
    },
  ],

  // Game 3: Guess the Character (HARD candidates, 10 rounds, hints after round >= 8)
  characterCandidatesHard: (topic) => [
    {
      role: "system",
      content:
        `Return STRICT JSON {"candidates": string[]} of 7 well-known but CHALLENGING people or fictional characters related to the topic.
Guidelines:
- Avoid the most obvious mainstream picks; prefer moderately challenging figures that are still widely known.
- Vary era/medium/region to make guessing non-trivial.
No extra text.`,
    },
    { role: "user", content: `Topic: ${topic}. JSON only.` },
  ],

  characterTurnHard: ({ name, qa, round, roundsMax, text }) => [
    {
      role: "system",
      content: `You are running a yes/no style character guessing game. The secret answer is "${name}".
Respond concisely (<= 15 words), generally in yes/no form without revealing the name directly.
Detect if the user is explicitly guessing the character's name.

Return STRICT JSON with keys:
- answer: string
- isGuess: boolean
- guessedName: string
- hint: string  // Must be helpful and NOT reveal the name. Provide different hints only when round >= 8; otherwise "".

Hints policy:
- Only provide a hint when current round >= 8.
- Hints MUST be materially different across rounds (avoid repeating earlier hints).`,
    },
    {
      role: "user",
      content: `Previous Q&A:
${qa || "(none)"}

Current Round: ${round} of ${roundsMax}
User message: ${text}`,
    },
  ],

  // Game 4: Find the Healthy-Diet
  healthyQuestions: () => [
    {
      role: "system",
      content:
        "Create exactly 8 brief health and diet assessment questions. Cover: age range, sex, activity level, dietary pattern (veg/vegan/omnivore), allergies/intolerances, goals (lose/maintain/gain), typical schedule & meal frequency, cultural/cuisine preferences. Return STRICT JSON {questions: string[8]}. No extra text.",
    },
    { role: "user", content: "Return JSON only." },
  ],

  healthyPlan: ({ questions, answers }) => [
    {
      role: "system",
      content: `You are a careful nutrition assistant. Using the user's responses, create a practical, culturally-flexible, food-based diet plan.
Safety rules:
- Do NOT give medical advice or diagnose; add a short non-medical disclaimer.
- Avoid unsafe extremes; give ranges & substitutions for allergies/intolerances.
- Focus on whole foods, hydration, and sustainable habits.

Output format (plain text):
1) Summary (2-3 bullets)
2) Daily Targets (calorie range, protein/carb/fat ranges)
3) Sample Day (Breakfast, Snack, Lunch, Snack, Dinner)
4) 7-Day Rotation Ideas (bullet list by day with 1–2 meals each)
5) Tips & Substitutions (bullets)
6) Disclaimer (1 line)`,
    },
    {
      role: "user",
      content: `Questions:
${questions.map((q, i) => `Q${i + 1}. ${q}`).join("\n")}

Answers:
${answers.map((a, i) => `A${i + 1}. ${a}`).join("\n")}

Create the plan now.`,
    },
  ],

  // Game 5: Future Price Prediction
  priceProduct: (category) => [
    {
      role: "system",
      content: `Suggest a single popular consumer product in the given category with its realistic current street price and currency.
Return STRICT JSON:
{ "product": string, "price": number, "currency": "USD"|"EUR"|"INR"|"GBP", "reason": string }
No extra text.`,
    },
    {
      role: "user",
      content: `Category (optional): ${category || "general electronics"}. JSON only.`,
    },
  ],

  priceQuestions: (product) => [
    {
      role: "system",
      content: `Write exactly 10 concise YES/NO questions about future scenarios that could move the 5-year price of the given product up or down.
Vary topics: demand, tech improvements, supply chain, regulation, competition, materials cost, macro trends, premium branding, accessories, after-sales.
Return STRICT JSON: { "questions": string[10] }. No extra text.`,
    },
    { role: "user", content: `Product: ${product}. JSON only.` },
  ],

  priceForecast: ({ product, currency, currentPrice, qa }) => [
    {
      role: "system",
      content: `You are a cautious forecaster. Based on YES/NO answers to 10 scenarios, estimate a plausible 5-year retail price for the product.
Rules:
- Do NOT claim certainty; this is a playful estimate.
- Keep the number reasonable relative to current price and answers.
- Return STRICT JSON: { "predictedPrice": number, "explanation": string (<= 120 words) }`,
    },
    {
      role: "user",
      content: `Product: ${product}
Currency: ${currency}
Current Price: ${currentPrice}
Answers (Y/N):
${qa.map((a, i) => `Q${i + 1}: ${a.q}\nA${i + 1}: ${a.a ? "Yes" : "No"}`).join("\n")}
JSON only.`,
    },
  ],

  // Game 6: Budget Glam Builder (30 items)
  glamSuggest: ({ gender, budgetInr }) => [
    {
      role: "system",
      content: `Suggest 30 skincare/beauty products appropriate for the specified gender (or unisex).
Rules:
- Currency: INR
- Each item price should be reasonable for Indian market; can vary widely but keep realistic.
- Cover diverse uses: cleanser, moisturizer, SPF/sunscreen, serum, exfoliant, toner/essence, face mask, lip care, hand/body care, hair care, spot treatment, eye cream, primer, etc.
- Include both everyday basics and a few extras; avoid duplicate names.
- Keep descriptions <= 15 words.
- Mark ecoFriendly=true for recyclable/mineral-filter/clean-formulation/refill options.

Return STRICT JSON:
{
  "items": [
    { "name": string, "price": number, "description": string, "category": string, "ecoFriendly": boolean }
    x30
  ]
}`,
    },
    {
      role: "user",
      content: `Gender: ${gender || "Unisex"}
BudgetINR: ${budgetInr}
JSON only.`,
    },
  ],

  glamScore: ({ budgetInr, selected, timeTaken }) => [
    {
      role: "system",
      content: `Score a player's beauty kit (0-100) based on:
- Budget utilization (closer to budget without exceeding is better)
- Coverage of protection & care: sunscreen/SPF, cleanser, moisturizer, serum/treatment; plus extras (lip/body/hair)
- Timing (<=180s is best; small penalty if slightly over)
- Synergy/combination (avoid redundant roles; cover AM/PM)
- Eco friendliness (higher share of ecoFriendly items gets bonus)

Output STRICT JSON:
{
  "score": number,
  "positives": string[],
  "negatives": string[],
  "summary": string
}`,
    },
    {
      role: "user",
      content: `BudgetINR: ${budgetInr}
TimeTakenSeconds: ${timeTaken}

Selected Items (${selected.length}):
${selected.map((it, i) => `#${i + 1} ${it.name} — ₹${it.price} — ${it.category} — eco:${it.ecoFriendly}`).join("\n")}

TotalSpend: ₹${selected.reduce((s, x) => s + Number(x.price || 0), 0)}
JSON only.`,
    },
  ],
};

/* --------------------------------
   Groq Chat Completion helper
--------------------------------- */
async function chatCompletion(messages, temperature = 0.7, max_tokens = 256) {
  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: GROQ_MODEL, messages, temperature, max_tokens }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Groq API ${res.status}: ${t}`);
  }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content?.trim() ?? "";
}

// Utility: normalize question for de-dup
function normQ(s) {
  return String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

/* =================================
   Game 1: Predict the Future
================================= */
app.post("/api/predict-future", async (req, res) => {
  try {
    const { name, birthMonth, favoritePlace } = req.body ?? {};
    const messages = PROMPTS.fortune({ name, birthMonth, favoritePlace });
    const content = await chatCompletion(messages, 0.9, 180);
    res.json({ ok: true, content });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* =================================
   Game 2: 5-Round Quiz (HARD + no repeats)
================================= */
async function generateHardQuiz(topic) {
  const avoidSet = new Set(recentQuizByTopic.get(topic) || []);
  const avoidArr = Array.from(avoidSet);
  let questions = [];
  let attempts = 0;
  while (questions.length < 5 && attempts < 3) {
    attempts++;
    let parsed = { questions: [] };
    try {
      const raw = await chatCompletion(PROMPTS.quizHard({ topic, avoid: avoidArr }), 0.4, 1100);
      parsed = JSON.parse(raw);
    } catch {}
    const batch = (parsed.questions || []).filter(q => !!q?.question);
    for (const q of batch) {
      const key = normQ(q.question);
      if (!avoidSet.has(key)) {
        avoidSet.add(key);
        questions.push(q);
        if (questions.length === 5) break;
      }
    }
  }
  // Ensure we have 5; fill with placeholders if short
  while (questions.length < 5) {
    const i = questions.length + 1;
    questions.push({
      question: `Challenging placeholder Q${i} about ${topic}?`,
      options: ["Option A", "Option B", "Option C", "Option D"],
      answerIndex: 1,
      explanation: "Placeholder due to generation limits."
    });
  }
  // record last 50 questions for this topic
  const saved = Array.from(avoidSet).slice(-50);
  recentQuizByTopic.set(topic, saved);
  return questions;
}

app.post("/api/quiz/start", async (req, res) => {
  try {
    const { topic } = req.body ?? {};
    const questions = await generateHardQuiz(topic || "General Knowledge");
    const token = "QZ" + Math.random().toString(36).slice(2, 10).toUpperCase();
    sessions.set(token, {
      type: "quiz",
      topic,
      idx: 0,
      score: 0,
      questions,
      createdAt: Date.now(),
    });
    const q = questions[0];
    res.json({
      ok: true,
      token,
      idx: 1,
      total: 5,
      question: q.question,
      options: q.options,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post("/api/quiz/answer", (req, res) => {
  try {
    const { token, choice } = req.body ?? {};
    const s = sessions.get(token);
    if (!s || s.type !== "quiz")
      return res.status(400).json({ ok: false, error: "Session not found/expired." });
    const q = s.questions[s.idx];
    const correct = Number(choice) === Number(q.answerIndex);
    if (correct) s.score += 1;
    const explanation = q.explanation || "";
    s.idx += 1;
    const done = s.idx >= 5;
    if (done) {
      sessions.delete(token);
      return res.json({ ok: true, done: true, correct, explanation, score: s.score, total: 5 });
    }
    const next = s.questions[s.idx];
    res.json({ ok: true, done: false, correct, explanation, next: { idx: s.idx + 1, total: 5, question: next.question, options: next.options } });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* =================================
   Game 3: Guess the Character (HARD)
   - 10 rounds
   - Provide different hints from round 8 onwards
================================= */
const ROUNDS_MAX = 10;

app.post("/api/character/start", async (req, res) => {
  try {
    const { topic } = req.body ?? {};
    const chooseMessages = PROMPTS.characterCandidatesHard(topic);
    let candidates = ["Ada Lovelace", "Gandalf", "Frida Kahlo", "Mahatma Gandhi", "Marie Curie", "Katniss Everdeen", "Nikola Tesla"];
    try {
      const raw = await chatCompletion(chooseMessages, 0.6, 160);
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.candidates) && parsed.candidates.length) candidates = parsed.candidates;
    } catch {}
    const rec = recentByTopic.get(topic) || [];
    let name = candidates.find(c => !rec.map(x=>x.toLowerCase()).includes(c.toLowerCase())) || candidates[0];
    recentByTopic.set(topic, [name, ...rec].slice(0,7));
    const id = makeId();
    sessions.set(id, { type: "character", topic, name, rounds: 0, history: [], lastHint: "", createdAt: Date.now() });
    res.json({ ok: true, sessionId: id, message: `Guess the character! You have ${ROUNDS_MAX} rounds. Ask strategic yes/no questions. Hints begin after round 8.` });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.post("/api/character/turn", async (req, res) => {
  try {
    const { sessionId, text } = req.body ?? {};
    const s = sessions.get(sessionId);
    if (!s) return res.status(400).json({ ok: false, error: "Session not found." });

    const qa = s.history.map((h,i)=>`Q${i+1}: ${h.q}\nA${i+1}: ${h.a}`).join("\n");
    const currentRound = s.rounds + 1;
    const messages = PROMPTS.characterTurnHard({ name: s.name, qa, round: currentRound, roundsMax: ROUNDS_MAX, text });

    let parsed = { answer: "Okay.", isGuess: false, guessedName: "", hint: "" };
    try { const raw = await chatCompletion(messages, 0.4, 220); parsed = JSON.parse(raw); } catch {}

    // enforce hint policy server-side
    let hintOut = "";
    if (currentRound >= 8 && parsed.hint && parsed.hint.trim()) {
      const h = parsed.hint.trim();
      if (h.toLowerCase() !== String(s.lastHint || "").trim().toLowerCase()) {
        hintOut = h;
        s.lastHint = h;
      }
    }

    s.rounds += 1;
    s.history.push({ q: text || "", a: parsed.answer || "" });

    // Guess check
    if (parsed.isGuess && parsed.guessedName) {
      const correct = parsed.guessedName.trim().toLowerCase() === s.name.trim().toLowerCase();
      if (correct) {
        sessions.delete(sessionId);
        return res.json({ ok: true, done: true, win: true, name: s.name, answer: parsed.answer, hint: hintOut });
      }
    }

    if (s.rounds >= ROUNDS_MAX) {
      const reveal = `Out of rounds! The character was: ${s.name}.`;
      sessions.delete(sessionId);
      return res.json({ ok: true, done: true, win: false, name: s.name, answer: parsed.answer, hint: hintOut, message: reveal });
    }

    const roundsLeft = ROUNDS_MAX - s.rounds;
    res.json({ ok: true, done: false, answer: parsed.answer, hint: hintOut, roundsLeft });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

/* =================================
   Game 4: Find the Healthy-Diet
================================= */
app.post("/api/healthy/start", async (_req, res) => {
  try {
    let questions = [
      "What is your age range (e.g., 18–24, 25–34, 35–44, 45+)?",
      "What is your sex assigned at birth?",
      "What is your typical activity level (sedentary, light, moderate, high)?",
      "Do you follow a dietary pattern (veg/vegan/omnivore/other)?",
      "Any allergies or intolerances (e.g., dairy, nuts, gluten)?",
      "Your primary goal (lose/maintain/gain/energy/other)?",
      "What’s your typical daily schedule & preferred meal frequency?",
      "Any cuisine preferences or foods you enjoy/avoid?",
    ];
    try {
      const raw = await chatCompletion(PROMPTS.healthyQuestions(), 0.4, 220);
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.questions) && parsed.questions.length === 8) {
        questions = parsed.questions;
      }
    } catch {}
    const token = "HD" + Math.random().toString(36).slice(2, 10).toUpperCase();
    sessions.set(token, { type: "healthy", questions, createdAt: Date.now() });
    res.json({ ok: true, token, questions });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.post("/api/healthy/plan", async (req, res) => {
  try {
    const { token, answers } = req.body ?? {};
    const s = sessions.get(token);
    if (!s || s.type !== "healthy")
      return res.status(400).json({ ok: false, error: "Session not found/expired." });
    if (!Array.isArray(answers) || answers.length !== 8) {
      return res.status(400).json({ ok: false, error: "Please provide all 8 answers." });
    }
    const messages = PROMPTS.healthyPlan({ questions: s.questions, answers });
    const content = await chatCompletion(messages, 0.6, 1200);
    sessions.delete(token);
    res.json({ ok: true, plan: content });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

/* =================================
   Game 5: Future Price Prediction (robust)
   - hide AI price until guess
================================= */
app.post("/api/fpp/start", async (req, res) => {
  try {
    const { category } = req.body ?? {};
    let suggestion = { product: "Wireless Earbuds", price: 3999, currency: "INR", reason: "Popular mid-range pick" };
    try {
      const raw = await chatCompletion(PROMPTS.priceProduct(category), 0.6, 220);
      const parsed = JSON.parse(raw);
      if (parsed?.product && parsed?.price && parsed?.currency) suggestion = parsed;
    } catch {}
    let questions = [
      "Will new features significantly improve this product in 5 years?",
      "Will raw material costs rise substantially?",
      "Will competition intensify in this category?",
      "Will regulations add compliance costs?",
      "Will the brand move more upmarket (premium)?",
      "Will manufacturing become cheaper via scale or automation?",
      "Will demand grow among young consumers?",
      "Will substitutes (e.g., a new tech) reduce demand?",
      "Will after-sales/service bundles become standard?",
      "Will import/export duties increase?",
    ];
    try {
      const rawQ = await chatCompletion(PROMPTS.priceQuestions(suggestion.product), 0.4, 280);
      const parsedQ = JSON.parse(rawQ);
      if (Array.isArray(parsedQ?.questions) && parsedQ.questions.length === 10) questions = parsedQ.questions;
    } catch {}
    const token = "FP" + Math.random().toString(36).slice(2, 10).toUpperCase();
    sessions.set(token, {
      type: "fpp",
      product: suggestion.product,
      currency: suggestion.currency,
      currentPrice: Number(suggestion.price) || 0,
      questions,
      answers: [],
      predictedPrice: null,
      explanation: "",
    });
    res.json({ ok: true, token, product: suggestion.product, currentPrice: suggestion.price, currency: suggestion.currency, reason: suggestion.reason, questions });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.post("/api/fpp/answers", async (req, res) => {
  try {
    const { token, answers } = req.body ?? {};
    const s = sessions.get(token);
    if (!s || s.type !== "fpp") return res.status(400).json({ ok: false, error: "Session not found/expired." });
    if (!Array.isArray(answers) || answers.length !== 10) return res.status(400).json({ ok: false, error: "Send an array of 10 booleans for answers." });
    s.answers = answers.map(Boolean);
    const qa = s.questions.map((q, i) => ({ q, a: s.answers[i] }));
    let predicted = { predictedPrice: Math.max(1, s.currentPrice * 1.2), explanation: "Baseline estimate with modest growth." };
    try {
      const raw = await chatCompletion(PROMPTS.priceForecast({ product: s.product, currency: s.currency, currentPrice: s.currentPrice, qa }), 0.5, 500);
      const parsed = JSON.parse(raw);
      if (typeof parsed?.predictedPrice === "number" && isFinite(parsed.predictedPrice)) predicted.predictedPrice = parsed.predictedPrice;
      if (typeof parsed?.explanation === "string") predicted.explanation = parsed.explanation;
    } catch {}
    s.predictedPrice = Number(predicted.predictedPrice);
    s.explanation = predicted.explanation || "";
    res.json({ ok: true }); // keep price hidden
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.post("/api/fpp/guess", (req, res) => {
  try {
    const { token, guess } = req.body ?? {};
    const s = sessions.get(token);
    if (!s || s.type !== "fpp") return res.status(400).json({ ok: false, error: "Session not found/expired." });
    if (typeof guess !== "number" || !isFinite(guess)) return res.status(400).json({ ok: false, error: "Provide numeric 'guess'." });
    if (typeof s.predictedPrice !== "number" || !isFinite(s.predictedPrice)) return res.status(400).json({ ok: false, error: "Prediction not ready. Submit answers first." });
    const ai = s.predictedPrice;
    const tolerance = 0.6 * Math.abs(ai);
    const win = Math.abs(guess - ai) <= tolerance;
    sessions.delete(token);
    res.json({ ok: true, win, playerGuess: guess, aiPrice: ai, currency: s.currency, message: win ? "🎉 Great guess! You matched within 60%." : "❌ Not quite. Better luck next time!", explanation: s.explanation });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

/* =================================
   Game 6: Budget Glam Builder
   - Start: min budget ₹10,000, 30 items
   - Score: min selection 12, timer measured client-side
================================= */
app.post("/api/glam/start", async (req, res) => {
  try {
    const { gender = "Unisex", budgetInr } = req.body ?? {};
    const budget = Math.max(10000, Number(budgetInr) || 15000);

    // Fallback list (30 items)
    let items = Array.from({ length: 30 }).map((_, i) => ({
      name: `Starter Item ${i + 1}`,
      price: Math.floor(250 + Math.random() * 1500),
      description: "A practical everyday pick.",
      category: ["Cleanser","Moisturizer","Sunscreen","Serum","Lip Care","Body","Hair","Mask","Toner","Eye Cream","Primer","Exfoliant"][i % 12],
      ecoFriendly: i % 3 === 0,
    }));

    try {
      const raw = await chatCompletion(PROMPTS.glamSuggest({ gender, budgetInr: budget }), 0.5, 1600);
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.items) && parsed.items.length >= 20) {
        items = parsed.items.slice(0,30).map(it => ({
          name: String(it.name || "").slice(0,80),
          price: Math.max(50, Number(it.price) || 0),
          description: String(it.description || "").slice(0,120),
          category: String(it.category || "Other").slice(0,40),
          ecoFriendly: !!it.ecoFriendly,
        }));
        while (items.length < 30) {
          items.push({ name:`Extra Item ${items.length+1}`, price: Math.floor(300 + Math.random()*1200), description:"Useful addition.", category:"Other", ecoFriendly: Math.random()<0.3 });
        }
      }
    } catch {}

    const token = "GB" + Math.random().toString(36).slice(2, 10).toUpperCase();
    sessions.set(token, { type:"glam", gender, budgetInr: budget, items, createdAt: Date.now() });
    res.json({ ok: true, token, gender, budgetInr: budget, items });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.post("/api/glam/score", async (req, res) => {
  try {
    const { token, selectedIndices, timeTaken } = req.body ?? {};
    const s = sessions.get(token);
    if (!s || s.type !== "glam") return res.status(400).json({ ok: false, error: "Session not found/expired." });

    const idxs = Array.isArray(selectedIndices) ? selectedIndices : [];
    const uniqueIdxs = [...new Set(idxs)].filter(i => Number.isInteger(i) && i >= 0 && i < s.items.length);
    const selected = uniqueIdxs.map(i => s.items[i]);
    const total = selected.reduce((sum, it) => sum + Number(it.price || 0), 0);
    const secs = Math.max(0, Number(timeTaken) || 0);

    if (selected.length < 12) {
      sessions.delete(token);
      return res.json({ ok: true, done: true, win: false, autoFinished: secs >= 180, score: 0, summary: "You must pick at least 12 products.", budgetInr: s.budgetInr, totalSpend: total, timeTaken: secs, positives: [], negatives: ["Picked fewer than 12 products"] });
    }

    let scored = { score: 0, positives: [], negatives: [], summary: "No summary." };
    try {
      const raw = await chatCompletion(PROMPTS.glamScore({ budgetInr: s.budgetInr, selected, timeTaken: secs }), 0.4, 1200);
      const parsed = JSON.parse(raw);
      if (typeof parsed.score === "number") scored.score = Math.max(0, Math.min(100, parsed.score));
      if (Array.isArray(parsed.positives)) scored.positives = parsed.positives.slice(0,6);
      if (Array.isArray(parsed.negatives)) scored.negatives = parsed.negatives.slice(0,6);
      if (typeof parsed.summary === "string") scored.summary = parsed.summary;
    } catch {}

    sessions.delete(token);

    const win = scored.score >= 75;
    res.json({ ok: true, done: true, win, score: scored.score, summary: scored.summary, positives: scored.positives, negatives: scored.negatives, budgetInr: s.budgetInr, totalSpend: total, timeTaken: secs, message: win ? `🎉 Great build! Score ${scored.score}/100` : `❌ Try again. Score ${scored.score}/100` });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

/* =================================
   Healthcheck
================================= */
app.get("/healthz", (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`✅ Server running at http://localhost:${PORT}`));
