// Helpers
function $(s){return document.querySelector(s)}
function setText(e,t){if(e)e.textContent=t}
function html(e,m){if(e)e.innerHTML=m}

function spawnConfetti(count=40){
  const colors=['#ffd166','#06d6a0','#ef476f','#118ab2','#f6ae2d','#a3f7bf'];
  const c=document.createElement('div'); c.className='confetti'; document.body.appendChild(c);
  for(let i=0;i<count;i++){
    const p=document.createElement('div'); p.className='confetti-piece';
    p.style.left=Math.random()*100+'vw';
    p.style.background=colors[(Math.random()*colors.length)|0];
    p.style.animationDuration=(1.8+Math.random()*1.4)+'s';
    p.style.animationDelay=(Math.random()*0.2)+'s';
    p.style.transform=`translateY(-10vh) rotate(${Math.random()*360}deg)`;
    c.appendChild(p);
  }
  setTimeout(()=>{ c.remove(); }, 2600);
}

function showAnimatedResult(el, text, variant='info'){
  if(!el) return;
  el.style.display='block';
  el.className = 'result result-box ' + variant + ' reveal';
  el.textContent = text;
  if(variant === 'win') spawnConfetti(60);
}

/* =====================
   Game 1: Predict the Future
===================== */
(function(){
  const form = document.getElementById('f-form');
  const out = document.getElementById('f-out');
  if(!form || !out) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showAnimatedResult(out, '🔮 Summoning prophecies...', 'info');
    const data = { name: form.name.value.trim(), birthMonth: form.birthMonth.value, favoritePlace: form.place.value.trim() };
    try{
      const res = await fetch('/api/predict-future', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data) });
      const json = await res.json();
      const text = json.ok ? json.content : ('Error: ' + (json.error || 'Unknown error'));
      showAnimatedResult(out, text, json.ok ? 'info' : 'lose');
      form.name.value=''; form.birthMonth.selectedIndex=0; form.place.value='';
    }catch{
      showAnimatedResult(out, 'Network error. Please try again.', 'lose');
    }
  });
})();

/* =====================
   Game 2: Hard Quiz with 20s timer and no repeats server-side
===================== */
(function(){
  const startForm = document.querySelector('#quiz-start');
  if(!startForm) return;

  const area   = document.querySelector('#quiz-area');
  const status = document.querySelector('#quiz-status');
  const timerEl= document.querySelector('#quiz-timer');
  const qEl    = document.querySelector('#quiz-question');
  const optsEl = document.querySelector('#quiz-options');
  const explEl = document.querySelector('#quiz-expl');
  const nextEl = document.querySelector('#quiz-next');

  let token = null;
  let lock = false;
  let tHandle = null;
  let timeLeft = 20;

  function clearTimer(){ if(tHandle){ clearInterval(tHandle); tHandle=null; } }
  function startTimer(onExpire){
    clearTimer();
    timeLeft = 20;
    timerEl.textContent = `⏱ ${timeLeft}s`;
    tHandle = setInterval(()=>{
      timeLeft -= 1;
      timerEl.textContent = `⏱ ${timeLeft}s`;
      if(timeLeft <= 0){ clearTimer(); if(!lock) onExpire(); }
    },1000);
  }

  async function submitAnswer(choiceIndex, clickedEl){
    if(lock) return; lock = true;
    Array.from(optsEl.children).forEach(n=>n.style.pointerEvents='none');
    clearTimer();
    try{
      const res = await fetch('/api/quiz/answer', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ token, choice: choiceIndex }) });
      const json = await res.json();
      if(!json.ok){ nextEl.style.display='block'; nextEl.className='result'; nextEl.innerHTML = '<div class="pill">Error: '+(json.error||'Unknown')+'</div>'; lock=false; return; }
      if(clickedEl){
        clickedEl.style.borderColor = json.correct ? 'rgba(51,200,120,.8)' : 'rgba(255,80,80,.8)';
      } else {
        nextEl.style.display='block'; nextEl.className='result'; nextEl.innerHTML = '<div class="pill">⏳ Time up — counted as wrong.</div>';
      }
      if(json.explanation){ explEl.textContent = json.explanation; explEl.style.display='block'; } else { explEl.style.display='none'; }
      if(json.done){
        showAnimatedResult(nextEl, '🏁 Finished! Score: '+json.score+' / '+json.total, json.score >= 4 ? 'win' : 'lose');
        return;
      }
      nextEl.style.display='block'; nextEl.className='result'; nextEl.innerHTML='';
      const b = document.createElement('button'); b.className='btn'; b.textContent='Next';
      b.onclick = (e)=>{ e.preventDefault(); renderQuestion(json.next.idx, json.next.total, json.next.question, json.next.options); };
      nextEl.appendChild(b);
      lock=false;
    }catch{ nextEl.style.display='block'; nextEl.className='result'; nextEl.innerHTML='<div class="pill">Network error.</div>'; lock=false; }
  }

  function renderQuestion(idx, total, question, options){
    area.style.display='block';
    status.textContent = 'Question ' + idx + ' of ' + total;
    qEl.textContent = question || '';
    optsEl.innerHTML = ''; explEl.style.display='none'; explEl.textContent=''; nextEl.style.display='none'; nextEl.innerHTML=''; lock=false;
    (options||[]).forEach((opt,i)=>{
      const d = document.createElement('div'); d.className='option'; d.textContent=(i+1)+'. '+opt;
      d.onclick = ()=>submitAnswer(i+1,d); optsEl.appendChild(d);
    });
    startTimer(()=>submitAnswer(0,null)); // timeout path: choice 0 is always wrong
  }

  startForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const topic = e.target.topic.value.trim();
    e.target.topic.value='';
    optsEl.innerHTML = '<div class="pill">Preparing quiz...</div>';
    try{
      const res = await fetch('/api/quiz/start', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ topic }) });
      const json = await res.json();
      if(!json.ok){ optsEl.innerHTML = 'Error: ' + (json.error || 'Unknown error'); return; }
      token = json.token;
      renderQuestion(json.idx, json.total, json.question, json.options);
    }catch{ optsEl.innerHTML='Network error.'; }
  });
})();

