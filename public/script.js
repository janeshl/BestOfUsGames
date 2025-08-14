function $(s){return document.querySelector(s)}function $all(s){return Array.from(document.querySelectorAll(s))}function setText(e,t){if(e)e.textContent=t}function html(e,m){if(e)e.innerHTML=m}

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
      form.name.value=''; form.birthMonth.selectedIndex=0; form.place.value='';
    }catch{ setText(out, 'Network error. Please try again.'); }
  });
})();

// 5-Round Quiz
(function(){
  const startForm = document.querySelector('#quiz-start');
  if(!startForm) return;
  const area = document.querySelector('#quiz-area');
  const status = document.querySelector('#quiz-status');
  const qEl = document.querySelector('#quiz-question');
  const optsEl = document.querySelector('#quiz-options');
  const explEl = document.querySelector('#quiz-expl');
  const nextEl = document.querySelector('#quiz-next');

  let token = null;

  function renderQuestion(idx, total, question, options){
    area.style.display = 'block';
    status.textContent = 'Question ' + idx + ' of ' + total;
    qEl.textContent = question || '';
    optsEl.innerHTML = '';
    explEl.style.display = 'none';
    explEl.textContent = '';
    nextEl.innerHTML = '';

    (options || []).forEach((opt, i) => {
      const d = document.createElement('div');
      d.className = 'option';
      d.textContent = (i+1) + '. ' + opt;
      d.onclick = async () => {
        Array.from(optsEl.children).forEach(n => n.style.pointerEvents='none');
        try{
          const res = await fetch('/api/quiz/answer', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ token, choice: i+1 })
          });
          const json = await res.json();
          if(!json.ok){ nextEl.innerHTML = '<div class="pill">Error: '+(json.error||'Unknown')+'</div>'; return; }
          d.style.borderColor = json.correct ? 'rgba(51,200,120,.8)' : 'rgba(255,80,80,.8)';
          if(json.explanation){
            explEl.textContent = json.explanation;
            explEl.style.display = 'block';
          }
          if(json.done){
            nextEl.innerHTML = '<div class="pill">🏁 Finished! Score: '+json.score+' / '+json.total+'</div>';
          } else if(json.next){
            const b = document.createElement('button');
            b.className = 'btn'; b.textContent = 'Next';
            b.onclick = (e) => {
              e.preventDefault();
              renderQuestion(json.next.idx, json.next.total, json.next.question, json.next.options);
            };
            nextEl.appendChild(b);
          }
        }catch{
          nextEl.innerHTML = '<div class="pill">Network error. Please try again.</div>';
        }
      };
      optsEl.appendChild(d);
    });
  }

  startForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const topic = e.target.topic.value;
    e.target.topic.value = '';
    optsEl.innerHTML = '<div class="pill">Preparing quiz...</div>';
    try{
      const res = await fetch('/api/quiz/start', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ topic })
      });
      const json = await res.json();
      if(!json.ok){ optsEl.innerHTML = 'Error: ' + (json.error || 'Unknown error'); return; }
      token = json.token;
      renderQuestion(json.idx, json.total, json.question, json.options);
    }catch{
      optsEl.innerHTML = 'Network error. Please try again.';
    }
  });
})();

