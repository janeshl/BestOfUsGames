
// -------------------- Utilities --------------------
async function aiComplete({system, prompt, json=false}){
  try{
    const messages = [];
    if(system) messages.push({role:"system", content:system});
    messages.push({role:"user", content:prompt});

    const body = { model: "llama-3.3-70b-versatile", temperature: 0.9, messages };
    if(json){ body.response_format = { type: "json_object" }; }

    const res = await fetch("/api/chat", {
      method:"POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(body)
    });
    if(!res.ok) return null;
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content?.trim();
    if(json){ try{ return JSON.parse(content); }catch(e){ return null; } }
    return content || null;
  }catch(e){ console.warn("AI proxy failed", e); return null; }
}

function burstConfetti({x=window.innerWidth/2, y=window.innerHeight/2, count=140, spread=1.8}={}){
  const canvas=document.createElement("canvas"); canvas.style.position="fixed"; canvas.style.inset="0"; canvas.style.pointerEvents="none";
  canvas.width=innerWidth; canvas.height=innerHeight; document.body.appendChild(canvas);
  const ctx=canvas.getContext("2d"); const parts=[];
  for(let i=0;i<count;i++){ parts.push({x,y,vx:(Math.random()-0.5)*8*spread,vy:(Math.random()-0.9)*10*spread-6,g:0.18+Math.random()*0.12,life:80+Math.random()*60,size:2+Math.random()*3,alpha:1}); }
  (function tick(){ ctx.clearRect(0,0,canvas.width,canvas.height);
    parts.forEach(p=>{ p.vy+=p.g; p.x+=p.vx; p.y+=p.vy; p.life-=1; p.alpha=Math.max(0,p.life/120);
      ctx.globalAlpha=p.alpha; ctx.fillStyle=`hsl(${(p.life*7)%360} 90% 60%)`; ctx.beginPath(); ctx.arc(p.x,p.y,p.size,0,Math.PI*2); ctx.fill();});
    if(parts.some(p=>p.life>0)) requestAnimationFrame(tick); else document.body.removeChild(canvas);
  })();
}

// -------------------- Page Router --------------------
const page = document.body.getAttribute("data-page");
if(page==="predict") initPredict();
if(page==="quiz") initQuiz();
if(page==="guess") initGuess();
if(page==="diet") initDiet();
if(page==="price") initPrice();
if(page==="glam") initGlam();

// -------------------- Predict --------------------
function initPredict(){
  const btn = document.getElementById("predictBtn");
  const out = document.getElementById("predOut");
  btn.addEventListener("click", async ()=>{
    const name = (document.getElementById("name").value.trim() || "Friend");
    const month = (document.getElementById("month").value || "a mysterious month");
    const place = (document.getElementById("place").value.trim() || "somewhere magical");
    const hobby = (document.getElementById("hobby").value.trim() || "daydreaming");
    out.style.display="block"; out.innerHTML="<div class='small'>Summoning the oracles...</div>";
    const system="You are a playful fortune-teller. Always return exactly 3 numbered, short, funny predictions. Keep it family-friendly.";
    const prompt=`Make 3 funny predictions (2 sentences each) for ${name}, born in ${month}, who loves ${hobby} and adores ${place}.`;
    let content = await aiComplete({system, prompt});
    if(!content){
      const picks=[
        `1) In ${month}, ${name} will accidentally become the local ${hobby} celebrity after capturing a legendary selfie at ${place}. Expect spontaneous high-fives everywhere.`,
        `2) A seagull will deliver a handwritten invitation to a secret club for people who love ${hobby}. Membership perk: unlimited snacks (please share).`,
        `3) Your future self declares a national holiday called “${name} Day” where everyone must say “wow” at least 7 times while thinking about ${place}.`
      ]; content=picks.join("\\n");
    }
    out.innerHTML=`<h3>✨ Your Predictions</h3><pre style="white-space:pre-wrap; font-family:inherit;">${content}</pre>`;
    burstConfetti({count:160, spread:1.4});
  });
}

