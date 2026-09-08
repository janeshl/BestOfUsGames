// -------------------- Utilities --------------------

async function aiComplete({ system, prompt, json = false }) {
  try {
    const messages = [];

    if (system) {
      messages.push({
        role: "system",
        content: system
      });
    }

    messages.push({
      role: "user",
      content: prompt
    });

    // Model is controlled by server.js / .env
    const body = {
      temperature: 0.9,
      messages
    };

    if (json) {
      body.response_format = {
        type: "json_object"
      };
    }

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const errorText = await res.text();

      console.warn(
        "AI request failed:",
        res.status,
        errorText
      );

      return null;
    }

    const data = await res.json();

    const content =
      data?.choices?.[0]?.message?.content?.trim();

    if (!content) {
      console.warn("AI returned empty response:", data);
      return null;
    }

    if (json) {
      try {
        return JSON.parse(content);
      } catch (e) {
        console.warn(
          "AI returned invalid JSON:",
          content
        );
        return null;
      }
    }

    return content;

  } catch (e) {
    console.warn("AI proxy failed:", e);
    return null;
  }
}


// -------------------- Confetti --------------------

function burstConfetti({
  x = window.innerWidth / 2,
  y = window.innerHeight / 2,
  count = 140,
  spread = 1.8
} = {}) {

  const canvas = document.createElement("canvas");

  canvas.style.position = "fixed";
  canvas.style.inset = "0";
  canvas.style.pointerEvents = "none";
  canvas.style.zIndex = "99999";

  canvas.width = innerWidth;
  canvas.height = innerHeight;

  document.body.appendChild(canvas);

  const ctx = canvas.getContext("2d");

  const parts = [];

  for (let i = 0; i < count; i++) {
    parts.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 8 * spread,
      vy: (Math.random() - 0.9) * 10 * spread - 6,
      g: 0.18 + Math.random() * 0.12,
      life: 80 + Math.random() * 60,
      size: 2 + Math.random() * 3,
      alpha: 1
    });
  }

  (function tick() {

    ctx.clearRect(
      0,
      0,
      canvas.width,
      canvas.height
    );

    parts.forEach(p => {

      p.vy += p.g;
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 1;

      p.alpha = Math.max(
        0,
        p.life / 120
      );

      ctx.globalAlpha = p.alpha;

      ctx.fillStyle =
        `hsl(${(p.life * 7) % 360} 90% 60%)`;

      ctx.beginPath();

      ctx.arc(
        p.x,
        p.y,
        p.size,
        0,
        Math.PI * 2
      );

      ctx.fill();
    });

    if (parts.some(p => p.life > 0)) {
      requestAnimationFrame(tick);
    } else {
      document.body.removeChild(canvas);
    }

  })();
}


// -------------------- Page Router --------------------

const page =
  document.body.getAttribute("data-page");

if (page === "predict") initPredict();
if (page === "quiz") initQuiz();
if (page === "guess") initGuess();
if (page === "diet") initDiet();
if (page === "price") initPrice();
if (page === "glam") initGlam();


// ====================================================
// -------------------- Predict ------------------------
// ====================================================

function initPredict() {

  const btn =
    document.getElementById("predictBtn");

  const out =
    document.getElementById("predOut");

  if (!btn || !out) return;

  btn.addEventListener("click", async () => {

    const name =
      document.getElementById("name")?.value.trim()
      || "Friend";

    const month =
      document.getElementById("month")?.value
      || "a mysterious month";

    const place =
      document.getElementById("place")?.value.trim()
      || "somewhere magical";

    const hobby =
      document.getElementById("hobby")?.value.trim()
      || "daydreaming";

    out.style.display = "block";

    out.innerHTML =
      "<div class='small'>Summoning the oracles...</div>";

    const system = `
You are a playful fortune-teller.

Always return exactly 3 numbered predictions.

Each prediction must:
- Be funny
- Be approximately 2 sentences
- Be family-friendly
- Be imaginative
- Be related to the user's information
`;

    const prompt = `
Make 3 funny predictions for:

Name: ${name}
Birth month: ${month}
Hobby: ${hobby}
Favorite place: ${place}
`;

    let content =
      await aiComplete({
        system,
        prompt
      });

    if (!content) {

      const picks = [

        `1) In ${month}, ${name} will accidentally become the local ${hobby} celebrity after capturing a legendary selfie at ${place}. Expect spontaneous high-fives everywhere.`,

        `2) A mysterious stranger will invite ${name} to a secret club for people who love ${hobby}. Membership perk: unlimited snacks.`,

        `3) Your future self predicts that ${name} will create a national holiday called "${name} Day", where everyone must say "wow" at least seven times while thinking about ${place}.`

      ];

      content = picks.join("\n");
    }

    out.innerHTML = `
      <h3>✨ Your Predictions</h3>

      <pre style="
        white-space:pre-wrap;
        font-family:inherit;
      ">${content}</pre>
    `;

    burstConfetti({
      count: 160,
      spread: 1.4
    });

  });
}