/* =====================
   Game 3: Guess the Character (10 rounds, hints after 8)
===================== */
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
    d.innerHTML = '<b>'+who+':</b> '+text;
    chat.appendChild(d); chat.scrollTop = chat.scrollHeight;
  }

  startForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    html(chat, '<div class="pill">Picking a challenging secret character...</div>');
    const topic = e.target.topic.value; e.target.topic.value='';
    try{
      const res = await fetch('/api/character/start', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ topic }) });
      const json = await res.json();
      if(!json.ok){ html(chat, 'Error: ' + (json.error || 'Unknown error')); return; }
      sessionId = json.sessionId; roundsLeft = 10; $('#game').style.display = 'block';
      html(chat, ''); pushMsg('AI', json.message || 'Ask your first question!'); setText(rounds, 'Rounds left: ' + roundsLeft);
      if(result) result.innerHTML = ''; result.style.display='none';
    }catch{ html(chat, 'Network error.'); }
  });

  if(turnForm){
    turnForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if(!sessionId) return;
      const line = $('#userline').value.trim(); if(!line) return;
      pushMsg('You', line); $('#userline').value='';
      try{
        const res = await fetch('/api/character/turn', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ sessionId, text: line }) });
        const json = await res.json();
        if(!json.ok){ pushMsg('AI', 'Error: ' + (json.error || 'Unknown error')); return; }
        if(json.answer){ pushMsg('AI', json.answer); }
        if(json.hint){ pushMsg('AI', '💡 Hint: ' + json.hint); }
        if(json.done){
          const m = json.win ? `🎉 Correct! You found ${json.name}.` : `🕵️ Out of rounds. The character was ${json.name}.`;
          showAnimatedResult(result, m, json.win ? 'win' : 'lose');
          sessionId = null; if(json.message) pushMsg('AI', json.message); return;
        }
        if(typeof json.roundsLeft === 'number'){ roundsLeft = json.roundsLeft; setText(rounds, 'Rounds left: ' + roundsLeft); }
      }catch{ pushMsg('AI', 'Network error.'); }
    });
  }
})();

