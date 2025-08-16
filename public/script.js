// === Shared helpers ===
async function postJSON(url, data) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.json();
}

function showResult(id, text) {
  const el = document.getElementById(id);
  el.innerHTML = text;
  el.classList.remove("hidden");
}

// === Game 1: Predict the Future ===
const fortuneForm = document.getElementById("fortune-form");
if (fortuneForm) {
  fortuneForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("name").value;
    const month = document.getElementById("month").value;
    const place = document.getElementById("place").value;
    const data = await postJSON("/api/future", { name, month, place });
    showResult("fortune-result", data.reply);
  });
}

// === Game 2: Quiz Challenge ===
const quizBox = document.getElementById("quiz-box");
if (quizBox) {
  let round = 0, score = 0, questions = [];

  async function loadQuiz() {
    const data = await postJSON("/api/quiz", { round });
    questions = data.questions;
    renderQuiz();
  }

  function renderQuiz() {
    if (round >= 10) {
      showResult("quiz-result", `Game Over! Final Score: ${score}/10`);
      quizBox.innerHTML = "";
      return;
    }
    const q = questions[round];
    quizBox.innerHTML = `
      <p><b>Q${round + 1}:</b> ${q.question}</p>
      ${q.options.map((o, i) => `<button class="btn opt" data-i="${i}">${o}</button>`).join("")}
      <p id="timer">Time left: 20s</p>
    `;
    let timeLeft = 20;
    const timer = setInterval(() => {
      timeLeft--;
      document.getElementById("timer").innerText = `Time left: ${timeLeft}s`;
      if (timeLeft <= 0) {
        clearInterval(timer);
        round++;
        renderQuiz();
      }
    }, 1000);

    quizBox.querySelectorAll(".opt").forEach(btn => {
      btn.onclick = () => {
        if (parseInt(btn.dataset.i) === q.answer) score++;
        clearInterval(timer);
        round++;
        renderQuiz();
      };
    });
  }

  loadQuiz();
}

// === Game 3: Guess the Character ===
const charForm = document.getElementById("character-form");
if (charForm) {
  const chat = document.getElementById("character-chat");
  charForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const q = document.getElementById("character-input").value;
    chat.innerHTML += `<p><b>You:</b> ${q}</p>`;
    document.getElementById("character-input").value = "";
    const data = await postJSON("/api/character", { question: q });
    chat.innerHTML += `<p><b>AI:</b> ${data.reply}</p>`;
  });
}

// === Game 4: Healthy Diet Finder ===
const healthyForm = document.getElementById("healthy-form");
if (healthyForm) {
  healthyForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const answers = Array.from(healthyForm.querySelectorAll("input")).map(i => i.value);
    const data = await postJSON("/api/healthy", { answers });
    showResult("healthy-result", data.plan);
  });
}

// === Game 5: Price Prediction ===
const priceForm = document.getElementById("price-form");
if (priceForm) {
  const chat = document.getElementById("price-chat");
  priceForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const product = document.getElementById("product").value;
    const currentPrice = document.getElementById("current-price").value;
    const data = await postJSON("/api/price", { product, currentPrice });
    showResult("price-result", data.result);
  });
}

// === Game 6: Budget Glam Builder ===
const glamForm = document.getElementById("glam-form");
if (glamForm) {
  glamForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const gender = document.getElementById("gender").value;
    const budget = parseInt(document.getElementById("budget").value);
    const data = await postJSON("/api/glam", { gender, budget });
    renderProducts(data.products, budget);
  });

  function renderProducts(products, budget) {
    const container = document.getElementById("glam-products");
    let selected = [];
    let timeLeft = 180;

    function renderPage(page = 0) {
      const start = page * 10, end = start + 10;
      const list = products.slice(start, end);
      container.innerHTML = list.map((p, i) =>
        `<label><input type="checkbox" data-id="${start + i}"> ${p.name} - ₹${p.price} (${p.desc})</label><br>`
      ).join("");
      if (page > 0) container.innerHTML += `<button class="btn" id="prev">Prev</button>`;
      if (end < products.length) container.innerHTML += `<button class="btn" id="next">Next</button>`;
      container.innerHTML += `<p id="timer">Time left: ${timeLeft}s</p>`;
      document.querySelectorAll("input[type=checkbox]").forEach(cb => {
        cb.onchange = () => {
          if (cb.checked) selected.push(products[cb.dataset.id]);
          else selected = selected.filter(p => p !== products[cb.dataset.id]);
        };
      });
      const prev = document.getElementById("prev"), next = document.getElementById("next");
      if (prev) prev.onclick = () => renderPage(page - 1);
      if (next) next.onclick = () => renderPage(page + 1);
    }

    renderPage(0);

    const timer = setInterval(() => {
      timeLeft--;
      const t = document.getElementById("timer");
      if (t) t.innerText = `Time left: ${timeLeft}s`;
      if (timeLeft <= 0) {
        clearInterval(timer);
        finishGame(selected, budget);
      }
    }, 1000);
  }

  async function finishGame(selected, budget) {
    const data = await postJSON("/api/glam-score", { selected, budget });
    showResult("glam-result", data.result);
  }
}