// ====================================================
// -------------------- Quiz ---------------------------
// ====================================================

function initQuiz() {

  const topicEl =
    document.getElementById("topic");

  const startBtn =
    document.getElementById("quizStart");

  const roundEl =
    document.getElementById("quizRound");

  const qwrap =
    document.getElementById("quizWrap");

  const timerEl =
    document.getElementById("quizTimer");

  const resCard =
    document.getElementById("quizResult");

  const statusEl =
    document.getElementById("quizStatus");

  const emojiEl =
    document.getElementById("quizEmoji");

  const summaryEl =
    document.getElementById("quizSummary");

  if (
    !topicEl ||
    !startBtn ||
    !roundEl ||
    !qwrap
  ) {
    return;
  }

  let questions = [];
  let round = 0;
  let score = 0;
  let timerInt = null;
  let remaining = 20;


  function countdown(onExpire) {

    clearInterval(timerInt);

    remaining = 20;

    if (timerEl) {
      timerEl.textContent =
        remaining + "s";
    }

    timerInt = setInterval(() => {

      remaining--;

      if (timerEl) {
        timerEl.textContent =
          remaining + "s";
      }

      if (remaining <= 0) {

        clearInterval(timerInt);

        onExpire();
      }

    }, 1000);
  }


  function renderQuestion() {

    const q =
      questions[round - 1];

    if (!q) return;

    qwrap.innerHTML = `

      <div>
        <strong>${q.q}</strong>
      </div>

      <div class="options">

        ${q.options
          .map((opt, i) => `
            <label class="option">

              <input
                type="radio"
                name="opt"
                value="${i}"
              />

              ${opt}

            </label>
          `)
          .join("")}

      </div>

      <button
        class="btn"
        id="submit"
      >
        Submit
      </button>
    `;


    const submitBtn =
      document.getElementById("submit");


    submitBtn.onclick = () => {

      const selected =
        document.querySelector(
          'input[name="opt"]:checked'
        );

      clearInterval(timerInt);

      if (!selected) {

        next(false);

      } else {

        const val =
          Number(selected.value);

        next(val === q.answer);
      }
    };


    countdown(() => next(false));
  }


  function next(correct) {

    if (correct) {
      score++;
    }

    if (round >= 5) {

      endGame();

    } else {

      round++;

      roundEl.textContent =
        String(round);

      renderQuestion();
    }
  }


  function endGame() {

    clearInterval(timerInt);

    qwrap.innerHTML = "";

    if (resCard) {
      resCard.style.display =
        "block";
    }

    if (score === 5) {

      if (statusEl) {
        statusEl.innerHTML =
          `<h3>🔥 Perfect! You scored 5/5</h3>`;
      }

      if (emojiEl) {
        emojiEl.textContent = "🎉";
      }

      burstConfetti({
        count: 200,
        spread: 1.6
      });

    } else {

      if (statusEl) {
        statusEl.innerHTML =
          `<h3>Better luck next time — you scored ${score}/5</h3>`;
      }

      if (emojiEl) {
        emojiEl.textContent = "😔";
      }
    }

    if (summaryEl) {

      summaryEl.innerHTML = `
        Topic:
        <span class="pill">
          ${topicEl.value || "Mixed"}
        </span>
      `;
    }
  }


  async function makeQuestions(topic) {

    const system = `
Create exactly 5 very difficult multiple-choice questions.

Topic:
${topic}

Rules:
- 4 options per question
- Exactly one correct answer
- Questions should test understanding, not simple memorization
- Avoid ambiguous questions
- Keep the questions factually accurate

Return ONLY valid JSON in this exact format:

{
  "items": [
    {
      "q": "Question",
      "options": [
        "Option A",
        "Option B",
        "Option C",
        "Option D"
      ],
      "answerIndex": 0
    }
  ]
}
`;

    const data =
      await aiComplete({
        system,
        prompt: `Generate the quiz for topic: ${topic}`,
        json: true
      });


    if (
      data?.items?.length === 5
    ) {

      return data.items
        .map(it => ({
          q: it.q,
          options: it.options,
          answer:
            Number(it.answerIndex) || 0
        }))
        .filter(
          q =>
            q.q &&
            Array.isArray(q.options) &&
            q.options.length === 4
        );
    }


    // ---------------- Fallback Question Bank ----------------

    const lower =
      topic.toLowerCase();


    const bank =
      lower.includes("java")

        ? [

            {
              q: "Which GC algorithm is default in modern OpenJDK HotSpot for general server workloads?",

              options: [
                "Serial GC",
                "G1 GC",
                "Shenandoah",
                "ZGC"
              ],

              answer: 1
            },

            {
              q: "What does the volatile keyword primarily guarantee?",

              options: [
                "Atomicity of compound operations",
                "Visibility and ordering of writes",
                "Mutual exclusion",
                "Faster access"
              ],

              answer: 1
            },

            {
              q: "Which interface is fundamental to Java Stream traversal?",

              options: [
                "Supplier",
                "Iterable",
                "Spliterator",
                "Collector"
              ],

              answer: 2
            },

            {
              q: "What is a major benefit of sealed classes?",

              options: [
                "Runtime speed",
                "Exhaustive type hierarchies",
                "Reflection power",
                "Smaller bytecode"
              ],

              answer: 1
            },

            {
              q: "Which feature allows Java developers to define restricted inheritance hierarchies?",

              options: [
                "Interfaces",
                "Annotations",
                "Sealed classes",
                "Packages"
              ],

              answer: 2
            }

          ]

        : lower.includes("space")

          ? [

              {
                q: "Which star is closest to the Sun?",

                options: [
                  "Barnard's Star",
                  "Proxima Centauri",
                  "Sirius A",
                  "Tau Ceti"
                ],

                answer: 1
              },

              {
                q: "What is the main constituent of Jupiter's atmosphere?",

                options: [
                  "Oxygen",
                  "Methane",
                  "Hydrogen",
                  "Ammonia"
                ],

                answer: 2
              },

              {
                q: "Which object is classified as a dwarf planet?",

                options: [
                  "Ganymede",
                  "Vesta",
                  "Ceres",
                  "Enceladus"
                ],

                answer: 2
              },

              {
                q: "Approximately how old is the universe?",

                options: [
                  "4.5 billion years",
                  "7.5 billion years",
                  "10.5 billion years",
                  "13.8 billion years"
                ],

                answer: 3
              },

              {
                q: "Which force keeps planets in orbit around the Sun?",

                options: [
                  "Magnetism",
                  "Gravity",
                  "Friction",
                  "Nuclear force"
                ],

                answer: 1
              }

            ]

          : [

              {
                q: "What is the largest internal organ by mass?",

                options: [
                  "Liver",
                  "Lungs",
                  "Brain",
                  "Pancreas"
                ],

                answer: 0
              },

              {
                q: "Which vitamin is fat-soluble?",

                options: [
                  "Vitamin C",
                  "Vitamin B1",
                  "Vitamin K",
                  "Vitamin B12"
                ],

                answer: 2
              },

              {
                q: "Which term belongs to cricket?",

                options: [
                  "Love",
                  "Bogey",
                  "Yorker",
                  "Ruck"
                ],

                answer: 2
              },

              {
                q: "The speed of light in vacuum is approximately:",

                options: [
                  "3×10^6 m/s",
                  "3×10^8 m/s",
                  "3×10^10 m/s",
                  "3×10^12 m/s"
                ],

                answer: 1
              },

              {
                q: "Which language introduced generics earlier?",

                options: [
                  "Java",
                  "C#",
                  "Go",
                  "Python"
                ],

                answer: 0
              }

            ];


    // Correctly shuffle options while
    // preserving the correct answer.
    for (const q of bank) {

      const correctAnswer =
        q.options[q.answer];

      q.options =
        q.options
          .slice()
          .sort(
            () => Math.random() - 0.5
          );

      q.answer =
        q.options.indexOf(
          correctAnswer
        );
    }

    return bank;
  }


  startBtn.addEventListener(
    "click",
    async () => {

      clearInterval(timerInt);

      if (resCard) {
        resCard.style.display =
          "none";
      }

      qwrap.innerHTML =
        "<div class='small'>Generating difficult questions...</div>";

      score = 0;
      round = 1;

      roundEl.textContent = "1";

      questions =
        await makeQuestions(
          topicEl.value.trim()
          || "general knowledge"
        );

      if (!questions.length) {

        qwrap.innerHTML =
          "<div class='small'>Unable to generate questions. Please try again.</div>";

        return;
      }

      renderQuestion();
    }
  );
}