// -------------------- Quiz --------------------
function initQuiz(){
  const topicEl = document.getElementById("topic");
  const startBtn = document.getElementById("quizStart");
  const roundEl = document.getElementById("quizRound");
  const qwrap = document.getElementById("quizWrap");
  const timerEl = document.getElementById("quizTimer");
  const resCard = document.getElementById("quizResult");
  const statusEl = document.getElementById("quizStatus");
  const emojiEl = document.getElementById("quizEmoji");
  const summaryEl = document.getElementById("quizSummary");

  let questions=[]; let round=0; let score=0; let timerInt=null; let remaining=20;

  function countdown(onExpire){
    clearInterval(timerInt); remaining=20; timerEl.textContent=remaining+"s";
    timerInt=setInterval(()=>{ remaining--; timerEl.textContent=remaining+"s"; if(remaining<=0){ clearInterval(timerInt); onExpire(); } },1000);
  }
  function renderQuestion(){
    const q=questions[round-1];
    qwrap.innerHTML=`
      <div><strong>${q.q}</strong></div>
      <div class="options">
        ${q.options.map((opt,i)=>`<label class="option"><input type="radio" name="opt" value="${i}"/> ${opt}</label>`).join("")}
      </div>
      <button class="btn" id="submit">Submit</button>`;
    document.getElementById("submit").onclick=()=>{
      const val=Number((document.querySelector('input[name="opt"]:checked')||{}).value);
      clearInterval(timerInt);
      if(Number.isNaN(val)) next(false); else next(val===q.answer);
    };
    countdown(()=>next(false));
  }
  function next(correct){ if(correct) score++; if(round>=5){ endGame(); } else { round++; roundEl.textContent=String(round); renderQuestion(); } }
  function endGame(){
    qwrap.innerHTML=""; resCard.style.display="block";
    if(score===5){ statusEl.innerHTML=`<h3>🔥 Perfect! You scored 5/5</h3>`; emojiEl.textContent="🎉"; burstConfetti({count:200, spread:1.6}); }
    else { statusEl.innerHTML=`<h3>Better luck next time — you scored ${score}/5</h3>`; emojiEl.textContent="😔"; }
    summaryEl.innerHTML=`Topic: <span class="pill">${topicEl.value || "Mixed"}</span>`;
  }
  async function makeQuestions(topic){
    const sys="Create 5 very tough MCQ questions with 4 options each for the given topic. Return strict JSON: {items:[{q,options:[a,b,c,d],answerIndex:number}]}";
    const data=await aiComplete({system:sys, prompt:`Topic: ${topic}`, json:true});
    if(data?.items?.length===5) return data.items.map(it=>({ q:it.q, options:it.options, answer:Number(it.answerIndex)||0 }));
    const bank = (topic.toLowerCase().includes("java")) ? [
      {q:"Which GC algorithm is default in modern OpenJDK HotSpot (server) for throughput?", options:["Serial GC","G1 GC","Shenandoah","ZGC"], answer:1},
      {q:"What does the 'volatile' keyword guarantee?", options:["Atomicity of compound operations","Visibility + ordering of writes","Mutual exclusion","Faster access"], answer:1},
      {q:"Which interface underpins streams' lazy evaluation?", options:["Supplier","Iterable","Spliterator","Collector"], answer:2},
      {q:"What is the major benefit of sealed classes?", options:["Runtime speed","Exhaustive type hierarchies","Reflection power","Smaller bytecode"], answer:1},
      {q:"What is the size of an object header on 64-bit HotSpot with compressed oops?", options:["8 bytes","12 bytes","16 bytes","24 bytes"], answer:2},
    ] : (topic.toLowerCase().includes("space") ? [
      {q:"Which star is the closest to the Sun?", options:["Barnard's Star","Proxima Centauri","Sirius A","Tau Ceti"], answer:1},
      {q:"What is the main constituent of Jupiter's atmosphere?", options:["Oxygen","Methane","Hydrogen","Ammonia"], answer:2},
      {q:"Which telescope discovered the first exoplanet around a Sun-like star?", options:["Hubble","Kepler","La Silla/51 Peg","Spitzer"], answer:2},
      {q:"What's the approximate age of the universe?", options:["4.5 billion years","7.5 billion years","10.5 billion years","13.8 billion years"], answer:3},
      {q:"Which object is a dwarf planet?", options:["Ganymede","Vesta","Ceres","Enceladus"], answer:2},
    ] : [
      {q:"What is the largest internal organ by mass?", options:["Liver","Lungs","Brain","Pancreas"], answer:0},
      {q:"Which vitamin is fat-soluble?", options:["Vitamin C","Vitamin B1","Vitamin K","Vitamin B12"], answer:2},
      {q:"Which sport term belongs to cricket?", options:["Love","Bogey","Yorker","Ruck"], answer:2},
      {q:"The speed of light (c) in vacuum is about:", options:["3×10^6 m/s","3×10^8 m/s","3×10^10 m/s","3×10^12 m/s"], answer:1},
      {q:"Which language introduced generics earlier?", options:["Java","C#","Go","Python"], answer:1},
    ]);
    for(const q of bank){ q.options = q.options.slice().sort(()=>Math.random()-0.5); q.answer = q.options.indexOf(bank.find(b=>b.q===q.q).options[bank.find(b=>b.q===q.q).answer]); }
    return bank;
  }
  startBtn.addEventListener("click", async ()=>{
    resCard.style.display="none"; qwrap.innerHTML="Generating questions..."; score=0; round=1; roundEl.textContent="1";
    questions = await makeQuestions(topicEl.value || "general knowledge"); renderQuestion();
  });
}

