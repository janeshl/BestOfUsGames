// script.js — Shared client logic for all games

function $(sel){ return document.querySelector(sel); }
function $all(sel){ return Array.from(document.querySelectorAll(sel)); }
function setText(el, text){ if(el) el.textContent = text; }
function html(el, markup){ if(el) el.innerHTML = markup; }

// Predict the Future
(function(){
  const form = $('#f-form');
  const out = $('#f-out');
  if(!form || !out) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    setText(out, "🔮 Summoning prophecies...");
    const data = { name: form.name.value, birthMonth: form.birthMonth.value, favoritePlace: form.place.value };
    try{
      const res = await fetch('/api/predict-future', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data) });
      const json = await res.json();
      setText(out, json.ok ? json.content : ('Error: ' + (json.error || 'Unknown error')));
    }catch{ setText(out, 'Network error. Please try again.'); }
  });
})();

// Spot the Lie
(function(){
  const form = $('#gen-form');
  const options = $('#options');
  const hintEl = $('#hint');
  const verify = $('#verify');
  if(!form || !options) return;
  let token = null, chosen = null;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const topic = e.target.topic.value;
    html(options, '<div class="pill">Generating statements...</div>');
    setText(hintEl, ''); hintEl.style.display='none'; html(verify, ''); chosen=null;
    try{
      const res = await fetch('/api/lie/generate', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ topic }) });
      const json = await res.json();
      if(!json.ok){ html(options, 'Error: ' + (json.error || 'Unknown error')); return; }
      token = json.token;
      const list = json.statements || [];
      html(options, '');
      list.forEach((s, i) => {
        const d = document.createElement('div');
        d.className = 'option'; d.textContent = (i+1)+'. '+s;
        d.onclick = () => {
          chosen = i+1;
          $all('.option').forEach(n => n.style.borderColor='var(--border)');
          d.style.borderColor='rgba(138,92,246,.6)';
          html(verify, '<button class="btn" id="verifyBtn">Verify</button>');
          $('#verifyBtn').onclick = check;
        };
        options.appendChild(d);
      });
      if(json.hint){ hintEl.textContent='Hint: '+json.hint; hintEl.style.display='inline-flex'; }
    }catch{ html(options, 'Network error. Please try again.'); }
  });
  async function check(){
    if(!token || !chosen) return;
    try{
      const res = await fetch('/api/lie/verify', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ token, guessIndex: chosen }) });
      const json = await res.json();
      if(!json.ok){ html(verify, 'Error: ' + (json.error || 'Unknown error')); return; }
      html(verify, json.correct ? '<div class="pill">🎉 Correct! You found the lie.</div>' : '<div class="pill">❌ Not quite. The lie was option '+json.answer+'.</div>');
    }catch{ html(verify, 'Network error. Please try again.'); }
  }
})();

// Find the Character
(function(){
  const startForm = $('#start-form');
  const turnForm = $('#turn-form');
  const chat = $('#chat');
  const rounds = $('#rounds');
  const result = $('#result');
  if(!startForm || !chat) return;
  let sessionId = null, roundsLeft = 10;
  function pushMsg(who, text){
    const d = document.createElement('div'); d.className='msg';
    d.innerHTML = '<b>'+who+':</b> '+text; chat.appendChild(d); chat.scrollTop = chat.scrollHeight;
  }
  startForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    html(chat, '<div class="pill">Picking a secret character...</div>');
    const topic = e.target.topic.value;
    try{
      const res = await fetch('/api/character/start', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ topic }) });
      const json = await res.json();
      if(!json.ok){ html(chat, 'Error: ' + (json.error || 'Unknown error')); return; }
      sessionId = json.sessionId; roundsLeft = json.roundsLeft;
      $('#game').style.display = 'block'; html(chat, ''); pushMsg('AI', json.question);
      setText(rounds, 'Rounds left: ' + roundsLeft);
    }catch{ html(chat, 'Network error. Please try again.'); }
  });
  if(turnForm){
    turnForm.addEventListener('submit', async (e) => {
      e.preventDefault(); if(!sessionId) return;
      const ans = $('#answer').value.trim(); const guess = $('#guess').value.trim();
      if(ans){ pushMsg('You', ans); } $('#answer').value=''; $('#guess').value='';
      try{
        const res = await fetch('/api/character/next', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ sessionId, answer: ans, guess }) });
        const json = await res.json();
        if(!json.ok){ pushMsg('AI', 'Error: ' + (json.error || 'Unknown error')); return; }
        if(json.done){
          if(json.win){ html(result, '<div class="pill">🎉 Congrats! You found ' + json.name + '!</div>'); }
          else { html(result, '<div class="pill">🕵️ Game over. The character was ' + json.name + '.</div>'); }
          sessionId = null; pushMsg('AI', json.message || ''); return;
        }
        if(json.question){ pushMsg('AI', json.question); }
        roundsLeft = json.roundsLeft; setText(rounds, 'Rounds left: ' + roundsLeft);
      }catch{ pushMsg('AI', 'Network error. Please try again.'); }
    });
  }
})();