// ====================================================
// -------------------- Guess --------------------------
// ====================================================

function initGuess() {

  const topicEl =
    document.getElementById("gTopic");

  const startBtn =
    document.getElementById("gStart");

  const roundEl =
    document.getElementById("gRound");

  const qEl =
    document.getElementById("gQ");

  const askBtn =
    document.getElementById("gAsk");

  const log =
    document.getElementById("gLog");

  const end =
    document.getElementById("gEnd");

  const final =
    document.getElementById("gFinal");

  const emo =
    document.getElementById("gEmo");

  if (
    !topicEl ||
    !startBtn ||
    !roundEl ||
    !qEl ||
    !askBtn ||
    !log
  ) {
    return;
  }


  // Current local version.
  // This will be replaced by the full
  // server-side agentic version later.

  let secret = null;
  let round = 0;


  const sets = {

    Science: [

      {
        name: "Albert Einstein",

        hints: [
          "Won a Nobel Prize",
          "Known for relativity",
          "Wild hair"
        ],

        facts: [
          "physicist",
          "german",
          "nobel",
          "relativity",
          "theory",
          "20th",
          "scientist",
          "swiss",
          "professor"
        ]
      },

      {
        name: "Marie Curie",

        hints: [
          "Nobel laureate",
          "Worked with radioactivity",
          "From Poland/France"
        ],

        facts: [
          "female",
          "scientist",
          "radioactivity",
          "polish",
          "french",
          "nobel",
          "chemistry",
          "physics"
        ]
      }

    ],


    Sports: [

      {
        name: "Lionel Messi",

        hints: [
          "Football",
          "Argentina",
          "Many Ballon d'Ors"
        ],

        facts: [
          "football",
          "soccer",
          "argentina",
          "barcelona",
          "psg",
          "forward",
          "goat"
        ]
      },

      {
        name: "Serena Williams",

        hints: [
          "Tennis legend",
          "Many Grand Slams",
          "Powerful serve"
        ],

        facts: [
          "tennis",
          "grand slam",
          "williams",
          "american",
          "female",
          "goat"
        ]
      }

    ],


    Movies: [

      {
        name: "Hermione Granger",

        hints: [
          "Magic",
          "Muggle-born",
          "Top of the class"
        ],

        facts: [
          "harry potter",
          "hogwarts",
          "witch",
          "gryffindor",
          "magic",
          "book"
        ]
      },

      {
        name: "James Bond",

        hints: [
          "Agent",
          "License to kill",
          "Aston Martin"
        ],

        facts: [
          "spy",
          "mi6",
          "agent",
          "007",
          "bond",
          "british"
        ]
      }

    ],


    Politics: [

      {
        name: "Nelson Mandela",

        hints: [
          "South Africa",
          "Anti-apartheid",
          "President"
        ],

        facts: [
          "president",
          "south africa",
          "apartheid",
          "prison",
          "freedom"
        ]
      },

      {
        name: "Narendra Modi",

        hints: [
          "Indian Prime Minister",
          "From Gujarat",
          "BJP"
        ],

        facts: [
          "prime minister",
          "india",
          "bjp",
          "gujarat",
          "pm"
        ]
      }

    ],


    Tech: [

      {
        name: "Elon Musk",

        hints: [
          "SpaceX",
          "Tesla",
          "South Africa-born"
        ],

        facts: [
          "tesla",
          "spacex",
          "twitter",
          "x.com",
          "billionaire",
          "engineer",
          "ceo"
        ]
      },

      {
        name: "Ada Lovelace",

        hints: [
          "19th century",
          "Analytical Engine",
          "First programmer?"
        ],

        facts: [
          "programmer",
          "analytical engine",
          "byron",
          "algorithm",
          "math"
        ]
      }

    ]

  };


  function chooseSecret() {

    const topic =
      topicEl.value;

    const arr =
      sets[topic]
      || Object.values(sets)
        .flat();

    return arr[
      Math.floor(
        Math.random() * arr.length
      )
    ];
  }


  function answer(q) {

    const t =
      q.toLowerCase();

    const yes =
      secret.facts.some(
        k => t.includes(k)
      );


    if (
      t.startsWith("is ") ||
      t.startsWith("are ") ||
      t.includes("alive") ||
      t.includes("dead")
    ) {

      return Math.random() < 0.5
        ? "Yes."
        : "No.";
    }


    if (yes) {
      return "Yes.";
    }


    if (t.includes("or")) {
      return "Maybe.";
    }


    return Math.random() < 0.5
      ? "No."
      : "Yes.";
  }


  function post(
    msg,
    role = "you"
  ) {

    const el =
      document.createElement("div");

    el.innerHTML = `

      <div class="badge">
        ${role === "you" ? "You" : "AI"}
      </div>

      <div style="margin:6px 0 14px;">
        ${msg}
      </div>

    `;

    log.prepend(el);
  }


  function giveHint(i) {

    return `
      <div class="pill">
        Hint ${i}: ${secret.hints[i - 1]}
      </div>
    `;
  }


  function done(win) {

    if (end) {
      end.style.display =
        "block";
    }


    if (win) {

      if (final) {
        final.innerHTML =
          `<h3>🎉 You got it! ${secret.name}</h3>`;
      }

      if (emo) {
        emo.textContent = "🎆";
      }

      burstConfetti({
        count: 220,
        spread: 1.8
      });

    } else {

      if (final) {
        final.innerHTML =
          `<h3>😔 Out of rounds. It was <strong>${secret.name}</strong>.</h3>`;
      }

      if (emo) {
        emo.textContent = "😞";
      }
    }
  }


  startBtn.addEventListener(
    "click",
    () => {

      secret =
        chooseSecret();

      round = 1;

      roundEl.textContent =
        "1";

      log.innerHTML = `

        <div class="small">
          Game started.
          Ask yes/no questions or type
          <span class="kbd">
            guess: name
          </span>.
        </div>

      `;

      if (end) {
        end.style.display =
          "none";
      }
    }
  );


  askBtn.addEventListener(
    "click",
    () => {

      if (!secret) {
        return;
      }

      const txt =
        qEl.value.trim();

      if (!txt) {
        return;
      }

      post(txt, "you");

      qEl.value = "";


      if (
        txt
          .toLowerCase()
          .startsWith("guess:")
      ) {

        const g =
          txt
            .split(":")
            .slice(1)
            .join(":")
            .trim()
            .toLowerCase();


        if (
          g ===
          secret.name.toLowerCase()
        ) {

          done(true);

          return;

        } else {

          post(
            "Nope, that's not it.",
            "ai"
          );
        }

      } else {

        const a =
          answer(txt);

        post(a, "ai");
      }


      if (round === 7) {

        post(
          giveHint(1),
          "ai"
        );

      } else if (round === 8) {

        post(
          giveHint(2),
          "ai"
        );

      } else if (round === 9) {

        post(
          giveHint(3),
          "ai"
        );
      }


      if (round >= 10) {

        done(false);

      } else {

        round++;

        roundEl.textContent =
          String(round);
      }

    }
  );
}


