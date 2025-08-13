import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(express.json());
app.use(express.static("public"));

const API_KEY = process.env.GROQ_API_KEY;
const MODEL = "llama-3.3-70b-versatile";

// AI Future Prediction
app.post("/api/future-prediction", async (req, res) => {
  const { name, month, place } = req.body;
  const prompt = `You are an AI oracle from 3050. Give a fun, inspiring sci-fi style prediction for:
  Name: ${name}
  Birth Month: ${month}
  Favourite Place: ${place}`;

  const response = await aiChat(prompt);
  res.json({ prediction: response });
});

// Guess the AI’s Lie
let lieAnswer = null;
app.get("/api/guess-lie", async (req, res) => {
  const prompt = "Give 3 statements about yourself as AI, but make one a lie. Number them.";
  const response = await aiChat(prompt);
  lieAnswer = "You must track this manually or store from prompt in production.";
  res.json({ question: response });
});
app.post("/api/guess-lie", async (req, res) => {
  res.json({ response: "Nice try! This round is for demo only." });
});

// Guess the Character
let currentCharacter = null;
app.post("/api/character-start", async (req, res) => {
  const { topic } = req.body;
  const prompt = `Pick a famous person from the topic "${topic}". Only remember it. Do NOT reveal. We'll ask questions later.`;
  currentCharacter = await aiChat(prompt);
  res.json({ started: true });
});
app.post("/api/character-question", async (req, res) => {
  const { question } = req.body;
  const prompt = `Pretend you are ${currentCharacter} and answer the question: "${question}" without revealing your name directly.`;
  const answer = await aiChat(prompt);
  res.json({ response: answer });
});

// AI Chat helper
async function aiChat(prompt) {
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.9
    })
  });
  const data = await r.json();
  return data?.choices?.[0]?.message?.content || "No response";
}

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
