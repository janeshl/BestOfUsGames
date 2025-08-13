import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(express.json());
app.use(express.static("public"));

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

async function askGroq(prompt) {
    const res = await fetch(GROQ_URL, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${GROQ_API_KEY}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model: "mixtral-8x7b-32768",
            messages: [{ role: "user", content: prompt }]
        })
    });
    const data = await res.json();
    return data.choices[0].message.content;
}

app.post("/api/future-prediction", async (req, res) => {
    const { name, month, place } = req.body;
    const prompt = `Make a funny future prediction in 2-3 sentences for a person named ${name}, born in ${month}, who loves ${place}.`;
    res.json({ prediction: await askGroq(prompt) });
});

app.post("/api/ai-lie", async (req, res) => {
    const { topic } = req.body;
    const prompt = `Give me exactly 4 short statements about ${topic}, where 3 are true and 1 is a lie. Do not say which one is the lie.`;
    const text = await askGroq(prompt);
    res.json({ statements: text.split("\n").filter(l => l.trim()) });
});

app.post("/api/start-character", async (req, res) => {
    const { topic } = req.body;
    const prompt = `Pick one famous character or person related to ${topic}. Only respond with the name.`;
    const character = (await askGroq(prompt)).trim();
    res.json({ character });
});

app.post("/api/ask-character", async (req, res) => {
    const { character, question } = req.body;
    const prompt = `You are roleplaying as ${character}. Answer the following question as if you are them, without revealing your name: ${question}`;
    res.json({ answer: await askGroq(prompt) });
});

app.listen(process.env.PORT || 8080, () => console.log("Server running"));