// Find the Character (conversational)
(function(){
  const startForm = $('#start-form');
  const turnForm = $('#turn-form');
  const chat = $('#chat');
  const rounds = $('#rounds');
  const result = $('#result');
  const answerBox = $('#answer-box');
  if(!startForm || !chat) return;
  let sessionId = null, roundsLeft = 10;

  function pushMsg(who, text){
    const d = document.createElement('div'); d.className='msg';
    d.innerHTML = '<b>'+who+':</b> '+text;
    chat.appendChild(d);
    chat.scrollTop = chat.scrollHeight;
  }

  startForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    html(chat, '<div class="pill">Picking a secret character...</div>');
    const topic = e.target.topic.value;
    e.target.topic.value='';
    try{
      const res = await fetch('/api/character/start', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ topic }) });
      const json = await res.json();
      if(!json.ok){ html(chat, 'Error: ' + (json.error || 'Unknown error')); return; }
      sessionId = json.sessionId;
      roundsLeft = 10;
      $('#game').style.display = 'block';
      html(chat, '');
      pushMsg('AI', json.message || 'Ask your first yes/no question!');
      setText(rounds, 'Rounds left: ' + roundsLeft);
    }catch{ html(chat, 'Network error. Please try again.'); }
  });

  if(turnForm){
    turnForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if(!sessionId) return;
      const line = $('#userline').value.trim();
      if(!line) return;
      pushMsg('You', line);
      $('#userline').value='';
      try{
        const res = await fetch('/api/character/turn', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ sessionId, text: line }) });
        const json = await res.json();
        if(!json.ok){ pushMsg('AI', 'Error: ' + (json.error || 'Unknown error')); return; }
        if(json.answer){ pushMsg('AI', json.answer); if(answerBox){ answerBox.textContent = json.answer; } }
        if(json.hint){ pushMsg('AI', '💡 Hint: ' + json.hint); }
        if(json.done){
          if(json.win){ html(result, '<div class="pill">🎉 Correct! You found ' + json.name + '.</div>'); }
          else { html(result, '<div class="pill">🕵️ Out of rounds. The character was ' + json.name + '.</div>'); }
          sessionId = null; if(json.message) pushMsg('AI', json.message); return;
        }
        if(typeof json.roundsLeft === 'number'){ roundsLeft = json.roundsLeft; setText(rounds, 'Rounds left: ' + roundsLeft); }
      }catch{ pushMsg('AI', 'Network error. Please try again.'); }
    });
  }
})();

// Find the Healthy-Diet (8 Qs; 4 + 4; then generate plan)
(function(){
  const card = document.getElementById('hd-card');
  if(!card) return;

  const loading = document.getElementById('hd-loading');
  const r1 = document.getElementById('hd-round1');
  const r2 = document.getElementById('hd-round2');
  const actions = document.getElementById('hd-actions');
  const out = document.getElementById('hd-output');

  let token = null;
  let questions = [];
  const answers = new Array(8).fill("");

  // helpers
  const show = (el) => el && el.classList.remove('hidden');
  const hide = (el) => el && el.classList.add('hidden');

  async function start(){
    try{
      const res = await fetch('/api/healthy/start', { method:'POST' });
      const json = await res.json();
      if(!json.ok){ loading.textContent = 'Error: ' + (json.error || 'Unknown error'); return; }
      token = json.token;
      questions = json.questions || [];
      // Fill round 1 labels
      document.getElementById('hd-q1').textContent = questions[0] || 'Question 1';
      document.getElementById('hd-q2').textContent = questions[1] || 'Question 2';
      document.getElementById('hd-q3').textContent = questions[2] || 'Question 3';
      document.getElementById('hd-q4').textContent = questions[3] || 'Question 4';
      // Fill round 2 labels
      document.getElementById('hd-q5').textContent = questions[4] || 'Question 5';
      document.getElementById('hd-q6').textContent = questions[5] || 'Question 6';
      document.getElementById('hd-q7').textContent = questions[6] || 'Question 7';
      document.getElementById('hd-q8').textContent = questions[7] || 'Question 8';
      // Show first round
      hide(loading); show(r1);
    }catch{
      loading.textContent = 'Network error. Please try again.';
    }
  }

  r1?.addEventListener('submit', (e)=>{
    e.preventDefault();
    const a1 = r1.a1.value.trim(), a2 = r1.a2.value.trim(), a3 = r1.a3.value.trim(), a4 = r1.a4.value.trim();
    if(!a1 || !a2 || !a3 || !a4) return;
    answers[0]=a1; answers[1]=a2; answers[2]=a3; answers[3]=a4;
    r1.a1.value=''; r1.a2.value=''; r1.a3.value=''; r1.a4.value='';
    hide(r1); show(r2);
  });

  r2?.addEventListener('submit', (e)=>{
    e.preventDefault();
    const a5 = r2.a5.value.trim(), a6 = r2.a6.value.trim(), a7 = r2.a7.value.trim(), a8 = r2.a8.value.trim();
    if(!a5 || !a6 || !a7 || !a8) return;
    answers[4]=a5; answers[5]=a6; answers[6]=a7; answers[7]=a8;
    r2.a5.value=''; r2.a6.value=''; r2.a7.value=''; r2.a8.value='';
    hide(r2); show(actions);
    out.textContent = "Ready to generate a personalized diet plan based on your answers.";
  });

  document.getElementById('hd-generate')?.addEventListener('click', async ()=>{
    if(!token) return;
    out.textContent = "🥗 Generating your diet plan...";
    try{
      const res = await fetch('/api/healthy/plan', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ token, answers })
      });
      const json = await res.json();
      out.textContent = json.ok ? (json.plan || "No content") : ('Error: ' + (json.error || 'Unknown error'));
    }catch{
      out.textContent = 'Network error. Please try again.';
    }
  });

  start();
})();

