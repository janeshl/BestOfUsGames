let currentCharacter = "";
let charChances = 0;

function playSound(id) {
    document.getElementById(id).play();
}

function showScreen(screenId) {
    playSound("transition-sound");
    document.querySelectorAll(".screen").forEach(s => s.classList.add("hidden"));
    document.getElementById(screenId).classList.remove("hidden");
    gsap.from(`#${screenId}`, { duration: 0.5, opacity: 0, y: 50 });
}

async function playFuturePrediction() {
    playSound("click-sound");
    const name = document.getElementById("fp-name").value;
    const month = document.getElementById("fp-month").value;
    const place = document.getElementById("fp-place").value;
    const res = await fetch("/api/future-prediction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, month, place })
    });
    const data = await res.json();
    document.getElementById("fp-result").innerText = data.prediction;
}

async function playAiLie() {
    playSound("click-sound");
    const topic = document.getElementById("lie-topic").value;
    const res = await fetch("/api/ai-lie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic })
    });
    const data = await res.json();
    const container = document.getElementById("lie-statements");
    container.innerHTML = "";
    data.statements.forEach(s => {
        const p = document.createElement("p");
        p.innerText = s;
        container.appendChild(p);
    });
}

async function startCharacterGame() {
    playSound("click-sound");
    const topic = document.getElementById("char-topic").value;
    const res = await fetch("/api/start-character", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic })
    });
    const data = await res.json();
    currentCharacter = data.character;
    charChances = 10;
    document.getElementById("char-game").classList.remove("hidden");
    document.getElementById("char-response").innerText = "";
    document.getElementById("char-chances").innerText = `Chances left: ${charChances}`;
}

async function askCharacter() {
    const question = document.getElementById("char-input").value;
    charChances--;
    const res = await fetch("/api/ask-character", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ character: currentCharacter, question })
    });
    const data = await res.json();
    document.getElementById("char-response").innerText = data.answer;
    document.getElementById("char-chances").innerText = `Chances left: ${charChances}`;
    if (charChances <= 0) {
        document.getElementById("char-response").innerText += `\nGame Over! The character was: ${currentCharacter}`;
    }
}

function guessCharacter() {
    const guess = prompt("Enter your guess:");
    if (guess && guess.toLowerCase() === currentCharacter.toLowerCase()) {
        document.getElementById("char-response").innerText = `🎉 Correct! It was ${currentCharacter}!`;
    } else {
        document.getElementById("char-response").innerText += `\nWrong guess! Try again.`;
    }
}