// ====================================================
// -------------------- Diet ---------------------------
// ====================================================

function initDiet() {

  const s1 =
    document.getElementById("dStep1");

  const s2 =
    document.getElementById("dStep2");

  const plan =
    document.getElementById("dPlan");

  const next1 =
    document.getElementById("dNext1");

  const back =
    document.getElementById("dBack");

  const gen =
    document.getElementById("dGen");


  if (
    !s1 ||
    !s2 ||
    !plan ||
    !next1 ||
    !back ||
    !gen
  ) {
    return;
  }


  next1.onclick = () => {

    s1.style.display =
      "none";

    s2.style.display =
      "block";
  };


  back.onclick = () => {

    s2.style.display =
      "none";

    s1.style.display =
      "block";
  };


  gen.onclick = async () => {

    const get =
      id =>
        document
          .getElementById(id)
          ?.value || "";


    const data = {

      age: get("dAge"),

      gender: get("dGender"),

      activity: get("dActivity"),

      diet: get("dDiet"),

      allergies: get("dAllergies"),

      goal: get("dGoal"),

      conditions: get("dCond"),

      cuisines: get("dCuis"),

      budget: get("dBudget"),

      meals: get("dMeals"),

      notes: get("dNotes")
    };


    plan.style.display =
      "block";

    plan.innerHTML =
      "<div class='small'>Thinking of a tasty plan...</div>";


    const system = `

You are an AI meal-planning assistant.

Create a practical, Indian-friendly meal plan based on the user's preferences.

Include:

- Daily meal plan
- Approximate macro distribution
- Hydration guidance
- Snack options
- One-day sample menu
- Budget-conscious alternatives
- Practical preparation tips

Keep the advice general and safe.

Do not diagnose medical conditions.

Do not make medical claims.

If the user mentions a medical condition,
recommend consulting a qualified healthcare professional.

Use clear headings and bullet points.

`;


    let content =
      await aiComplete({

        system,

        prompt:
          `User profile: ${JSON.stringify(data)}

Return a practical meal plan in markdown.
`
      });


    if (!content) {

      content = `

### Personalized Diet Plan (Preview)

- **Goal:** ${data.goal}
- **Meals/day:** ${data.meals}
- **Budget:** ₹${data.budget}
- **Diet:** ${data.diet}
- **Activity:** ${data.activity}
- **Cuisines:** ${data.cuisines || "mixed"}
- **Allergies:** ${data.allergies || "none"}
- **Notes:** ${data.notes || "—"}

### Approximate Macros

- Carbohydrates: 45–55%
- Protein: 20–25%
- Fats: 25–30%

### Hydration

Aim for regular hydration throughout the day and increase fluids during hot weather or exercise.

### 1-Day Sample

**Breakfast**
- Oats upma
- Curd or plant-based alternative
- Fruit

**Snack**
- Fruit + nuts if suitable

**Lunch**
- Dal
- Rice
- Vegetable curry
- Salad

**Evening Snack**
- Buttermilk or tea
- Roasted chana

**Dinner**
- Roti
- Paneer/tofu bhurji
- Vegetables

### Tips

- Prefer seasonal vegetables.
- Plan meals in advance.
- Adjust portions according to your needs.
- Consult a qualified professional for medical or highly specific dietary needs.

`;
    }


    plan.innerHTML = `

      <h3>
        Your Diet Plan
      </h3>

      <div style="
        white-space:pre-wrap;
      ">
        ${content}
      </div>

    `;
  };
}