// Future Price Prediction (10 yes/no -> AI price -> player's guess; hide AI price until after guess)
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

  let token = null;
  let product = null;
  let currency = null;
  let currentPrice = null;
  let questions = [];
  let ix = 0;
  const answers = new Array(10).fill(false);

  function show(el){ if(el) el.classList.remove('hidden'); }
  function hide(el){ if(el) el.classList.add('hidden'); }

  function renderQuestion(){
    status.textContent = `Question ${ix+1} of 10`;
    qEl.textContent = questions[ix] || '';
  }

  startForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    out.textContent = '';
    const category = startForm.category.value.trim();
    try{
      const res = await fetch('/api/fpp/start', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ category: category || undefined })
      });
      const json = await res.json();
      if(!json.ok){ out.textContent = 'Error: ' + (json.error || 'Unknown error'); return; }
      token = json.token;
      product = json.product;
      currency = json.currency;
      currentPrice = json.currentPrice;
      questions = json.questions || [];

      intro.style.display = 'block';
      intro.textContent = `Product: ${product} — Current Price: ${currency} ${currentPrice}`;

      // Start Q&A
      ix = 0;
      show(qaWrap);
      hide(actions);
      hide(guessWrap);
      renderQuestion();
    }catch{
      out.textContent = 'Network error. Please try again.';
    }
  });

  function answer(val){
    answers[ix] = !!val;
    ix += 1;
    if(ix < 10){
      renderQuestion();
    }else{
      hide(qaWrap);
      show(actions);
    }
  }

  yesBtn?.addEventListener('click', ()=>answer(true));
  noBtn?.addEventListener('click',  ()=>answer(false));

  // After generating the AI price, DO NOT show it yet — prompt for guess
  genBtn?.addEventListener('click', async ()=>{
    if(!token) return;
    out.textContent = '💹 Preparing the 5-year scenario...';
    try{
      const res = await fetch('/api/fpp/answers', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ token, answers })
      });
      const json = await res.json();
      if(!json.ok){ out.textContent = 'Error: ' + (json.error || 'Unknown error'); return; }

      // Hide AI price & reasoning here — just prompt for guess now
      out.textContent = `All set. Now enter your 5-year price guess for ${product}.`;
      show(guessWrap);
    }catch{
      out.textContent = 'Network error. Please try again.';
    }
  });

  // Reveal AI price ONLY after the player's guess, alongside result
  submitGuess?.addEventListener('click', async ()=>{
    if(!token) return;
    const g = Number(guessInput.value);
    if(!isFinite(g)){ out.textContent = 'Please enter a numeric guess.'; return; }
    out.textContent = '🔢 Checking your guess...';
    try{
      const res = await fetch('/api/fpp/guess', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ token, guess: g })
      });
      const json = await res.json();
      if(!json.ok){ out.textContent = 'Error: ' + (json.error || 'Unknown error'); return; }

      // Now show both values & result
      out.textContent =
        (json.win
          ? `🎉 Great guess! You matched within 60%.\n\nYour Guess: ${json.currency} ${json.playerGuess}\nAI Price:  ${json.currency} ${json.aiPrice}`
          : `❌ Not quite. Better luck next time!\n\nYour Guess: ${json.currency} ${json.playerGuess}\nAI Price:  ${json.currency} ${json.aiPrice}`
        );

      guessInput.value = '';
    }catch{
      out.textContent = 'Network error. Please try again.';
    }
  });
})();

