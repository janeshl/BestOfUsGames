document.addEventListener("DOMContentLoaded", () => {
  const panels = {
    selection: document.getElementById("game-selection"),
    future: document.getElementById("future-input-section"),
    lie: document.getElementById("lie-section"),
    characterTopic: document.getElementById("character-topic-section"),
    output: document.getElementById("output-section")
  };

  const outputBox = document.getElementById("output");
  const guessInput = document.getElementById("guess-input");
  const guessBtn = document.getElementById("guess-submit-btn");

  let currentGame = null;
  let characterGameState = { topic: "", round: 0 };

  function showPanel(panel) {
    Object.values(panels).forEach(p => p.classList.add("hidden"));
    panel.classList.remove("hidden");
    gsap.fromTo(panel, { opacity: 0, y: 50 }, { opacity: 1, y: 0, duration: 0.6, ease: "power2.out" });
  }

  // Main menu buttons
  document.getElementById("future-btn").addEventListener("click", () => {
    currentGame = "future";
    showPanel(panels.future);
  });

  document.getElementById("lies-btn").addEventListener("click", () => {
    currentGame = "lies";
    showPanel(panels.lie);
  });

  document.getElementById("character-btn").addEventListener("click", () => {
    currentGame = "character";
    showPanel(panels.characterTopic);
  });

  // Future prediction play
  document.getElementById("future-play-btn").addEventListener("click", async () => {
    const name = document.getElementById("name-input").value.trim();
    const month = document.getElementById("month-input").value.trim();
    const place = document.getElementById("place-input").value.trim();
    if (!name || !month || !place) return alert("Fill all fields");

    showPanel(panels.output);
    outputBox.innerHTML = "Calculating your destiny...";

    const res = await fetch("/api/future-prediction", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, month, place })
    });
    const data = await res.json();
    outputBox.innerHTML = data.prediction;
  });

  // Lie game start
  document.getElementById("lie-play-btn").addEventListener("click", async () => {
    showPanel(panels.output);
    const res = await fetch("/api/guess-lie");
    const data = await res.json();
    outputBox.innerHTML = data.question;
    guessInput.classList.remove("hidden");
    guessBtn.classList.remove("hidden");
  });

  // Character topic start
  document.getElementById("character-start-btn").addEventListener("click", async () => {
    characterGameState.topic = document.getElementById("topic-select").value;
    characterGameState.round = 1;

    showPanel(panels.output);
    outputBox.innerHTML = `Ask your first question about the mystery character in topic: ${characterGameState.topic}`;
    guessInput.classList.remove("hidden");
    guessBtn.classList.remove("hidden");

    await fetch("/api/character-start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic: characterGameState.topic })
    });
  });

  // Guess or question submit
  guessBtn.addEventListener("click", async () => {
    const text = guessInput.value.trim();
    if (!text) return;

    if (currentGame === "lies") {
      const res = await fetch("/api/guess-lie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guess: text })
      });
      const data = await res.json();
      outputBox.innerHTML = data.response;
    }

    if (currentGame === "character") {
      const res = await fetch("/api/character-question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text })
      });
      const data = await res.json();
      outputBox.innerHTML = data.response;
      characterGameState.round++;
      if (characterGameState.round > 10 || data.endGame) {
        guessBtn.disabled = true;
      }
    }

    guessInput.value = "";
  });

  // Reset
  document.getElementById("reset-btn").addEventListener("click", () => {
    guessInput.classList.add("hidden");
    guessBtn.classList.add("hidden");
    guessBtn.disabled = false;
    currentGame = null;
    showPanel(panels.selection);
  });

  // Start screen
  showPanel(panels.selection);
});