// ====================================================
// -------------------- Price --------------------------
// ====================================================

function initPrice() {

  const start =
    document.getElementById("pStart");

  const pInfo =
    document.getElementById("pInfo");

  const qCard =
    document.getElementById("pQCard");

  const qnum =
    document.getElementById("pQNum");

  const question =
    document.getElementById("pQuestion");

  const yes =
    document.getElementById("pYes");

  const no =
    document.getElementById("pNo");

  const guessCard =
    document.getElementById("pGuessCard");

  const gtimer =
    document.getElementById("pTimer");

  const promptEl =
    document.getElementById("pPrompt");

  const guessEl =
    document.getElementById("pGuess");

  const submit =
    document.getElementById("pSubmit");

  const result =
    document.getElementById("pResult");

  const rtext =
    document.getElementById("pRText");

  const emo =
    document.getElementById("pEmoji");

  const details =
    document.getElementById("pDetails");


  if (
    !start ||
    !pInfo ||
    !qCard ||
    !qnum ||
    !question ||
    !yes ||
    !no
  ) {
    return;
  }


  const products = [

    {
      name: "Premium Smartphone",
      price: 69999
    },

    {
      name: "Mid-range Laptop",
      price: 55999
    },

    {
      name: "Electric Scooter",
      price: 79999
    },

    {
      name: "4K LED TV",
      price: 45999
    },

    {
      name: "Organic Face Serum",
      price: 1499
    },

    {
      name: "Running Shoes",
      price: 5999
    },

    {
      name: "Wireless Earbuds",
      price: 3499
    }

  ];


  const scenarios = [

    {
      q: "Will raw material costs rise significantly?",
      up: 1.15,
      down: 0.95
    },

    {
      q: "Will the brand gain major market share?",
      up: 1.2,
      down: 0.98
    },

    {
      q: "Will import duties increase?",
      up: 1.1,
      down: 1.0
    },

    {
      q: "Will strong new competitors appear?",
      up: 0.95,
      down: 1.05
    },

    {
      q: "Will a recession hit the market?",
      up: 0.9,
      down: 1.02
    },

    {
      q: "Will the product get breakthrough features?",
      up: 1.25,
      down: 0.97
    },

    {
      q: "Will supply chain improve markedly?",
      up: 0.98,
      down: 1.05
    },

    {
      q: "Will currency inflation remain high?",
      up: 1.12,
      down: 0.98
    },

    {
      q: "Will sustainability regulations tighten?",
      up: 1.05,
      down: 0.99
    },

    {
      q: "Will demand shift to alternatives?",
      up: 0.92,
      down: 1.03
    }

  ];


  let chosen = null;
  let idx = 0;
  let price = 0;
  let aiPrice = 0;

  let tInt = null;
  let tLeft = 60;


  function closeness(a, b) {

    if (
      !Number.isFinite(a) ||
      a <= 0 ||
      !Number.isFinite(b) ||
      b <= 0
    ) {
      return 0;
    }

    return Math.min(a, b) /
      Math.max(a, b);
  }


  start.onclick = () => {

    chosen =
      products[
        Math.floor(
          Math.random() *
          products.length
        )
      ];


    price =
      chosen.price;

    pInfo.innerHTML = `

      <div class="badge">
        Suggested Product
      </div>

      <p>
        <strong>
          ${chosen.name}
        </strong>

        — Current price:
        ₹${price}
      </p>

    `;


    qCard.style.display =
      "block";

    idx = 0;

    aiPrice =
      price;

    ask();
  };


  function ask() {

    qnum.textContent =
      String(idx + 1);

    question.textContent =
      scenarios[idx].q;
  }


  function handle(ansYes) {

    const sc =
      scenarios[idx];

    aiPrice =
      Math.round(
        aiPrice *
        (ansYes
          ? sc.up
          : sc.down)
      );

    idx++;


    if (
      idx >=
      scenarios.length
    ) {

      qCard.style.display =
        "none";

      guessPhase();

    } else {

      ask();
    }
  }


  yes.onclick =
    () => handle(true);

  no.onclick =
    () => handle(false);


  function guessPhase() {

    guessCard.style.display =
      "block";

    promptEl.innerHTML = `

      We evaluated scenarios for
      <strong>${chosen.name}</strong>.

      Guess its price after 5 years
      (current: ₹${price}).

    `;


    tLeft = 60;

    gtimer.textContent =
      "60s";

    clearInterval(tInt);


    tInt =
      setInterval(() => {

        tLeft--;

        gtimer.textContent =
          tLeft + "s";


        if (tLeft <= 0) {

          clearInterval(tInt);

          submit.click();
        }

      }, 1000);
  }


  submit.onclick = () => {

    clearInterval(tInt);

    const user =
      Number(guessEl.value);

    const close =
      closeness(
        user,
        aiPrice
      );


    result.style.display =
      "block";

    guessCard.style.display =
      "none";


    if (close >= 0.75) {

      rtext.innerHTML =
        `<h3>🎯 Great guess! You win.</h3>`;

      emo.textContent =
        "🎆";

      burstConfetti({
        count: 220,
        spread: 1.9
      });

    } else {

      rtext.innerHTML =
        `<h3>So close! But not enough.</h3>`;

      emo.textContent =
        "😔";
    }


    details.innerHTML = `

      AI price:
      <span class="pill">
        ₹${aiPrice}
      </span>

      —

      Your guess:
      <span class="pill">
        ₹${Number.isFinite(user) ? user : 0}
      </span>

    `;
  };
}