// -------------------- Guess --------------------
function initGuess(){
  const topicEl=document.getElementById("gTopic");
  const startBtn=document.getElementById("gStart");
  const roundEl=document.getElementById("gRound");
  const qEl=document.getElementById("gQ"); const askBtn=document.getElementById("gAsk");
  const log=document.getElementById("gLog"); const end=document.getElementById("gEnd");
  const final=document.getElementById("gFinal"); const emo=document.getElementById("gEmo");
  let secret=null; let round=0;
  const sets={
    Science:[{name:"Albert Einstein",hints:["Won a Nobel Prize","Known for relativity","Wild hair"],facts:["physicist","german","nobel","relativity","theory","20th","scientist","swiss","professor"]},
             {name:"Marie Curie",hints:["Nobel laureate","Worked with radioactivity","From Poland/France"],facts:["female","scientist","radioactivity","polish","french","nobel","chemistry","physics"]}],
    Sports:[{name:"Lionel Messi",hints:["Football","Argentina","Many Ballon d'Ors"],facts:["football","soccer","argentina","barcelona","psg","forward","goat"]},
            {name:"Serena Williams",hints:["Tennis legend","Many Grand Slams","Powerful serve"],facts:["tennis","grand slam","williams","american","female","goat"]}],
    Movies:[{name:"Hermione Granger",hints:["Magic","Muggle-born","Top of the class"],facts:["harry potter","hogwarts","witch","gryffindor","magic","book"]},
            {name:"James Bond",hints:["Agent","License to kill","Aston Martin"],facts:["spy","mi6","agent","007","bond","british"]}],
    Politics:[{name:"Nelson Mandela",hints:["South Africa","Anti-apartheid","President"],facts:["president","south africa","apartheid","prison","freedom"]},
              {name:"Narendra Modi",hints:["Current Indian PM","From Gujarat","BJP"],facts:["prime minister","india","bjp","gujarat","pm"]}],
    Tech:[{name:"Elon Musk",hints:["SpaceX","Tesla","South Africa-born"],facts:["tesla","spacex","twitter","x.com","billionaire","engineer","ceo"]},
          {name:"Ada Lovelace",hints:["19th century","Analytical Engine","First programmer?"],facts:["programmer","analytical engine","byron","algorithm","math"]}]
  };
  function chooseSecret(){ const arr=sets[topicEl.value]; return arr[Math.floor(Math.random()*arr.length)]; }
  function answer(q){ const t=q.toLowerCase(); let yes=secret.facts.some(k=>t.includes(k));
    if(t.startsWith("is ")||t.startsWith("are ")||t.includes("alive")||t.includes("dead")) return Math.random()<0.5?"Yes.":"No.";
    if(yes) return "Yes."; if(t.includes("or")) return "Maybe."; return Math.random()<0.5?"No.":"Yes."; }
  function post(msg,role="you"){ const el=document.createElement("div"); el.innerHTML=`<div class="badge">${role==="you"?"You":"AI"}</div><div style="margin:6px 0 14px;">${msg}</div>`; log.prepend(el); }
  function giveHint(i){ return `<div class="pill">Hint ${i}: ${secret.hints[i-1]}</div>`; }
  function done(win){ end.style.display="block"; if(win){ final.innerHTML=`<h3>🎉 You got it! ${secret.name}</h3>`; emo.textContent="🎆"; burstConfetti({count:220, spread:1.8}); }
    else { final.innerHTML=`<h3>😔 Out of rounds. It was <strong>${secret.name}</strong>.</h3>`; emo.textContent="😞"; } }
  startBtn.addEventListener("click", ()=>{ secret=chooseSecret(); round=1; roundEl.textContent="1"; log.innerHTML=`<div class="small">Game started. Ask yes/no questions or type <span class="kbd">guess: name</span>.</div>`; end.style.display="none"; });
  askBtn.addEventListener("click", ()=>{
    if(!secret) return; const txt=qEl.value.trim(); if(!txt) return; post(txt,"you"); qEl.value="";
    if(txt.toLowerCase().startsWith("guess:")){ const g=txt.split(":")[1].trim().toLowerCase(); if(g===secret.name.toLowerCase()){ done(true); return; } else { post("Nope, that's not it.","ai"); } }
    else { const a=answer(txt); post(a,"ai"); }
    if(round===7) post(giveHint(1),"ai"); else if(round===8) post(giveHint(2),"ai"); else if(round===9) post(giveHint(3),"ai");
    if(round>=10) done(false); else { round++; roundEl.textContent=String(round); }
  });
}