/* =====================
   Game 5: Future Price Prediction (hide AI price until guess)
===================== */
(function(){
  const card = document.getElementById('fpp-card');
  if(!card) return;
  const startForm = document.getElementById('fpp-start');
  const intro = document.getElementById('fpp-intro');
  const qaWrap = document.getElementById('fpp-qa');
  const status = document.getElementById('fpp-status');
  const qEl = document.getElementById('fpp-question');
  const yesBtn = document.getElementById('fpp-yes');
  const noBtn = document.getElementById('fpp-no');
  const actions = document.getElementById('fpp-actions');
  const genBtn = document.getElementById('fpp-generate');
  const guessWrap = document.getElementById('fpp-guess-wrap');
  const guessInput = document.getElementById('fpp-guess');
  const submitGuess = document.getElementById('fpp-submit-guess');
  const out = document.getElementById('fpp-out');

  let token = null, product=null, currency=null, currentPrice=null, questions=[], ix=0;
  const answers = new Array(10).fill(false);
  const show = (el)=>el&&el.classList.remove('hidden'); const hide=(el)=>el&&el.classList.add('hidden');

  function renderQuestion(){ status.textContent = `Question ${ix+1} of 10`; qEl.textContent = questions[ix] || ''; }

  startForm?.addEventListener('submit', async (e) => {
    e.preventDefault(); out.style.display='none'; out.textContent=''; const category = startForm.category.value.trim();
    try{
      const res = await fetch('/api/fpp/start',{method:'POST',headers:{'Content-Type':'application/json'},body: JSON.stringify({ category: category || undefined })});
      const json = await res.json();
      if(!json.ok){ showAnimatedResult(out, 'Error: '+(json.error||'Unknown error'), 'lose'); return; }
      token=json.token; product=json.product; currency=json.currency; currentPrice=json.currentPrice; questions=json.questions||[];
      intro.style.display='block'; intro.textContent=`Product: ${product} — Current Price: ${currency} ${currentPrice}`;
      ix=0; show(qaWrap); hide(actions); hide(guessWrap); renderQuestion();
    }catch{ showAnimatedResult(out, 'Network error.', 'lose'); }
  });

  function answer(val){ answers[ix]=!!val; ix+=1; if(ix<10){ renderQuestion(); }else{ hide(qaWrap); show(actions);} }
  yesBtn?.addEventListener('click', ()=>answer(true)); noBtn?.addEventListener('click', ()=>answer(false));

  genBtn?.addEventListener('click', async ()=>{
    if(!token) return; showAnimatedResult(out, '💹 Preparing the 5-year scenario...', 'info');
    try{
      const res = await fetch('/api/fpp/answers',{method:'POST',headers:{'Content-Type':'application/json'},body: JSON.stringify({ token, answers })});
      const json = await res.json();
      if(!json.ok){ showAnimatedResult(out, 'Error: '+(json.error||'Unknown error'), 'lose'); return; }
      showAnimatedResult(out, `All set. Now enter your 5-year price guess for ${product}.`, 'info'); 
      show(guessWrap);
    }catch{ showAnimatedResult(out, 'Network error.', 'lose'); }
  });

  submitGuess?.addEventListener('click', async ()=>{
    if(!token) return; const g = Number(guessInput.value); if(!isFinite(g)){ showAnimatedResult(out, 'Please enter a numeric guess.', 'lose'); return; }
    showAnimatedResult(out, '🔢 Checking your guess...', 'info');
    try{
      const res = await fetch('/api/fpp/guess',{method:'POST',headers:{'Content-Type':'application/json'},body: JSON.stringify({ token, guess: g })});
      const json = await res.json();
      if(!json.ok){ showAnimatedResult(out, 'Error: '+(json.error||'Unknown error'), 'lose'); return; }
      const text = (json.win
        ? `🎉 Great guess! You matched within 60%.\n\nYour Guess: ${json.currency} ${json.playerGuess}\nAI Price:  ${json.currency} ${json.aiPrice}`
        : `❌ Not quite. Better luck next time!\n\nYour Guess: ${json.currency} ${json.playerGuess}\nAI Price:  ${json.currency} ${json.aiPrice}`
      );
      showAnimatedResult(out, text, json.win ? 'win' : 'lose');
      guessInput.value='';
    }catch{ showAnimatedResult(out, 'Network error.', 'lose'); }
  });
})();

