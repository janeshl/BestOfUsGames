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

// In-memory store (simple demo)
const sessions = new Map();
const recentByTopic = new Map();
const makeId = customAlphabet("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ", 10);

/* ------------------------
   Prompt templates
------------------------- */
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

  // Game 2: 5-Round Quiz
  quiz: (topic) => [
    {
      role: "system",
      content:
        "Create a 5-question multiple-choice quiz for the given topic. For EACH question, provide exactly 4 options and indicate the correct option index. Return STRICT JSON with shape: { questions: [ { question: string, options: string[4], answerIndex: 1|2|3|4, explanation: string } x5 ] }. Keep questions clear, fair, and varied difficulty. Do NOT include any extra text.",
    },
    { role: "user", content: `Topic: ${topic}. Return JSON only.` },
  ],

  // Game 3: Guess the Character
  characterCandidates: (topic) => [
    {
      role: "system",
      content:
        "Return STRICT JSON {candidates: string[]} of 5 well-known people or fictional characters related to the topic. No other text.",
    },
    { role: "user", content: `Topic: ${topic}. JSON only.` },
  ],

  // Conversational (not restricted to yes/no), detects guesses, hint only in last round
  characterTurn: ({ name, qa, round, roundsMax, text, isLastRound }) => [
    {
      role: "system",
      content: `You are running a mystery character chat game. The secret answer is "${name}".

GOAL
- Have a natural, friendly conversation that helps the player deduce the character without revealing the name directly.

RESPONSE STYLE
- Be conversational and helpful (NOT restricted to yes/no). Use 1–2 concise sentences (≤ 40 words total).
- Never state or spell the exact name/title directly; avoid explicit giveaways.
- You may describe traits, era, domain, achievements, relationships, settings, or iconic clues (but progressively).
- Ask brief follow-up questions when helpful to keep the dialogue flowing.

GUESS DETECTION
- Detect if the player is explicitly proposing a name or character (e.g., “Is it X?” or “I guess X”).
- If they are guessing, set isGuess=true and guessedName to their guessed string (best effort).
- Never reveal the real name unless the guess is correct (the server handles win/reveal logic).

HINT POLICY
- Provide exactly ONE helpful hint only if it's the last round (isLastRound=true), otherwise return hint="".
- Hints should narrow the space but not reveal the exact name.

OUTPUT
Return STRICT JSON with keys:
- answer: string (your conversational reply, ≤ 40 words)
- isGuess: boolean
- guessedName: string
- hint: string (MUST be empty unless it's the last round)`,
    },
    {
      role: "user",
      content: `Conversation so far:
${qa || "(none)"}

Round: ${round} of ${roundsMax}
Is Last Round: ${isLastRound}

Player message: ${text}`,
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
      content: `You are a careful nutrition assistant. Using the user's responses, create a practical, culturally-flexible, **food-based** diet plan.
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
${qa
  .map((a, i) => `Q${i + 1}: ${a.q}\nA${i + 1}: ${a.a ? "Yes" : "No"}`)
  .join("\n")}
JSON only.`,
    },
  ],
};

/* ------------------------
   Groq Chat Completion
------------------------- */
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

/* ========================
   Game 1: Predict the Future
======================== */
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