// Budget Glam Builder — 180s, 30 items, 10-per-page, min pick = 12
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

  let token = null;
  let budget = 0;
  let items = [];
  let selected = new Set();
  let secsLeft = 180;
  let timer = null;
  let startedAt = 0;
  let finished = false;

  // pagination
  const pageSize = 10;
  let page = 0; // 0-based

  const minPick = 12;

  function show(el){ el && el.classList.remove('hidden'); }
  function hide(el){ el && el.classList.add('hidden'); }

  function spendTotal(){
    return Array.from(selected).reduce((sum,i)=>sum + Number(items[i].price||0),0);
  }

  function updateHUD(){
    spendEl.textContent = 'Spend: ₹' + spendTotal();
    countEl.textContent = 'Selected: ' + selected.size + '/' + minPick;
    pageEl.textContent = 'Page: ' + (page + 1);
  }

  function renderList(){
    listEl.innerHTML = '';
    const start = page * pageSize;
    const end = Math.min(items.length, start + pageSize);
    for (let i = start; i < end; i++) {
      const it = items[i];
      const row = document.createElement('label');
      row.className = 'option';
      row.style.display = 'grid';
      row.style.gridTemplateColumns = '24px 1fr auto';
      row.style.alignItems = 'center';
      row.style.gap = '10px';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = selected.has(i);
      cb.onchange = () => {
        if (cb.checked) {
          selected.add(i);
        } else {
          selected.delete(i);
        }
        // prevent overspend
        const total = spendTotal();
        if (total > budget) {
          selected.delete(i);
          cb.checked = false;
        }
        updateHUD();
      };

      const text = document.createElement('div');
      text.innerHTML = `<b>${it.name}</b><br><small>${it.category} • ${it.ecoFriendly ? '🌱 Eco' : '—'}</small><br>${it.description}`;

      const price = document.createElement('div');
      price.textContent = '₹' + it.price;

      row.appendChild(cb);
      row.appendChild(text);
      row.appendChild(price);
      listEl.appendChild(row);
    }

    // enable/disable pager buttons
    prevBtn.disabled = page === 0;
    nextBtn.disabled = (page + 1) * pageSize >= items.length;

    updateHUD();
  }

  function tick(){
    secsLeft -= 1;
    if (secsLeft < 0) { finish(true); return; }
    timerEl.textContent = 'Time: ' + secsLeft + 's';
  }

  function finish(auto=false){
    if(finished) return; finished = true;
    clearInterval(timer);
    const timeTaken = Math.min(999, Math.round((Date.now() - startedAt)/1000));
    const selectedIndices = Array.from(selected);
    out.textContent = 'Scoring your kit...';
    fetch('/api/glam/score', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ token, selectedIndices, timeTaken })
    }).then(r=>r.json()).then(json=>{
      if(!json.ok){ out.textContent = 'Error: ' + (json.error || 'Unknown error'); return; }
      const head = json.win ? '🎉 You win!' : '❌ Not this time';
      const details = [
        `${head}  Score: ${json.score}/100`,
        `Budget: ₹${json.budgetInr} • Spend: ₹${json.totalSpend} • Time: ${json.timeTaken}s`,
        '',
        '✅ Positives:',
        ...(json.positives || []).map(p => '• ' + p),
        '',
        '⚠️ Areas to improve:',
        ...(json.negatives || []).map(n => '• ' + n),
        '',
        json.summary || ''
      ].join('\n');
      out.textContent = details;
      hide(actions); hide(pager);
      listEl.querySelectorAll('input[type="checkbox"]').forEach(c=>c.disabled=true);
    }).catch(()=> out.textContent = 'Network error. Please try again.');
  }

  // Start game
  startForm.addEventListener('submit', async (e)=>{
    e.preventDefault();
    out.textContent = 'Fetching your glam bucket...';
    finished = false; selected.clear(); secsLeft = 180; page = 0;
    const gender = startForm.gender.value;
    const budgetInr = Math.max(10000, Number(startForm.budget.value));
    try{
      const res = await fetch('/api/glam/start', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ gender, budgetInr })
      });
      const json = await res.json();
      if(!json.ok){ out.textContent = 'Error: ' + (json.error || 'Unknown error'); return; }
      token = json.token; budget = json.budgetInr; items = json.items || [];
      budgetEl.textContent = 'Budget: ₹' + budget;
      show(hud); show(listEl); show(actions); show(pager);
      out.textContent = `Pick at least ${minPick} products within budget before the timer ends!`;
      // start timer
      clearInterval(timer);
      secsLeft = 180; timerEl.textContent = 'Time: ' + secsLeft + 's';
      startedAt = Date.now();
      timer = setInterval(tick, 1000);
      renderList();
    }catch{
      out.textContent = 'Network error. Please try again.';
    }
  });

  // Pager
  prevBtn.addEventListener('click', ()=>{
    if(page > 0){ page -= 1; renderList(); }
  });
  nextBtn.addEventListener('click', ()=>{
    if((page + 1) * pageSize < items.length){ page += 1; renderList(); }
  });

  // Finish
  finishBtn.addEventListener('click', ()=>finish(false));
})();