// -------------------- Diet --------------------
function initDiet(){
  const s1=document.getElementById("dStep1"), s2=document.getElementById("dStep2"), plan=document.getElementById("dPlan");
  document.getElementById("dNext1").onclick=()=>{ s1.style.display="none"; s2.style.display="block"; };
  document.getElementById("dBack").onclick=()=>{ s2.style.display="none"; s1.style.display="block"; };
  document.getElementById("dGen").onclick=async ()=>{
    const get=id=>document.getElementById(id).value;
    const data={ age:get("dAge"),gender:get("dGender"),activity:get("dActivity"),diet:get("dDiet"),allergies:get("dAllergies"),goal:get("dGoal"),
      conditions:get("dCond"),cuisines:get("dCuis"),budget:get("dBudget"),meals:get("dMeals"),notes:get("dNotes") };
    plan.style.display="block"; plan.innerHTML="<div class='small'>Thinking of a tasty plan...</div>";
    const sys="You are a certified nutritionist. Create a practical, Indian-friendly meal plan. Include macros estimate, hydration tips, snacks, and 1-day sample menu. Keep it safe and general; avoid medical claims.";
    let content = await aiComplete({system:sys, prompt:`User profile: ${JSON.stringify(data)}. Return markdown with headings & bullet points.`});
    if(!content){
      content = `### Personalized Diet Plan (Preview)
- **Goal:** ${data.goal}; **Meals/day:** ${data.meals}; **Budget:** ₹${data.budget}
- **Style:** ${data.diet}, Activity: ${data.activity}, Cuisines: ${data.cuisines || "mixed"}
- **Allergies:** ${data.allergies || "none"}, **Notes:** ${data.notes || "—"}
**Macros (rough):** 45–55% carbs, 20–25% protein, 25–30% fats.
**Hydration:** 8–10 glasses water, add coconut water in hot weather.
**1-Day Sample**
- **Breakfast:** Oats upma + curd (vegan: soy curd)
- **Snack:** Fruit + nuts (if no allergy)
- **Lunch:** Dal, brown rice, salad (non-veg: add chicken/eggs)
- **Snack:** Buttermilk / green tea
- **Dinner:** Roti + paneer/tofu bhurji + cucumber raita
**Tips:** Plan weekend prep; choose seasonal produce; walk 20–30 mins daily.`;
    }
    plan.innerHTML = `<h3>Your Diet Plan</h3><div style="white-space:pre-wrap">${content}</div>`;
  };
}