/* ========================
   Game 2: 5-Round Quiz
======================== */
app.post("/api/quiz/start", async (req, res) => {
  try {
    const { topic } = req.body ?? {};
    const messages = PROMPTS.quiz(topic);
    let parsed = { questions: [] };
    try {
      const raw = await chatCompletion(messages, 0.5, 900);
      parsed = JSON.parse(raw);
    } catch {}
    const questions = Array.isArray(parsed.questions)
      ? parsed.questions.slice(0, 5)
      : [];
    while (questions.length < 5) {
      questions.push({
        question: `Placeholder Q${questions.length + 1} about ${topic}?`,
        options: ["Option A", "Option B", "Option C", "Option D"],
        answerIndex: 1,
        explanation:
          "This is a placeholder. Regenerate with a clearer topic for a better quiz.",
      });
    }
    const token =
      "QZ" + Math.random().toString(36).slice(2, 10).toUpperCase();
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
      return res.json({
        ok: true,
        done: true,
        correct,
        explanation,
        score: s.score,
        total: 5,
      });
    }
    const next = s.questions[s.idx];
    res.json({
      ok: true,
      done: false,
      correct,
      explanation,
      next: {
        idx: s.idx + 1,
        total: 5,
        question: next.question,
        options: next.options,
      },
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* ========================
   Game 3: Guess the Character
   - 5 conversational rounds
   - Hint only in the LAST round
======================== */
const ROUNDS_MAX = 5;

app.post("/api/character/start", async (req, res) => {
  try {
    const { topic } = req.body ?? {};
    const chooseMessages = PROMPTS.characterCandidates(topic);
    let candidates = [
      "Albert Einstein",
      "Iron Man",
      "Taylor Swift",
      "Narendra Modi",
      "Sherlock Holmes",
    ];
    try {
      const raw = await chatCompletion(chooseMessages, 0.7, 120);
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.candidates) && parsed.candidates.length)
        candidates = parsed.candidates;
    } catch {}
    const rec = recentByTopic.get(topic) || [];
    let name =
      candidates.find(
        (c) => !rec.map((x) => x.toLowerCase()).includes(c.toLowerCase())
      ) || candidates[0];
    recentByTopic.set(topic, [name, ...rec].slice(0, 5));
    const id = makeId();
    sessions.set(id, {
      type: "character",
      topic,
      name,
      rounds: 0,
      history: [],
      createdAt: Date.now(),
    });
    res.json({
      ok: true,
      sessionId: id,
      message: `Chat with me to figure out the secret character. You have ${ROUNDS_MAX} rounds. Speak naturally—I'll help without revealing the name.`,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post("/api/character/turn", async (req, res) => {
  try {
    const { sessionId, text } = req.body ?? {};
    const s = sessions.get(sessionId);
    if (!s)
      return res.status(400).json({ ok: false, error: "Session not found." });

    const qa = s.history
      .map((h, i) => `Q${i + 1}: ${h.q}\nA${i + 1}: ${h.a}`)
      .join("\n");

    // Work out current round & last-round flag BEFORE incrementing
    const currentRound = s.rounds + 1; // 1..ROUNDS_MAX
    const roundsLeftBefore = ROUNDS_MAX - s.rounds;
    const isLastRound = roundsLeftBefore === 1; // hint only if last

    const messages = PROMPTS.characterTurn({
      name: s.name,
      qa,
      round: currentRound,
      roundsMax: ROUNDS_MAX,
      text,
      isLastRound,
    });

    let parsed = { answer: "Okay.", isGuess: false, guessedName: "", hint: "" };
    try {
      const raw = await chatCompletion(messages, 0.4, 220);
      parsed = JSON.parse(raw);
    } catch {}

    // Record turn
    s.rounds += 1;
    s.history.push({ q: text || "", a: parsed.answer || "" });

    // If guessed, check win
    if (parsed.isGuess && parsed.guessedName) {
      const correct =
        parsed.guessedName.trim().toLowerCase() ===
        s.name.trim().toLowerCase();
      if (correct) {
        sessions.delete(sessionId);
        return res.json({
          ok: true,
          done: true,
          win: true,
          name: s.name,
          answer: parsed.answer,
          hint: parsed.hint || "",
        });
      }
    }

    // Out of rounds?
    if (s.rounds >= ROUNDS_MAX) {
      const reveal = `Out of rounds! The character was: ${s.name}.`;
      sessions.delete(sessionId);
      return res.json({
        ok: true,
        done: true,
        win: false,
        name: s.name,
        answer: parsed.answer,
        hint: parsed.hint || "",
        message: reveal,
      });
    }

    // Continue game
    const roundsLeft = ROUNDS_MAX - s.rounds;
    const hintToShow = isLastRound ? parsed.hint || "" : "";
    res.json({
      ok: true,
      done: false,
      answer: parsed.answer,
      hint: hintToShow,
      roundsLeft,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* ========================
   Game 4: Find the Healthy-Diet
======================== */
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
    const token =
      "HD" + Math.random().toString(36).slice(2, 10).toUpperCase();
    sessions.set(token, { type: "healthy", questions, createdAt: Date.now() });
    res.json({ ok: true, token, questions });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post("/api/healthy/plan", async (req, res) => {
  try {
    const { token, answers } = req.body ?? {};
    const s = sessions.get(token);
    if (!s || s.type !== "healthy")
      return res.status(400).json({ ok: false, error: "Session not found/expired." });
    if (!Array.isArray(answers) || answers.length !== 8) {
      return res
        .status(400)
        .json({ ok: false, error: "Please provide all 8 answers." });
    }
    const messages = PROMPTS.healthyPlan({ questions: s.questions, answers });
    const content = await chatCompletion(messages, 0.6, 1200);
    sessions.delete(token);
    res.json({ ok: true, plan: content });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* ========================
   Game 5: Future Price Prediction
   Flow:
   - /api/fpp/start: suggest product + price + 10 questions
   - /api/fpp/answers: record 10 booleans, compute AI price (DO NOT return it)
   - /api/fpp/guess: evaluate guess vs AI price (±60%), reveal both
======================== */
app.post("/api/fpp/start", async (req, res) => {
  try {
    const { category } = req.body ?? {};
    // 1) Get product + current price
    let suggestion = {
      product: "Wireless Earbuds",
      price: 3999,
      currency: "INR",
      reason: "Popular mid-range pick",
    };
    try {
      const raw = await chatCompletion(PROMPTS.priceProduct(category), 0.6, 220);
      const parsed = JSON.parse(raw);
      if (parsed?.product && parsed?.price && parsed?.currency) suggestion = parsed;
    } catch {}

    // 2) Get 10 yes/no questions
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
      const rawQ = await chatCompletion(
        PROMPTS.priceQuestions(suggestion.product),
        0.4,
        280
      );
      const parsedQ = JSON.parse(rawQ);
      if (Array.isArray(parsedQ?.questions) && parsedQ.questions.length === 10)
        questions = parsedQ.questions;
    } catch {}

    const token =
      "FP" + Math.random().toString(36).slice(2, 10).toUpperCase();
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

    res.json({
      ok: true,
      token,
      product: suggestion.product,
      currentPrice: suggestion.price,
      currency: suggestion.currency,
      reason: suggestion.reason,
      questions,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post("/api/fpp/answers", async (req, res) => {
  try {
    const { token, answers } = req.body ?? {};
    const s = sessions.get(token);
    if (!s || s.type !== "fpp")
      return res.status(400).json({ ok: false, error: "Session not found/expired." });
    if (!Array.isArray(answers) || answers.length !== 10) {
      return res
        .status(400)
        .json({ ok: false, error: "Send an array of 10 booleans for answers." });
    }

    s.answers = answers.map((a) => !!a);
    const qa = s.questions.map((q, i) => ({ q, a: s.answers[i] }));

    // Ask AI to forecast price (but do NOT return it here)
    let predicted = {
      predictedPrice: Math.max(1, s.currentPrice * 1.2),
      explanation: "Baseline estimate with modest growth.",
    };
    try {
      const raw = await chatCompletion(
        PROMPTS.priceForecast({
          product: s.product,
          currency: s.currency,
          currentPrice: s.currentPrice,
          qa,
        }),
        0.5,
        500
      );
      const parsed = JSON.parse(raw);
      if (typeof parsed?.predictedPrice === "number" && isFinite(parsed.predictedPrice)) {
        predicted.predictedPrice = parsed.predictedPrice;
      }
      if (typeof parsed?.explanation === "string") {
        predicted.explanation = parsed.explanation;
      }
    } catch {}

    s.predictedPrice = Number(predicted.predictedPrice);
    s.explanation = predicted.explanation || "";

    // Hide the AI price until the guess step
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post("/api/fpp/guess", (req, res) => {
  try {
    const { token, guess } = req.body ?? {};
    const s = sessions.get(token);
    if (!s || s.type !== "fpp")
      return res.status(400).json({ ok: false, error: "Session not found/expired." });
    if (typeof guess !== "number" || !isFinite(guess)) {
      return res.status(400).json({ ok: false, error: "Provide numeric 'guess'." });
    }
    if (typeof s.predictedPrice !== "number" || !isFinite(s.predictedPrice)) {
      return res
        .status(400)
        .json({ ok: false, error: "Prediction not ready. Submit answers first." });
    }

    const ai = s.predictedPrice;
    const tolerance = 0.6 * Math.abs(ai); // within ±60%
    const win = Math.abs(guess - ai) <= tolerance;

    sessions.delete(token);

    res.json({
      ok: true,
      win,
      playerGuess: guess,
      aiPrice: ai,
      currency: s.currency,
      message: win
        ? "🎉 Great guess! You matched within 60%."
        : "❌ Not quite. Better luck next time!",
      explanation: s.explanation, // optional: include reasoning now
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* ========================
   Healthcheck
======================== */
app.get("/healthz", (_req, res) => res.json({ ok: true }));

app.listen(PORT, () =>
  console.log(`✅ Server running at http://localhost:${PORT}`)
);