/* =====================
   Game 6: Budget Glam Builder
===================== */
(function(){
  const card = document.getElementById('glam-card');
  if(!card) return;

  const startForm = document.getElementById('glam-start');
  const hud = document.getElementById('glam-hud');
  const timerEl = document.getElementById('glam-timer');
  const budgetEl = document.getElementById('glam-budget');
  const spendEl = document.getElementById('glam-spend');
  const countEl = document.getElementById('glam-count');
  const pageEl = document.getElementById('glam-page');
  const listEl = document.getElementById('glam-list');
  const pager = document.getElementById('glam-pager');
  const prevBtn = document.getElementById('glam-prev');
  const nextBtn = document.getElementById('glam-next');
  const actions = document.getElementById('glam-actions');
  const finishBtn = document.getElementById('glam-finish');
  const out = document.getElementById('glam-out');

  let token = null, budget = 0, items = [], selected = new Set();
  let secsLeft = 180, timer = null, startedAt = 0, finished = false;
  const pageSize = 10; let page = 0; const minPick = 12;

  function show(el){ el && el.classList.remove('hidden'); }
  function hide(el){ el && el.classList.add('hidden'); }
  function spendTotal(){ return Array.from(selected).reduce((sum,i)=>sum + Number(items[i].price||0),0); }
  function updateHUD(){ spendEl.textContent='Spend: ₹'+spendTotal(); countEl.textContent='Selected: '+selected.size+'/'+minPick; pageEl.textContent='Page: '+(page+1); }

  function renderList(){
    listEl.innerHTML='';
    const start = page*pageSize, end = Math.min(items.length, start+pageSize);
    for(let i=start;i<end;i++){
      const it = items[i];
      const row = document.createElement('label'); row.className='option'; row.style.display='grid'; row.style.gridTemplateColumns='24px 1fr auto'; row.style.alignItems='center'; row.style.gap='10px';
      const cb = document.createElement('input'); cb.type='checkbox'; cb.checked=selected.has(i);
      cb.onchange = ()=>{
        if(cb.checked) selected.add(i); else selected.delete(i);
        if(spendTotal() > budget){ selected.delete(i); cb.checked=false; }
        updateHUD();
      };
      const text = document.createElement('div'); text.innerHTML = `<b>${it.name}</b><br><small>${it.category} • ${it.ecoFriendly ? '🌱 Eco' : '—'}</small><br>${it.description}`;
      const price = document.createElement('div'); price.textContent='₹'+it.price;
      row.appendChild(cb); row.appendChild(text); row.appendChild(price); listEl.appendChild(row);
    }
    prevBtn.disabled = page === 0; nextBtn.disabled = (page+1)*pageSize >= items.length;
    updateHUD();
  }

  function tick(){ secsLeft -= 1; if(secsLeft < 0){ finish(true); return; } timerEl.textContent = 'Time: '+secsLeft+'s'; }
  function finish(auto=false){
    if(finished) return; finished=true; clearInterval(timer);
    const timeTaken = Math.min(999, Math.round((Date.now()-startedAt)/1000));
    const selectedIndices = Array.from(selected);
    showAnimatedResult(out, 'Scoring your kit...', 'info');
    fetch('/api/glam/score',{method:'POST',headers:{'Content-Type':'application/json'},body: JSON.stringify({ token, selectedIndices, timeTaken })}).then(r=>r.json()).then(json=>{
      if(!json.ok){ showAnimatedResult(out,'Error: '+(json.error||'Unknown error'),'lose'); return; }
      const details = [
        `Score: ${json.score}/100`,
        `Budget: ₹${json.budgetInr} • Spend: ₹${json.totalSpend} • Time: ${json.timeTaken}s`,
        '',
        '✅ Positives:', ...(json.positives||[]).map(p=>'• '+p),
        '', '⚠️ Areas to improve:', ...(json.negatives||[]).map(n=>'• '+n),
        '', json.summary || ''
      ].join('\n');
      showAnimatedResult(out, (json.win?'🎉 You win!\n\n':'❌ Not this time.\n\n') + details, json.win?'win':'lose');
      hide(actions); hide(pager);
      listEl.querySelectorAll('input[type="checkbox"]').forEach(c=>c.disabled=true);
    }).catch(()=> showAnimatedResult(out,'Network error.','lose'));
  }

  startForm.addEventListener('submit', async (e)=>{
    e.preventDefault(); out.style.display='none'; out.textContent=''; finished=false; selected.clear(); secsLeft=180; page=0;
    const gender = startForm.gender.value; const budgetInr = Math.max(10000, Number(startForm.budget.value));
    try{
      const res = await fetch('/api/glam/start',{method:'POST',headers:{'Content-Type':'application/json'},body: JSON.stringify({ gender, budgetInr })});
      const json = await res.json();
      if(!json.ok){ showAnimatedResult(out,'Error: '+(json.error||'Unknown error'),'lose'); return; }
      token = json.token; budget = json.budgetInr; items = json.items || [];
      budgetEl.textContent='Budget: ₹'+budget; show(hud); show(listEl); show(actions); show(pager);
      showAnimatedResult(out, `Pick at least ${minPick} products within budget before the timer ends!`, 'info');
      clearInterval(timer); secsLeft = 180; timerEl.textContent='Time: '+secsLeft+'s'; startedAt=Date.now(); timer=setInterval(tick,1000);
      renderList();
    }catch{ showAnimatedResult(out,'Network error.','lose'); }
  });

  const prevBtn = document.getElementById('glam-prev');
  const nextBtn = document.getElementById('glam-next');
  prevBtn.addEventListener('click', ()=>{ if(page>0){ page-=1; renderList(); } });
  nextBtn.addEventListener('click', ()=>{ if((page+1)*pageSize < items.length){ page+=1; renderList(); } });
  finishBtn.addEventListener('click', ()=>finish(false));
})();