// -------------------- Price --------------------
function initPrice(){
  const start=document.getElementById("pStart"); const pInfo=document.getElementById("pInfo"); const qCard=document.getElementById("pQCard");
  const qnum=document.getElementById("pQNum"); const question=document.getElementById("pQuestion");
  const yes=document.getElementById("pYes"); const no=document.getElementById("pNo");
  const guessCard=document.getElementById("pGuessCard"); const gtimer=document.getElementById("pTimer");
  const promptEl=document.getElementById("pPrompt"); const guessEl=document.getElementById("pGuess"); const submit=document.getElementById("pSubmit");
  const result=document.getElementById("pResult"); const rtext=document.getElementById("pRText"); const emo=document.getElementById("pEmoji"); const details=document.getElementById("pDetails");

  const products=[{name:"Premium Smartphone",price:69999},{name:"Mid-range Laptop",price:55999},{name:"Electric Scooter",price:79999},{name:"4K LED TV",price:45999},{name:"Organic Face Serum",price:1499},{name:"Running Shoes",price:5999},{name:"Wireless Earbuds",price:3499}];
  const scenarios=[
    {q:"Will raw material costs rise significantly?", up:1.15, down:0.95},
    {q:"Will the brand gain major market share?", up:1.2, down:0.98},
    {q:"Will import duties increase?", up:1.1, down:1.0},
    {q:"Will strong new competitors appear?", up:0.95, down:1.05},
    {q:"Will a recession hit the market?", up:0.9, down:1.02},
    {q:"Will the product get breakthrough features?", up:1.25, down:0.97},
    {q:"Will supply chain improve markedly?", up:0.98, down:1.05},
    {q:"Will currency inflation remain high?", up:1.12, down:0.98},
    {q:"Will sustainability regulations tighten?", up:1.05, down:0.99},
    {q:"Will demand shift to alternatives?", up:0.92, down:1.03}
  ];
  let chosen=null, idx=0, price=0, aiPrice=0, tInt=null, tLeft=60;

  function closeness(a,b){ return Math.min(a,b)/Math.max(a,b); }
  start.onclick=()=>{ chosen=products[Math.floor(Math.random()*products.length)]; price=chosen.price; pInfo.innerHTML=`<div class="badge">Suggested Product</div><p><strong>${chosen.name}</strong> — Current price: ₹${price}</p>`; qCard.style.display="block"; idx=0; aiPrice=price; ask(); };
  function ask(){ qnum.textContent=String(idx+1); question.textContent=scenarios[idx].q; }
  function handle(ansYes){ const sc=scenarios[idx]; aiPrice=Math.round(aiPrice*(ansYes?sc.up:sc.down)); idx++; if(idx>=scenarios.length){ qCard.style.display="none"; guessPhase(); } else ask(); }
  yes.onclick=()=>handle(true); no.onclick=()=>handle(false);
  function guessPhase(){ guessCard.style.display="block"; promptEl.innerHTML=`We evaluated scenarios for <strong>${chosen.name}</strong>. Guess its price after 5 years (current: ₹${price}).`; tLeft=60; gtimer.textContent="60s"; clearInterval(tInt); tInt=setInterval(()=>{ tLeft--; gtimer.textContent=tLeft+"s"; if(tLeft<=0){ clearInterval(tInt); submit.click(); } },1000); }
  submit.onclick=()=>{ clearInterval(tInt); const user=Number(guessEl.value); const close=closeness(user, aiPrice); result.style.display="block"; guessCard.style.display="none";
    if(close>=0.75){ rtext.innerHTML=`<h3>🎯 Great guess! You win.</h3>`; emo.textContent="🎆"; burstConfetti({count:220, spread:1.9}); }
    else{ rtext.innerHTML=`<h3>So close! But not enough.</h3>`; emo.textContent="😔"; }
    details.innerHTML=`AI price: <span class="pill">₹${aiPrice}</span> — Your guess: <span class="pill">₹${isNaN(user)?0:user}</span>`; };
}