// ====================================================
// -------------------- Glam ---------------------------
// ====================================================

function initGlam() {

  const genderEl =
    document.getElementById("glaGender");

  const budgetEl =
    document.getElementById("glaBudget");

  const startBtn =
    document.getElementById("glaStart");

  const game =
    document.getElementById("glaGame");

  const list =
    document.getElementById("glaList");

  const prev =
    document.getElementById("glaPrev");

  const next =
    document.getElementById("glaNext");

  const finish =
    document.getElementById("glaFinish");

  const timeEl =
    document.getElementById("glaTime");

  const selectedEl =
    document.getElementById("glaSel");

  const totalEl =
    document.getElementById("glaTotal");

  const bvalEl =
    document.getElementById("glaBVal");

  const countEl =
    document.getElementById("glaCount");

  const result =
    document.getElementById("glaResult");

  const r =
    document.getElementById("glaR");

  const em =
    document.getElementById("glaEm");

  const points =
    document.getElementById("glaPoints");


  if (
    !genderEl ||
    !budgetEl ||
    !startBtn ||
    !game ||
    !list
  ) {
    return;
  }


  const items = [];


  const categories = [

    "Cleanser",
    "Toner",
    "Moisturizer",
    "Sunscreen",
    "Serum (Vit C)",
    "Serum (Hyaluronic)",
    "Exfoliant",
    "Face Mask",
    "Eye Cream",
    "Lip Balm SPF",
    "Body Lotion",
    "Deodorant",
    "Shampoo",
    "Conditioner",
    "Hair Mask",
    "Hand Cream",
    "Night Cream",
    "Face Oil",
    "Makeup Remover",
    "BB/CC Cream",
    "Beard Oil",
    "Aftershave",
    "Razor",
    "Foot Cream",
    "Sunscreen Stick",
    "Tinted Sunscreen",
    "Body Wash",
    "Face Mist",
    "Sheet Mask",
    "Nail Care"

  ];


  function seedItems() {

    items.length = 0;


    for (
      let i = 0;
      i < 30;
      i++
    ) {

      const price =
        350 +
        Math.floor(
          Math.random() * 1200
        ) +
        (i % 5) * 100;


      const cat =
        categories[i];

      const eco =
        i % 3 === 0;


      items.push({

        id: i + 1,

        name: cat,

        price,

        desc:
          eco
            ? "Eco-friendly formula with minimal packaging."
            : "Dermat-tested everyday essential.",

        cat,

        eco

      });
    }
  }


  seedItems();


  let currentPage = 0;

  let chosen =
    new Set();

  let budget = 0;
  let sum = 0;

  let timer = null;
  let left = 180;


  function renderPage() {

    const start =
      currentPage * 10;

    const slice =
      items.slice(
        start,
        start + 10
      );


    list.innerHTML =
      slice
        .map(it => `

          <label class="option">

            <input
              type="checkbox"
              data-id="${it.id}"
              ${chosen.has(it.id)
                ? "checked"
                : ""}
            />

            <div style="flex:1">

              <div>
                <strong>
                  ${it.name}
                </strong>

                —
                ₹${it.price}
              </div>

              <div class="small">
                ${it.desc}
              </div>

              <div class="small">

                Category:
                ${it.cat}

                ${it.eco
                  ? "• 🌿 eco"
                  : ""}

              </div>

            </div>

          </label>

        `)
        .join("");


    list
      .querySelectorAll(
        'input[type="checkbox"]'
      )
      .forEach(cb => {

        cb.onchange = () => {

          const id =
            Number(
              cb.getAttribute(
                "data-id"
              )
            );


          const item =
            items.find(
              x => x.id === id
            );


          if (cb.checked) {

            if (
              sum + item.price >
              budget
            ) {

              alert(
                "That would exceed your budget!"
              );

              cb.checked =
                false;

              return;
            }


            chosen.add(id);

            sum +=
              item.price;

          } else {

            chosen.delete(id);

            sum -=
              item.price;
          }


          updateHUD();
        };

      });


    updateHUD();
  }


  function updateHUD() {

    if (selectedEl) {
      selectedEl.textContent =
        String(chosen.size);
    }

    if (countEl) {
      countEl.textContent =
        String(chosen.size);
    }

    if (totalEl) {
      totalEl.textContent =
        String(sum);
    }
  }


  function score() {

    if (!budget) {
      return 0;
    }


    const util =
      Math.max(
        0,
        1 -
        Math.abs(
          budget - sum
        ) / budget
      );


    let s =
      util * 40;


    const cats =
      new Set(
        [...chosen]
          .map(
            id =>
              items.find(
                i => i.id === id
              ).cat
          )
      );


    s +=
      Math.min(
        1,
        cats.size / 12
      ) * 30;


    const ecoCount =
      [...chosen]
        .filter(
          id =>
            items.find(
              i => i.id === id
            ).eco
        )
        .length;


    s +=
      Math.min(
        1,
        ecoCount / 6
      ) * 10;


    s +=
      Math.min(
        1,
        left / 180
      ) * 10;


    const names =
      new Set(
        [...chosen]
          .map(
            id =>
              items.find(
                i => i.id === id
              ).name
          )
      );


    let combo = 0;


    if (
      names.has("Cleanser") &&
      names.has("Moisturizer")
    ) {
      combo += 0.4;
    }


    if (
      names.has("Shampoo") &&
      names.has("Conditioner")
    ) {
      combo += 0.3;
    }


    if (
      names.has("Sunscreen") &&
      (
        names.has("Serum (Vit C)") ||
        names.has("Serum (Hyaluronic)")
      )
    ) {
      combo += 0.3;
    }


    s +=
      Math.min(
        1,
        combo
      ) * 10;


    return Math.round(s);
  }


  function finishGame() {

    clearInterval(timer);


    game.style.display =
      "none";

    result.style.display =
      "block";


    const sc =
      score();


    if (
      chosen.size < 12
    ) {

      r.innerHTML = `

        <h3>
          You picked only
          ${chosen.size}
          items
          (need ≥12).
          Score: ${sc}/100
        </h3>

      `;

      em.textContent =
        "😔";

      return;
    }


    if (sc >= 75) {

      r.innerHTML = `

        <h3>
          👏 Great choices!
          Score: ${sc}/100
        </h3>

      `;

      em.textContent =
        "🎉";


      burstConfetti({
        count: 220,
        spread: 1.8
      });

    } else {

      r.innerHTML = `

        <h3>
          Not quite there.
          Score: ${sc}/100
        </h3>

      `;

      em.textContent =
        "😞";
    }


    points.innerHTML = `

      <div>
        Budget used:
        ₹${sum}
        of
        ₹${budget}
      </div>

      <div>
        Items chosen:
        ${chosen.size}
      </div>

      <div>
        Unique categories:
        ${
          new Set(
            [...chosen]
              .map(
                id =>
                  items.find(
                    i => i.id === id
                  ).cat
              )
          ).size
        }
      </div>

      <div>
        Eco-friendly picks:
        ${
          [...chosen]
            .filter(
              id =>
                items.find(
                  i => i.id === id
                ).eco
            )
            .length
        }
      </div>

    `;
  }


  startBtn.onclick = () => {

    budget =
      Math.max(
        10000,
        Number(
          budgetEl.value
        ) || 10000
      );


    bvalEl.textContent =
      String(budget);


    game.style.display =
      "block";


    if (result) {
      result.style.display =
        "none";
    }


    currentPage = 0;

    chosen =
      new Set();

    sum = 0;

    renderPage();


    left = 180;

    timeEl.textContent =
      String(left);


    clearInterval(timer);


    timer =
      setInterval(() => {

        left--;

        timeEl.textContent =
          String(left);


        if (left <= 0) {

          clearInterval(timer);

          finishGame();
        }

      }, 1000);
  };


  if (prev) {

    prev.onclick = () => {

      currentPage =
        Math.max(
          0,
          currentPage - 1
        );

      renderPage();
    };
  }


  if (next) {

    next.onclick = () => {

      currentPage =
        Math.min(
          2,
          currentPage + 1
        );

      renderPage();
    };
  }


  if (finish) {
    finish.onclick =
      () => finishGame();
  }
}