// -------------------- Glam --------------------
function initGlam(){
  const genderEl=document.getElementById("glaGender"); const budgetEl=document.getElementById("glaBudget"); const startBtn=document.getElementById("glaStart");
  const game=document.getElementById("glaGame"); const list=document.getElementById("glaList"); const prev=document.getElementById("glaPrev"); const next=document.getElementById("glaNext"); const finish=document.getElementById("glaFinish");
  const timeEl=document.getElementById("glaTime"); const selectedEl=document.getElementById("glaSel"); const totalEl=document.getElementById("glaTotal"); const bvalEl=document.getElementById("glaBVal"); const countEl=document.getElementById("glaCount");
  const result=document.getElementById("glaResult"); const r=document.getElementById("glaR"); const em=document.getElementById("glaEm"); const points=document.getElementById("glaPoints");

  const items=[]; const categories=["Cleanser","Toner","Moisturizer","Sunscreen","Serum (Vit C)","Serum (Hyaluronic)","Exfoliant","Face Mask","Eye Cream","Lip Balm SPF","Body Lotion","Deodorant","Shampoo","Conditioner","Hair Mask","Hand Cream","Night Cream","Face Oil","Makeup Remover","BB/CC Cream","Beard Oil","Aftershave","Razor","Foot Cream","Sunscreen Stick","Tinted Sunscreen","Body Wash","Face Mist","Sheet Mask","Nail Care"];
  function seedItems(){ items.length=0; for(let i=0;i<30;i++){ const price=350+Math.floor(Math.random()*1200)+(i%5)*100; const cat=categories[i]; const eco=(i%3===0);
      items.push({ id:i+1, name:cat, price, desc:eco?"Eco-friendly formula with minimal packaging.":"Dermat-tested everyday essential.", cat, eco }); } }
  seedItems();

  let page=0; let chosen=new Set(); let budget=0; let sum=0; let timer=null; let left=180;
  function renderPage(){ const start=page*10; const slice=items.slice(start,start+10);
    list.innerHTML = slice.map(it=>`
      <label class="option">
        <input type="checkbox" data-id="${it.id}" ${chosen.has(it.id)?"checked":""}/>
        <div style="flex:1">
          <div><strong>${it.name}</strong> — ₹${it.price}</div>
          <div class="small">${it.desc}</div>
          <div class="small">Category: ${it.cat} ${it.eco?"• 🌿 eco":""}</div>
        </div>
      </label>`).join("");
    list.querySelectorAll("input[type=checkbox]").forEach(cb=>{
      cb.onchange=()=>{ const id=Number(cb.getAttribute("data-id")); const item=items.find(x=>x.id===id);
        if(cb.checked){ if(sum+item.price>budget){ alert("That would exceed your budget!"); cb.checked=false; return; } chosen.add(id); sum+=item.price; }
        else { chosen.delete(id); sum-=item.price; }
        updateHUD();
      };
    });
    updateHUD();
  }
  function updateHUD(){ selectedEl.textContent=String(chosen.size); countEl.textContent=String(chosen.size); totalEl.textContent=String(sum); }
  function score(){
    const util=Math.max(0,1-Math.abs(budget-sum)/budget); let s=util*40;
    const cats=new Set([...chosen].map(id=>items.find(i=>i.id===id).cat)); s+=Math.min(1,cats.size/12)*30;
    const ecoCount=[...chosen].filter(id=>items.find(i=>i.id===id).eco).length; s+=Math.min(1,ecoCount/6)*10;
    s+=Math.min(1,left/180)*10;
    const names=new Set([...chosen].map(id=>items.find(i=>i.id===id).name)); let combo=0;
    if(names.has("Cleanser")&&names.has("Moisturizer")) combo+=0.4;
    if(names.has("Shampoo")&&names.has("Conditioner")) combo+=0.3;
    if(names.has("Sunscreen")&&(names.has("Serum (Vit C)")||names.has("Serum (Hyaluronic)"))) combo+=0.3;
    s+=Math.min(1,combo)*10;
    return Math.round(s);
  }
  function finishGame(){
    clearInterval(timer); game.style.display="none"; result.style.display="block"; const sc=score();
    if(chosen.size<12){ r.innerHTML=`<h3>You picked only ${chosen.size} items (need ≥12). Score: ${sc}/100</h3>`; em.textContent="😔"; return; }
    if(sc>=75){ r.innerHTML=`<h3>👏 Great choices! Score: ${sc}/100</h3>`; em.textContent="🎉"; burstConfetti({count:220, spread:1.8}); } else { r.innerHTML=`<h3>Not quite there. Score: ${sc}/100</h3>`; em.textContent="😞"; }
    points.innerHTML = `<div>Budget used: ₹${sum} of ₹${budget}</div><div>Items chosen: ${chosen.size}</div><div>Unique categories: ${new Set([...chosen].map(id=>items.find(i=>i.id===id).cat)).size}</div><div>Eco-friendly picks: ${[...chosen].filter(id=>items.find(i=>i.id===id).eco).length}</div>`;
  }
  startBtn.onclick=()=>{ budget=Math.max(10000, Number(budgetEl.value)||10000); bvalEl.textContent=String(budget); game.style.display="block"; page=0; chosen=new Set(); sum=0; renderPage(); left=180; timeEl.textContent=String(left); clearInterval(timer);
    timer=setInterval(()=>{ left--; timeEl.textContent=String(left); if(left<=0){ clearInterval(timer); finishGame(); } },1000); };
  prev.onclick=()=>{ page=Math.max(0,page-1); renderPage(); };
  next.onclick=()=>{ page=Math.min(2,page+1); renderPage(); };
  finish.onclick=()=>finishGame();
}
