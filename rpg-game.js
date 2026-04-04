// ===== GAME STATE =====
const defaultState = {
  monsterName: "",
  hp: 30,
  atk: 6,
  def: 3,
  gold: 0,
  vocabCorrect: 0,
  grammarCorrect: 0,
  readingCorrect: 0,
  grammarStreak: 0,
  readingStreak: 0,
  spd: 1,
  listeningCorrect: 0,
  ownedEquip: [],
  potions: 0,
  storyCleared: [],
  storyBadges: [],
  evoGauge: 0,
  evoStage: 0,
  ownedMonsters: [1],
  activeMonster: 1,
  monsterProgress: {},
  team: [1, null, null]
};
let gameState = { ...defaultState };

// ===== PLAYER ID (standalone, never regenerated) =====
let playerId = localStorage.getItem('monsterRPG_playerId');
if (!playerId) {
  playerId = 'p_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
  localStorage.setItem('monsterRPG_playerId', playerId);
}

// ===== BATTLE STATE =====
let battleState = null;

// ===== SAVE / LOAD =====
function saveGame() {
  localStorage.setItem('monsterEnglishRPG', JSON.stringify(gameState));
}

function loadGame() {
  const data = localStorage.getItem('monsterEnglishRPG');
  if (data) {
    const saved = JSON.parse(data);
    gameState = { ...defaultState, ...saved };
    if (!Array.isArray(gameState.ownedEquip)) gameState.ownedEquip = [];
    if (typeof gameState.potions !== 'number') gameState.potions = 0;
    if (!Array.isArray(gameState.storyCleared)) gameState.storyCleared = [];
    if (!Array.isArray(gameState.storyBadges)) gameState.storyBadges = [];
    if (!Array.isArray(gameState.ownedMonsters)) gameState.ownedMonsters = [1];
    if (!gameState.activeMonster) gameState.activeMonster = 1;
    if (!gameState.monsterProgress) gameState.monsterProgress = {};
    if (!Array.isArray(gameState.team)) gameState.team = [gameState.activeMonster || 1, null, null];
    // Migrate old playerId from gameState if present
    if (saved.playerId && saved.playerId !== playerId) {
      playerId = saved.playerId;
      localStorage.setItem('monsterRPG_playerId', playerId);
    }
    return true;
  }
  return false;
}

// ===== PLAYER LEVEL (derived from total correct answers) =====
function getPlayerLevel() {
  const total = gameState.vocabCorrect + gameState.grammarCorrect + gameState.readingCorrect + (gameState.listeningCorrect || 0);
  return Math.floor(total / 5) + 1;
}

// ===== MONSTER STAGE IMAGES =====
const stageImages = ['monster-stage1.png','monster-stage2.png','monster-stage3.png','monster-stage4.png'];
const stageThresholds = [1, 10, 20, 30]; // level thresholds

function getMonsterStage(level) {
  return gameState.evoStage || 0;
}

function getMonsterImage(level) {
  return stageImages[getMonsterStage(level)];
}

function getMonsterStageImage(mon, stage) {
  if (!mon) return 'monster-1.png';
  if (stage <= 0) return mon.img;
  // Stage 2+: try monster-X-stage(N+1).png, fallback to base with CSS effect
  return `monster-${mon.id}-stage${stage + 1}.png`;
}

function updateMonsterImages() {
  const activeMon = getActiveMonster();
  const stage = gameState.evoStage || 0;
  const imgEl = document.getElementById('monster-img');
  const battleEl = document.getElementById('player-battle-sprite');

  if (stage > 0 && activeMon.id !== 1) {
    // Non-Blue Slime evolved: use stage image with CSS fallback
    const stageImg = getMonsterStageImage(activeMon, stage);
    imgEl.src = stageImg;
    battleEl.src = stageImg;
    // CSS fallback: brightness + scale increase for evolved stages
    const evoScale = 1 + stage * 0.08;
    const evoBright = 1 + stage * 0.15;
    const evoFilter = `brightness(${evoBright}) drop-shadow(0 0 ${8 + stage * 6}px ${activeMon.color})`;
    imgEl.style.filter = evoFilter;
    imgEl.style.transform = `scale(${evoScale})`;
    battleEl.style.filter = evoFilter;
    // On image error, fall back to base image with filter
    imgEl.onerror = () => { imgEl.src = activeMon.img; };
    battleEl.onerror = () => { battleEl.src = activeMon.img; };
  } else if (activeMon.id === 1 && stage > 0) {
    // Blue Slime: use existing stageImages
    const img = stageImages[stage] || activeMon.img;
    imgEl.src = img;
    battleEl.src = img;
    imgEl.style.filter = '';
    imgEl.style.transform = '';
    battleEl.style.filter = '';
    imgEl.onerror = null;
    battleEl.onerror = null;
  } else {
    // Base stage
    imgEl.src = activeMon.img || 'monster-1.png';
    battleEl.src = activeMon.img || 'monster-1.png';
    imgEl.style.filter = '';
    imgEl.style.transform = '';
    battleEl.style.filter = '';
    imgEl.onerror = null;
    battleEl.onerror = null;
  }
}

// ===== EVOLUTION GAUGE SYSTEM =====
const evoThresholds = [100, 200, 350]; // gauge needed for stage 2,3,4
const stageNames = ['Baby Slime','Brave Slime','Slime Prince','Slime King'];
const skillData = [
  null,
  {name:'Power Surge', desc:'1.5x damage', icon:'\u26A1'},
  {name:'Mind Blast', desc:'Skip question, full dmg', icon:'\uD83E\uDDE0'},
  {name:'Final Form', desc:'Crit + 2x damage', icon:'\uD83D\uDD25'}
];

function getActiveMonsterMaxStages() {
  const mon = getActiveMonster();
  return mon.maxStages || 4;
}

function getActiveMonsterEvoThresholds() {
  const mon = getActiveMonster();
  return mon.evoThresholds || evoThresholds;
}

function getEvoMax() {
  const stage = gameState.evoStage || 0;
  const maxStages = getActiveMonsterMaxStages();
  if (stage >= maxStages - 1) return 0; // already at max stage
  const thresholds = getActiveMonsterEvoThresholds();
  return thresholds[stage] || 0;
}

function addEvoGauge(amount) {
  const maxStages = getActiveMonsterMaxStages();
  if ((gameState.evoStage || 0) >= maxStages - 1) return;
  gameState.evoGauge = (gameState.evoGauge || 0) + amount;
  saveGame();
  updateEvoGaugeUI();
}

function updateEvoGaugeUI() {
  const stage = gameState.evoStage || 0;
  const gauge = gameState.evoGauge || 0;
  const max = getEvoMax();
  const mon = getActiveMonster();
  const maxStages = mon.maxStages || 4;
  const names = mon.stageNames || stageNames;

  document.getElementById('home-stage-name').textContent = names[stage] || mon.name;

  if (stage >= maxStages - 1) {
    document.getElementById('evo-gauge-label').textContent = 'MAX EVOLUTION';
    document.getElementById('evo-gauge-fill').style.width = '100%';
    document.getElementById('evo-gauge-text').textContent = 'MAX';
    document.getElementById('evo-gauge-bg').classList.remove('hot');
    document.getElementById('evo-btn').style.display = 'none';
    return;
  }

  const pct = Math.min(Math.floor((gauge / max) * 100), 100);
  document.getElementById('evo-gauge-label').textContent = 'Evolution: ' + pct + '%';
  document.getElementById('evo-gauge-fill').style.width = pct + '%';
  document.getElementById('evo-gauge-text').textContent = pct + '%';

  if (gauge >= max) {
    document.getElementById('evo-btn').style.display = 'inline-block';
    document.getElementById('evo-gauge-bg').classList.add('hot');
  } else {
    document.getElementById('evo-btn').style.display = 'none';
    document.getElementById('evo-gauge-bg').classList.toggle('hot', pct >= 90);
  }
}

function triggerEvolution() {
  const oldStage = gameState.evoStage || 0;
  const newStage = oldStage + 1;
  const mon = getActiveMonster();
  const bonus = mon.evoBonus || {hp:5,atk:2,def:2,spd:2};

  gameState.evoStage = newStage;
  gameState.evoGauge = 0;
  // Per-monster stat bonuses on evolution
  gameState.hp += bonus.hp;
  gameState.atk += bonus.atk;
  gameState.def += bonus.def;
  gameState.spd = (gameState.spd || 1) + bonus.spd;
  saveGame();
  updateMonsterImages();
  playEvoAnimation(newStage);
}

function playEvoAnimation(newStage) {
  const overlay = document.getElementById('evo-fullscreen');
  const bg = document.getElementById('evo-bg');
  const monster = document.getElementById('evo-monster');
  const title = document.getElementById('evo-title');
  const subtitle = document.getElementById('evo-subtitle');
  const statsList = document.getElementById('evo-stats-list');

  const activeMon = getActiveMonster();
  const names = activeMon.stageNames || stageNames;
  const stageImg = (activeMon.id === 1) ? stageImages[newStage] : getMonsterStageImage(activeMon, newStage);
  monster.src = stageImg;
  monster.onerror = () => { monster.src = activeMon.img; };
  subtitle.textContent = (names[newStage] || activeMon.name) + ' has awakened!';
  statsList.innerHTML = '';
  overlay.classList.add('active');

  sfx.evolution();

  // Phase 1: fade to white (0-800ms)
  bg.style.transition = 'opacity 0.8s ease';
  bg.style.opacity = '1';

  // Phase 2: monster glow+grow (800-1800ms)
  setTimeout(() => {
    bg.style.opacity = '0.9';
    monster.style.transition = 'all 0.6s ease';
    monster.style.opacity = '1';
    monster.style.filter = 'brightness(3) drop-shadow(0 0 40px #fff)';
    monster.style.transform = 'scale(1.3)';
  }, 800);

  // Phase 3: flash 3 times (1800-2400ms)
  setTimeout(() => {
    let flashes = 0;
    const flashInterval = setInterval(() => {
      bg.style.opacity = bg.style.opacity === '1' ? '0.5' : '1';
      flashes++;
      if (flashes >= 6) clearInterval(flashInterval);
    }, 100);
  }, 1800);

  // Phase 4: EVOLUTION! text (2400ms)
  setTimeout(() => {
    bg.style.transition = 'opacity 0.3s ease';
    bg.style.opacity = '0.15';
    monster.style.filter = 'brightness(1) drop-shadow(0 0 20px rgba(241,196,15,0.5))';
    monster.style.transform = 'scale(1)';
    title.style.opacity = '1';
    title.style.animation = 'evoSlam 0.4s ease-out';
  }, 2400);

  // Phase 5: subtitle (2900ms)
  setTimeout(() => {
    subtitle.style.opacity = '1';
  }, 2900);

  // Phase 6: stats count up (3200ms+)
  const bonus = activeMon.evoBonus || {hp:5,atk:2,def:2,spd:2};
  const statNames = [`HP +${bonus.hp}`,`ATK +${bonus.atk}`,`DEF +${bonus.def}`,`SPD +${bonus.spd}`];
  statNames.forEach((s, i) => {
    setTimeout(() => {
      const line = document.createElement('div');
      line.className = 'evo-stat-line';
      line.textContent = s;
      line.style.opacity = '1';
      statsList.appendChild(line);
      sfx.correct();
    }, 3200 + i * 400);
  });

  // Phase 7: close (5200ms)
  setTimeout(() => {
    overlay.classList.remove('active');
    bg.style.opacity = '0';
    monster.style.opacity = '0';
    title.style.opacity = '0';
    title.style.animation = '';
    subtitle.style.opacity = '0';
    updateHomeUI();
  }, 5500);
}

// Legacy compat
function checkEvolution() { updateEvoGaugeUI(); }

// ===== EFFECTIVE STATS (base + equipment) =====
function getEffectiveAtk() {
  let atk = gameState.atk;
  gameState.ownedEquip.forEach(id => {
    const item = shopItems.find(i => i.id === id);
    if (item && item.stat === 'atk') atk += item.value;
  });
  return atk;
}

function getEffectiveDef() {
  let def = gameState.def;
  gameState.ownedEquip.forEach(id => {
    const item = shopItems.find(i => i.id === id);
    if (item && item.stat === 'def') def += item.value;
  });
  return def;
}

// ===== CRITICAL HIT (15% chance, 1.5x damage) =====
function applyCrit(dmg) {
  if (Math.random() < 0.15) {
    return { dmg: Math.floor(dmg * 1.5), crit: true };
  }
  return { dmg: dmg, crit: false };
}

// ===== SCREEN MANAGEMENT =====
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function goHome() {
  updateHomeUI();
  showScreen('home-screen');
}

function updateHomeUI() {
  updateMonsterImages();
  const activeMon = getActiveMonster();
  document.getElementById('home-monster-name').textContent = gameState.monsterName + ' (' + activeMon.name + ')';
  document.getElementById('battle-player-name').textContent = gameState.monsterName;

  const maxStat = 100;
  const eAtk = getEffectiveAtk();
  const eDef = getEffectiveDef();
  document.getElementById('hp-val').textContent = gameState.hp;
  document.getElementById('hp-bar').style.width = Math.min(gameState.hp / maxStat * 100, 100) + '%';
  document.getElementById('atk-val').textContent = eAtk;
  document.getElementById('atk-bar').style.width = Math.min(eAtk / maxStat * 100, 100) + '%';
  document.getElementById('def-val').textContent = eDef;
  document.getElementById('def-bar').style.width = Math.min(eDef / maxStat * 100, 100) + '%';
  const spd = gameState.spd || 1;
  document.getElementById('spd-val').textContent = spd;
  document.getElementById('spd-bar').style.width = Math.min(spd / maxStat * 100, 100) + '%';

  document.getElementById('prog-vocab').textContent = gameState.vocabCorrect + ' correct';
  document.getElementById('prog-grammar').textContent = gameState.grammarCorrect + ' correct';
  document.getElementById('prog-reading').textContent = gameState.readingCorrect + ' correct';
  document.getElementById('prog-listening').textContent = (gameState.listeningCorrect || 0) + ' correct';
  document.getElementById('gold-val').textContent = gameState.gold;

  // Level badge + EXP bar
  const level = getPlayerLevel();
  document.getElementById('home-level-badge').textContent = 'Lv.' + level;
  const totalCorrect = gameState.vocabCorrect + gameState.grammarCorrect + gameState.readingCorrect + (gameState.listeningCorrect || 0);
  const currentLevelStart = (level - 1) * 5;
  const expInLevel = totalCorrect - currentLevelStart;
  const expPct = Math.min((expInLevel / 5) * 100, 100);
  document.getElementById('exp-bar').style.width = expPct + '%';
  document.getElementById('exp-text').textContent = Math.floor(expPct) + '%';

  updateEvoGaugeUI();
  updateMistakeBadges();
}

// ===== START GAME =====
function startGame() {
  const nameInput = document.getElementById('monster-name-input').value.trim();
  if (!nameInput) {
    document.getElementById('monster-name-input').style.borderColor = '#e74c3c';
    return;
  }
  gameState.monsterName = nameInput;
  saveGame();
  goHome();
}

// ===== INIT =====
function init() {
  if (loadGame() && gameState.monsterName) {
    initMonsterProgress(gameState.activeMonster || 1);
    goHome();
  } else {
    showScreen('name-screen');
  }
}

// ===== STUDY SYSTEM =====
let currentCategory = 'vocabulary';
let currentQuestion = null;
let studyAnswered = false;

function goStudy() {
  studyAnswered = false;
  currentQuestion = null;
  document.getElementById('study-feedback').innerHTML = '';
  document.getElementById('study-next-btn').style.display = 'none';
  document.getElementById('study-explanation').style.display = 'none';
  document.getElementById('study-choices').innerHTML = '';
  document.getElementById('study-question').textContent = 'Select a category to start!';
  updateMistakeBadges();
  selectCategory('vocabulary');
  showScreen('study-screen');
  nextStudyQuestion();
}

function selectCategory(cat) {
  currentCategory = cat;
  document.querySelectorAll('.category-select .btn').forEach(b => b.classList.remove('selected'));
  document.getElementById('cat-' + cat).classList.add('selected');
  studyAnswered = false;
  nextStudyQuestion();
}

function nextStudyQuestion() {
  studyAnswered = false;
  document.getElementById('study-feedback').innerHTML = '';
  document.getElementById('study-next-btn').style.display = 'none';
  document.getElementById('study-explanation').style.display = 'none';
  clearTimeout(explanationTimer);

  const pool = questions[currentCategory];
  const idx = Math.floor(Math.random() * pool.length);
  currentQuestion = pool[idx];

  const questionBox = document.getElementById('study-question');

  if (currentCategory === 'listening') {
    if (!window.speechSynthesis) {
      questionBox.innerHTML = '<div class="listen-unsupported">Your browser doesn\'t support audio. Try Chrome or Safari.</div>';
      document.getElementById('study-choices').innerHTML = '';
      return;
    }
    questionBox.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;gap:8px;">
      <div style="font-size:13px;">${currentQuestion.q}</div>
      <button class="listen-btn" id="listen-play-btn" onclick="playListeningSpeech()">\uD83D\uDD0A</button>
      <div style="font-size:10px;color:#888;">Tap to play / replay</div>
    </div>`;
    setTimeout(() => playListeningSpeech(), 400);
  } else {
    questionBox.textContent = currentQuestion.q;
  }

  const choicesEl = document.getElementById('study-choices');
  choicesEl.innerHTML = '';
  currentQuestion.choices.forEach((c, i) => {
    const btn = document.createElement('button');
    btn.className = 'choice-btn';
    btn.textContent = String.fromCharCode(65 + i) + '. ' + c;
    btn.onclick = () => answerStudy(i, btn);
    choicesEl.appendChild(btn);
  });
}

function playListeningSpeech() {
  if (!currentQuestion || !currentQuestion.speech || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(currentQuestion.speech);
  utter.lang = 'en-US';
  utter.rate = 0.85;
  const btn = document.getElementById('listen-play-btn');
  if (btn) {
    btn.classList.add('playing');
    utter.onend = () => btn.classList.remove('playing');
    utter.onerror = () => btn.classList.remove('playing');
  }
  window.speechSynthesis.speak(utter);
}

function answerStudy(idx, btnEl) {
  if (studyAnswered) return;
  studyAnswered = true;

  const correct = idx === currentQuestion.answer;
  const correctAnswer = currentQuestion.choices[currentQuestion.answer];
  const explanation = currentQuestion.expl || '';
  const allBtns = document.querySelectorAll('#study-choices .choice-btn');
  allBtns.forEach((b, i) => {
    b.classList.add('disabled');
    if (i === currentQuestion.answer) b.classList.add('correct');
  });
  if (!correct) btnEl.classList.add('wrong');

  const feedback = document.getElementById('study-feedback');

  if (correct) {
    let statMsg = '';
    if (currentCategory === 'vocabulary') {
      gameState.hp += 2;
      gameState.vocabCorrect++;
      statMsg = 'HP +2 !!';
      // Mark vocabulary as learned
      const vocabWord = extractVocabWord(currentQuestion.q) || extractVocabFromAnswer(currentQuestion.q, correctAnswer);
      if (vocabWord) markVocabLearned(vocabWord, explanation);
    } else if (currentCategory === 'grammar') {
      gameState.grammarCorrect++;
      gameState.grammarStreak++;
      if (gameState.grammarStreak >= 3) {
        gameState.atk += 1;
        gameState.grammarStreak = 0;
        statMsg = 'ATK +1 !! (3 correct in a row)';
      } else {
        statMsg = `${3 - gameState.grammarStreak} more for ATK up`;
      }
    } else if (currentCategory === 'reading') {
      gameState.readingCorrect++;
      gameState.readingStreak++;
      if (gameState.readingStreak >= 2) {
        gameState.def += 1;
        gameState.readingStreak = 0;
        statMsg = 'DEF +1 !! (2 correct in a row)';
      } else {
        statMsg = `${2 - gameState.readingStreak} more for DEF up`;
      }
    } else if (currentCategory === 'listening') {
      gameState.listeningCorrect = (gameState.listeningCorrect || 0) + 1;
      gameState.spd = (gameState.spd || 1) + 1;
      statMsg = 'SPD +1 !!';
    }
    feedback.innerHTML = `<span class="correct-text">Correct!</span><span class="stat-up-anim">${statMsg}</span>`;
    sfx.correct();
    addEvoGauge(3);
    saveGame();
    checkEvolution();
  } else {
    if (currentCategory === 'grammar') gameState.grammarStreak = 0;
    if (currentCategory === 'reading') gameState.readingStreak = 0;
    feedback.innerHTML = `<span class="wrong-text">Wrong... The answer was ${String.fromCharCode(65 + currentQuestion.answer)}. ${correctAnswer}</span>`;
    sfx.wrong();
    // Track mistake
    addMistake(currentQuestion.q, correctAnswer, explanation, currentCategory);
    updateMistakeBadges();
    saveGame();
  }

  // Show explanation overlay
  showExplanation('study-explanation', correct, correctAnswer, explanation, () => {
    document.getElementById('study-next-btn').style.display = 'block';
  });
}

// ===== SHOP SYSTEM =====
function goShop() {
  document.getElementById('shop-gold').textContent = 'Gold: ' + gameState.gold;
  renderShop();
  showScreen('shop-screen');
}

function renderShop() {
  const list = document.getElementById('shop-list');
  list.innerHTML = '';
  shopItems.forEach(item => {
    const div = document.createElement('div');
    div.className = 'shop-item';

    const isEquip = item.type === 'equip';
    const owned = isEquip && gameState.ownedEquip.includes(item.id);
    const potionFull = !isEquip && gameState.potions >= 5;
    const canAfford = gameState.gold >= item.cost;

    let btnText, btnClass;
    if (owned) {
      btnText = 'Owned';
      btnClass = 'btn btn-small owned';
    } else if (!isEquip && potionFull) {
      btnText = 'Max (5)';
      btnClass = 'btn btn-small owned';
    } else {
      btnText = item.cost + 'G';
      btnClass = canAfford ? 'btn btn-small btn-primary' : 'btn btn-small';
    }

    const stockText = !isEquip ? ` [${gameState.potions}/5]` : '';

    div.innerHTML = `
      <span class="shop-item-icon">${item.icon}</span>
      <div class="shop-item-info">
        <div class="shop-item-name">${item.name}${stockText}</div>
        <div class="shop-item-effect">${item.effect}</div>
      </div>
      <button class="${btnClass}" ${(owned || (!isEquip && potionFull) || !canAfford) ? 'disabled' : ''} data-id="${item.id}">${btnText}</button>
    `;

    const btn = div.querySelector('button');
    if (!owned && !(!isEquip && potionFull) && canAfford) {
      btn.onclick = () => buyItem(item.id);
    }

    list.appendChild(div);
  });
}

function buyItem(itemId) {
  const item = shopItems.find(i => i.id === itemId);
  if (!item || gameState.gold < item.cost) return;

  if (item.type === 'equip') {
    if (gameState.ownedEquip.includes(itemId)) return;
    gameState.gold -= item.cost;
    gameState.ownedEquip.push(itemId);
  } else {
    if (gameState.potions >= 5) return;
    gameState.gold -= item.cost;
    gameState.potions++;
  }

  saveGame();
  sfx.shopBuy();
  document.getElementById('shop-gold').textContent = 'Gold: ' + gameState.gold;
  renderShop();
}


let storyState = {
  activeChapter: -1,
  phase: 'idle',     // idle | intro | mob | boss | victory
  mobIndex: 0,
  mobCount: 0
};

function goStory() {
  document.getElementById('story-player-level').textContent = getPlayerLevel();
  document.getElementById('story-intro').classList.remove('active');
  document.getElementById('story-victory').classList.remove('active');
  renderStoryMap();
  showScreen('story-screen');
}

function renderStoryMap() {
  const map = document.getElementById('story-map');
  map.innerHTML = '';
  const level = getPlayerLevel();
  storyChapters.forEach((ch, i) => {
    const cleared = gameState.storyCleared.includes(i);
    const unlocked = level >= ch.reqLevel;
    const isCurrent = unlocked && !cleared;
    const div = document.createElement('div');
    div.className = 'story-chapter' + (cleared ? ' cleared' : (!unlocked ? ' locked' : '')) + (isCurrent ? ' current' : '');

    const statusIcon = cleared ? '\u2B50' : (!unlocked ? '\uD83D\uDD12' : '\u25B6\uFE0F');
    const badgeText = cleared && gameState.storyBadges.includes(ch.badge) ? `<div class="chapter-badge">\uD83C\uDFC5 ${ch.badge}</div>` : '';
    const reqText = !unlocked ? `Requires Lv.${ch.reqLevel}` : (cleared ? 'Cleared!' : `Boss: ${ch.boss.name}`);

    div.innerHTML = `
      <span class="chapter-icon">${ch.icon}</span>
      <div class="chapter-info">
        <div class="chapter-title">${ch.title}</div>
        <div class="chapter-sub">${reqText}</div>
        ${badgeText}
      </div>
      <span class="chapter-status">${statusIcon}</span>
    `;

    if (unlocked && !cleared) {
      div.onclick = () => openStoryChapter(i);
    }
    map.appendChild(div);
  });
}

function openStoryChapter(idx) {
  const ch = storyChapters[idx];
  storyState.activeChapter = idx;
  storyState.phase = 'intro';
  storyState.mobIndex = 0;
  storyState.mobCount = ch.mobs.length;

  document.getElementById('story-intro-title').textContent = ch.title;
  document.getElementById('story-intro-boss-emoji').textContent = ch.boss.emoji;
  // Highlight learned vocabulary words in story intro
  document.getElementById('story-intro-text').innerHTML = highlightLearnedWords(ch.intro);
  document.getElementById('story-intro').classList.add('active');
}

function startStoryChapter() {
  document.getElementById('story-intro').classList.remove('active');
  storyState.phase = 'mob';
  storyState.mobIndex = 0;
  nextStoryBattle();
}

function nextStoryBattle() {
  const ch = storyChapters[storyState.activeChapter];
  if (storyState.phase === 'mob' && storyState.mobIndex < storyState.mobCount) {
    const mob = ch.mobs[storyState.mobIndex];
    startBattle(mob, false, ch.title);
  } else {
    // Boss fight
    storyState.phase = 'boss';
    const boss = ch.boss;
    const bossEnemy = {
      name: boss.name,
      emoji: boss.emoji,
      hp: boss.hp,
      atk: Math.floor(boss.atk * 1.5),
      def: boss.def,
      gold: boss.gold
    };
    startBattle(bossEnemy, true, ch.title + ' - BOSS');
  }
}

function onStoryBattleEnd(won) {
  if (!won) {
    storyState.phase = 'idle';
    storyState.activeChapter = -1;
    goStory();
    return;
  }

  const ch = storyChapters[storyState.activeChapter];

  if (storyState.phase === 'mob') {
    storyState.mobIndex++;
    if (storyState.mobIndex < storyState.mobCount) {
      nextStoryBattle();
    } else {
      storyState.phase = 'boss';
      nextStoryBattle();
    }
  } else if (storyState.phase === 'boss') {
    // Chapter cleared!
    if (!gameState.storyCleared.includes(storyState.activeChapter)) {
      gameState.storyCleared.push(storyState.activeChapter);
    }
    if (!gameState.storyBadges.includes(ch.badge)) {
      gameState.storyBadges.push(ch.badge);
    }
    gameState.gold += ch.goldReward;
    gameState.hp += ch.bonusHp;
    saveGame();

    storyState.phase = 'victory';
    showScreen('story-screen');

    document.getElementById('story-victory-title').textContent = 'Chapter Complete!';
    document.getElementById('story-victory-msg').textContent = `You defeated ${ch.boss.name} and saved the realm!`;
    document.getElementById('story-victory-badge').textContent = '\uD83C\uDFC5 ' + ch.badge;
    document.getElementById('story-victory-reward').textContent = `+${ch.goldReward} Gold, +${ch.bonusHp} HP`;
    document.getElementById('story-victory').classList.add('active');
  }
}

function closeStoryVictory() {
  document.getElementById('story-victory').classList.remove('active');
  storyState.phase = 'idle';
  storyState.activeChapter = -1;
  renderStoryMap();
  document.getElementById('story-player-level').textContent = getPlayerLevel();
}

// ===== BATTLE SYSTEM =====
// Unified battle launcher: supports both free battle and story battle
let battleMode = 'free'; // 'free' | 'story'
let isBossBattle = false;

function startBattle(enemyData, boss, headerLabel) {
  battleMode = 'story';
  isBossBattle = !!boss;
  const playerLevel = getPlayerLevel();

  const enemy = { ...enemyData };
  // Boss HP is already 3x in data; scale mobs slightly with level
  if (!boss) {
    enemy.hp += Math.floor(playerLevel);
    enemy.atk += Math.floor(playerLevel * 0.5);
  }

  battleState = {
    enemy: enemy,
    enemyMaxHp: enemy.hp,
    enemyHp: enemy.hp,
    playerHp: gameState.hp,
    playerMaxHp: gameState.hp,
    defending: false,
    turn: 0,
    finished: false,
    potionsUsed: 0
  };
  battleState.teamHp = {};

  const label = boss ? enemy.name + ' [BOSS]' : enemy.name;
  document.getElementById('enemy-name').textContent = label;
  document.getElementById('enemy-sprite').textContent = enemy.emoji;
  document.getElementById('enemy-sprite').style.background = '';
  document.getElementById('battle-header-text').textContent = headerLabel || 'Battle';
  updateBattleHP();
  updatePotionBtn();
  updateMonsterImages();

  const introMsg = boss
    ? `<b>${enemy.name}</b> blocks your path! <span class="crit-text">BOSS BATTLE!</span>`
    : `A wild <b>${enemy.name}</b> appeared!`;
  document.getElementById('battle-log').innerHTML = `<p>${introMsg}</p>`;
  document.getElementById('battle-result').classList.remove('active','confetti-active');
  document.querySelector('.battle-field').classList.remove('defeat-dim');
  document.getElementById('battle-commands').style.display = 'grid';
  document.getElementById('battle-question-area').classList.remove('active');

  battleSkillsUsed = {};
  renderBattleSkills();
  if (boss) sfx.bossAppear(); else sfx.battleStart();
  showScreen('battle-screen');
}

function goBattle() {
  battleMode = 'free';
  isBossBattle = false;
  const playerLevel = getPlayerLevel();
  const playerPower = gameState.hp + getEffectiveAtk() + getEffectiveDef();

  // Select enemy pool based on player level (minLv gating)
  const pool = enemies.filter(e => playerLevel >= (e.minLv || 1));
  const baseEnemy = pool[Math.floor(Math.random() * pool.length)];

  // Scale enemy stats gently with player level
  const scaledHp = baseEnemy.hp + Math.floor(playerLevel * 1.0);
  const scaledAtk = Math.floor(baseEnemy.atk + playerLevel * 0.5);
  const scaledDef = baseEnemy.def + Math.floor(playerLevel * 0.2);
  const scaledGold = baseEnemy.gold + Math.floor(playerLevel * 1.5);

  const enemy = {
    name: baseEnemy.name,
    emoji: baseEnemy.emoji,
    hp: scaledHp,
    atk: scaledAtk,
    def: scaledDef,
    gold: scaledGold
  };

  battleState = {
    enemy: enemy,
    enemyMaxHp: enemy.hp,
    enemyHp: enemy.hp,
    playerHp: gameState.hp,
    playerMaxHp: gameState.hp,
    defending: false,
    turn: 0,
    finished: false,
    potionsUsed: 0
  };
  battleState.teamHp = {};

  document.getElementById('enemy-name').textContent = enemy.name + ' Lv.' + playerLevel;
  document.getElementById('enemy-sprite').textContent = enemy.emoji;
  document.getElementById('enemy-sprite').style.background = '';
  updateBattleHP();
  updatePotionBtn();

  document.getElementById('battle-log').innerHTML = `<p>A wild <b>${enemy.name}</b> appeared! (Lv.${playerLevel})</p>`;
  document.getElementById('battle-result').classList.remove('active','confetti-active');
  document.querySelector('.battle-field').classList.remove('defeat-dim');
  document.getElementById('battle-commands').style.display = 'grid';
  document.getElementById('battle-question-area').classList.remove('active');

  battleSkillsUsed = {};
  renderBattleSkills();
  sfx.battleStart();
  showScreen('battle-screen');
}

function updatePotionBtn() {
  const remaining = gameState.potions - (battleState ? battleState.potionsUsed : 0);
  document.getElementById('potion-count-btn').textContent = remaining > 0 ? 'x' + remaining : '';
}

function updateBattleHP() {
  const ePct = Math.max(0, battleState.enemyHp / battleState.enemyMaxHp * 100);
  const pPct = Math.max(0, battleState.playerHp / battleState.playerMaxHp * 100);
  document.getElementById('enemy-hp-bar').style.width = ePct + '%';
  document.getElementById('enemy-hp-text').textContent = `HP: ${Math.max(0,battleState.enemyHp)}/${battleState.enemyMaxHp}`;
  document.getElementById('player-hp-bar').style.width = pPct + '%';
  document.getElementById('player-hp-text').textContent = `HP: ${Math.max(0,battleState.playerHp)}/${battleState.playerMaxHp}`;

  document.getElementById('enemy-hp-bar').style.background = ePct < 25 ? '#e74c3c' : '#2ecc71';
  document.getElementById('player-hp-bar').style.background = pPct < 25 ? '#e74c3c' : '#2ecc71';
}

function addBattleLog(msg) {
  const log = document.getElementById('battle-log');
  log.innerHTML += `<p>${msg}</p>`;
  log.scrollTop = log.scrollHeight;
}

function battleAction(action) {
  if (battleState.finished) return;

  if (action === 'switch') {
    showBattleSwitchMenu();
    return;
  }

  if (action === 'run') {
    if (battleMode === 'story') {
      addBattleLog('You cannot run from a story battle!');
      return;
    }
    addBattleLog('You ran away!');
    endBattle(false, true);
    return;
  }

  if (action === 'item') {
    const remaining = gameState.potions - battleState.potionsUsed;
    if (remaining <= 0) {
      addBattleLog('No potions left!');
      return;
    }
    battleState.potionsUsed++;
    const healAmt = Math.min(20, battleState.playerMaxHp - battleState.playerHp);
    battleState.playerHp = Math.min(battleState.playerMaxHp, battleState.playerHp + 20);
    updateBattleHP();
    updatePotionBtn();
    addBattleLog(`Used HP Potion! Restored ${healAmt} HP!`);
    enemyTurn();
    return;
  }

}

function battleAnswer(idx, correctIdx, btnEl) {
  const correct = idx === correctIdx;
  const allBtns = document.querySelectorAll('#battle-choices .choice-btn');
  allBtns.forEach((b, i) => {
    b.classList.add('disabled');
    if (i === correctIdx) b.classList.add('correct');
  });
  if (!correct) btnEl.classList.add('wrong');

  // Track mistakes and vocab in battle
  if (currentBattleQuestion) {
    const correctAnswer = currentBattleQuestion.choices[currentBattleQuestion.answer];
    const explanation = currentBattleQuestion.expl || '';
    if (!correct) {
      addMistake(currentBattleQuestion.q, correctAnswer, explanation, '');
      updateMistakeBadges();
    } else if (currentBattleQuestion.expl) {
      // Mark vocab learned if applicable
      const vocabWord = extractVocabWord(currentBattleQuestion.q) || extractVocabFromAnswer(currentBattleQuestion.q, correctAnswer);
      if (vocabWord) markVocabLearned(vocabWord, explanation);
    }
    // Show explanation briefly in battle
    showExplanation('battle-explanation', correct, correctAnswer, explanation, null);
  }

  const sk = activeSkillIdx >= 0 ? battleSkills[activeSkillIdx] : null;
  const skillMult = sk ? sk.mult : 1.0;
  const skillFlash = sk ? sk.flash : '';

  setTimeout(() => {
    document.getElementById('battle-explanation').style.display = 'none';
    clearTimeout(explanationTimer);
    document.getElementById('battle-question-area').classList.remove('active');
    document.getElementById('battle-commands').style.display = 'grid';
    renderBattleSkills();

    const effAtk = getEffectiveAtk();
    const effDef = getEffectiveDef();
    const bField = document.querySelector('.battle-field');

    if (!correct) {
      sfx.wrong();
      addBattleLog(sk ? `${sk.icon} ${sk.name} fizzled! No damage!` : 'Wrong! No damage!');
      // Enemy counterattack
      setTimeout(() => {
        if (battleState.finished) return;
        addBattleLog(`${battleState.enemy.name} counterattacks!`);
        doEnemyAttack(effDef, false);
        if (battleState.playerHp <= 0) {
          if (checkTeamWipe()) {
            setTimeout(() => endBattle(false, false), 600);
          } else {
            addBattleLog(`${getActiveMonster().name} fainted!`);
            setTimeout(() => showBattleSwitchMenu(), 600);
          }
          return;
        }
        setTimeout(() => enemyTurn(), 600);
      }, 600);
    } else {
      sfx.correct();
      let baseDmg = Math.max(1, effAtk - battleState.enemy.def + Math.floor(Math.random() * 4));
      baseDmg = Math.max(1, Math.floor(baseDmg * skillMult));
      const specBonus = getSpecialtyBonus(sk ? sk.cat : 'vocabulary');
      if (specBonus > 0) baseDmg = Math.floor(baseDmg * (1 + specBonus));

      const playerHit = applyCrit(baseDmg);
      if (playerHit.crit) addBattleLog('<span class="crit-text">CRITICAL HIT!</span>');

      addBattleLog(sk ? `<span class="crit-text">${sk.icon} ${sk.name}!</span> ${playerHit.dmg} damage!` : `${playerHit.dmg} damage!`);
      sfx.playerAttack();

      // Skill flash animation
      if (skillFlash) { bField.classList.add(skillFlash); setTimeout(() => bField.classList.remove(skillFlash), 500); }

      const pSprite = document.getElementById('player-battle-sprite');
      const eSprite = document.getElementById('enemy-sprite');
      pSprite.classList.add('player-attack-anim');
      setTimeout(() => { pSprite.classList.remove('player-attack-anim'); eSprite.classList.add('enemy-hit-flash'); }, 200);
      setTimeout(() => eSprite.classList.remove('enemy-hit-flash'), 600);
      if (playerHit.crit) { eSprite.classList.add('crit-explosion'); setTimeout(() => eSprite.classList.remove('crit-explosion'), 700); }

      battleState.enemyHp -= playerHit.dmg;
      updateBattleHP();

      if (battleState.enemyHp <= 0) {
        setTimeout(() => endBattle(true, false), 600);
        return;
      }
      setTimeout(() => enemyTurn(), 800);
    }
    activeSkillIdx = -1;
  }, 2500);
}

function doEnemyAttack(playerDef, applyGuard) {
  let dmg = Math.max(1, battleState.enemy.atk - Math.floor(playerDef * 0.7) + Math.floor(Math.random() * 4));
  if (applyGuard && battleState.defending) {
    dmg = Math.max(1, Math.floor(dmg / 2));
    addBattleLog('Guard is up! Damage reduced!');
  }

  // Critical hit check for enemy
  const enemyHit = applyCrit(dmg);
  if (enemyHit.crit) {
    addBattleLog('<span class="crit-text">Enemy CRITICAL HIT!</span>');
  }

  addBattleLog(`${battleState.enemy.name} attacks! ${gameState.monsterName} takes ${enemyHit.dmg} damage!`);
  sfx.enemyAttack();
  // Enemy attack animations
  const eSprite2 = document.getElementById('enemy-sprite');
  const pSprite2 = document.getElementById('player-battle-sprite');
  const bField = document.querySelector('.battle-field');
  eSprite2.classList.add('enemy-attack-anim');
  setTimeout(() => { eSprite2.classList.remove('enemy-attack-anim'); pSprite2.classList.add('player-hit-flash'); bField.classList.add('screen-red-flash'); }, 200);
  setTimeout(() => { pSprite2.classList.remove('player-hit-flash'); bField.classList.remove('screen-red-flash'); }, 600);
  battleState.playerHp -= enemyHit.dmg;
  updateBattleHP();
}

function enemyTurn() {
  if (battleState.finished) return;

  // SPD dodge chance: spd / (spd + 50) — caps around 30% at SPD 20
  const spd = gameState.spd || 1;
  const dodgeChance = spd / (spd + 50);
  if (Math.random() < dodgeChance) {
    addBattleLog(`${gameState.monsterName} dodged the attack! (SPD)`);
    battleState.defending = false;
    return;
  }

  const effDef = getEffectiveDef();
  doEnemyAttack(effDef, true);
  battleState.defending = false;

  if (battleState.playerHp <= 0) {
    if (checkTeamWipe()) {
      setTimeout(() => endBattle(false, false), 600);
    } else {
      addBattleLog(`${getActiveMonster().name} fainted!`);
      setTimeout(() => showBattleSwitchMenu(), 600);
    }
  }
}

function endBattle(won, ran) {
  battleState.finished = true;
  const result = document.getElementById('battle-result');
  result.classList.add('active');

  // Deduct potions
  gameState.potions -= battleState.potionsUsed;

  if (ran) {
    document.getElementById('battle-result-title').textContent = 'Escaped!';
    document.getElementById('battle-result-title').style.color = '#aaa';
    document.getElementById('battle-result-msg').textContent = 'Battle ended with no rewards.';
    saveGame();
  } else if (won) {
    const gold = battleState.enemy.gold;
    gameState.gold += gold;
    saveGame();
    sfx.victory();
    addEvoGauge(isBossBattle ? 50 : 20);
    submitScore();
    document.getElementById('battle-result').classList.add('confetti-active');
    document.getElementById('battle-result-title').textContent = 'Victory!';
    document.getElementById('battle-result-title').style.color = '#f1c40f';
    document.getElementById('battle-result-msg').textContent = `Defeated ${battleState.enemy.name}! Earned ${gold} Gold!`;
  } else {
    saveGame();
    sfx.defeat();
    document.querySelector('.battle-field').classList.add('defeat-dim');
    document.getElementById('battle-result-title').textContent = 'Defeat...';
    document.getElementById('battle-result-title').style.color = '#e74c3c';
    document.getElementById('battle-result-msg').textContent = `${gameState.monsterName} has been knocked out...`;
  }
}

function endBattleReturn() {
  if (battleMode === 'story') {
    const won = battleState.finished && battleState.enemyHp <= 0;
    onStoryBattleEnd(won);
  } else {
    goHome();
  }
}

// ===== SOUND ENGINE (Web Audio API) =====
let audioCtx = null;
let sfxMuted = localStorage.getItem('monsterRPG_mute') === '1';

function getAudioCtx() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function updateMuteBtn() {
  document.getElementById('mute-btn').textContent = sfxMuted ? '\uD83D\uDD07' : '\uD83D\uDD0A';
}

function toggleMute() {
  sfxMuted = !sfxMuted;
  localStorage.setItem('monsterRPG_mute', sfxMuted ? '1' : '0');
  updateMuteBtn();
}

function playTone(freq, duration, type, vol, delay) {
  const ctx = getAudioCtx();
  if (!ctx || sfxMuted) return;
  const t = ctx.currentTime + (delay || 0);
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type || 'sine';
  osc.frequency.setValueAtTime(freq, t);
  gain.gain.setValueAtTime(vol || 0.3, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + duration);
}

function playNoise(duration, vol, delay) {
  const ctx = getAudioCtx();
  if (!ctx || sfxMuted) return;
  const t = ctx.currentTime + (delay || 0);
  const bufferSize = ctx.sampleRate * duration;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.5;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol || 0.15, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
  src.connect(gain);
  gain.connect(ctx.destination);
  src.start(t);
}

const sfx = {
  correct() {
    playTone(880, 0.12, 'sine', 0.25);
    playTone(1320, 0.18, 'sine', 0.2, 0.08);
  },
  wrong() {
    playTone(180, 0.25, 'triangle', 0.3);
    playTone(140, 0.2, 'triangle', 0.2, 0.1);
  },
  levelUp() {
    playTone(523, 0.15, 'square', 0.15);
    playTone(659, 0.15, 'square', 0.15, 0.15);
    playTone(784, 0.3, 'square', 0.2, 0.3);
  },
  evolution() {
    playTone(440, 0.12, 'sine', 0.2);
    playTone(554, 0.12, 'sine', 0.2, 0.1);
    playTone(659, 0.12, 'sine', 0.2, 0.2);
    playTone(880, 0.12, 'sine', 0.25, 0.3);
    playTone(1108, 0.15, 'sine', 0.25, 0.4);
    playTone(1320, 0.4, 'sine', 0.3, 0.5);
    playTone(2640, 0.3, 'sine', 0.1, 0.6);
    playTone(3520, 0.2, 'sine', 0.08, 0.7);
  },
  battleStart() {
    playTone(120, 0.15, 'square', 0.3);
    playNoise(0.08, 0.2);
    playTone(100, 0.15, 'square', 0.25, 0.2);
    playNoise(0.08, 0.18, 0.2);
  },
  playerAttack() {
    playNoise(0.08, 0.15);
    playTone(600, 0.05, 'sawtooth', 0.12);
    playTone(300, 0.08, 'triangle', 0.2, 0.06);
    playNoise(0.06, 0.12, 0.06);
  },
  enemyAttack() {
    playTone(150, 0.15, 'triangle', 0.25);
    playTone(100, 0.1, 'triangle', 0.2, 0.08);
  },
  victory() {
    playTone(523, 0.12, 'square', 0.15);
    playTone(659, 0.12, 'square', 0.15, 0.12);
    playTone(784, 0.12, 'square', 0.15, 0.24);
    playTone(1047, 0.12, 'square', 0.18, 0.36);
    playTone(1047, 0.35, 'sine', 0.25, 0.48);
  },
  defeat() {
    playTone(440, 0.2, 'sine', 0.2);
    playTone(370, 0.2, 'sine', 0.18, 0.2);
    playTone(311, 0.2, 'sine', 0.15, 0.4);
    playTone(262, 0.5, 'sine', 0.12, 0.6);
  },
  bossAppear() {
    playTone(80, 0.5, 'sawtooth', 0.3);
    playTone(60, 0.6, 'sine', 0.2, 0.1);
    playNoise(0.3, 0.15, 0.05);
    playTone(90, 0.4, 'triangle', 0.15, 0.3);
  },
  shopBuy() {
    playTone(1200, 0.06, 'sine', 0.15);
    playTone(1500, 0.06, 'sine', 0.12, 0.06);
    playTone(1800, 0.06, 'sine', 0.1, 0.12);
    playTone(2200, 0.1, 'sine', 0.12, 0.18);
  }
};

// ===== 4-SKILL BATTLE SYSTEM =====
let battleSkillsUsed = {};
let activeSkillIdx = -1;

const battleSkills = [
  {name:'Quick Strike', icon:'\u2694\uFE0F', cls:'sk-quick', flash:'skill-flash-blue', cat:'vocabulary', mult:0.8, reqStage:0},
  {name:'Power Blast', icon:'\uD83D\uDCA5', cls:'sk-power', flash:'skill-flash-orange', cat:'grammar', mult:1.2, reqStage:1},
  {name:'Mind Crush', icon:'\uD83E\uDDE0', cls:'sk-mind', flash:'skill-flash-purple', cat:'reading', mult:1.6, reqStage:2},
  {name:'Ultimate', icon:'\uD83D\uDD25', cls:'sk-ultimate', flash:'skill-flash-gold', cat:'mixed', mult:2.2, reqStage:3}
];

function renderBattleSkills() {
  const stage = gameState.evoStage || 0;
  const mon = getActiveMonster();
  const maxStages = mon.maxStages || 4;
  // Map reqStage (0-3) to actual monster stages: skill unlocks at proportional stage
  // reqStage 0 = always unlocked, 1 = stage 1+, 2 = stage 2+, 3 = max stage
  // For 2-stage monster: skill 0 always, skill 1 at stage 1, skills 2-3 at stage 1 (max)
  // For 3-stage monster: skill 0 always, skill 1 at stage 1, skill 2 at stage 2, skill 3 at stage 2 (max)
  function isSkillUnlocked(reqStage) {
    if (reqStage === 0) return true;
    if (maxStages === 2) return stage >= 1;
    if (maxStages === 3) return stage >= Math.min(reqStage, 2);
    return stage >= reqStage; // 4-stage (Blue Slime)
  }

  const container = document.getElementById('battle-skills');
  container.innerHTML = '';
  container.classList.add('active');
  battleSkills.forEach((sk, i) => {
    const unlocked = isSkillUnlocked(sk.reqStage);
    const btn = document.createElement('button');
    btn.className = 'skill-btn ' + (unlocked ? sk.cls : 'sk-locked');
    btn.disabled = !unlocked;
    if (unlocked) {
      const specBonus = getSpecialtyBonus(sk.cat);
      const specLabel = specBonus > 0 ? ` <span class="spec-badge">+${Math.round(specBonus*100)}%</span>` : '';
      btn.innerHTML = `<span class="skill-name">${sk.icon} ${sk.name}${specLabel}</span><span class="skill-sub">${sk.mult}x dmg</span>`;
      btn.onclick = () => useSkill(i);
    } else {
      btn.innerHTML = `<span class="skill-name">\uD83D\uDD12 ${sk.name}</span><span class="skill-sub">Evolve</span>`;
    }
    container.appendChild(btn);
  });
}

let currentBattleQuestion = null;

function useSkill(idx) {
  if (battleState.finished) return;
  activeSkillIdx = idx;
  const sk = battleSkills[idx];

  document.getElementById('battle-commands').style.display = 'none';
  document.getElementById('battle-skills').classList.remove('active');
  const area = document.getElementById('battle-question-area');
  area.classList.add('active');

  // Pick question from skill's category
  let qSource, qCat;
  if (sk.cat === 'mixed') {
    // Hardest: use boss questions
    qSource = bossQuestions;
    const cats = Object.keys(qSource);
    qCat = cats[Math.floor(Math.random() * cats.length)];
  } else {
    qSource = isBossBattle ? bossQuestions : questions;
    qCat = sk.cat;
    if (!qSource[qCat]) qSource = questions;
  }
  const qPool = qSource[qCat];
  const q = qPool[Math.floor(Math.random() * qPool.length)];
  currentBattleQuestion = q;

  document.getElementById('battle-question').textContent = q.q;
  const choicesEl = document.getElementById('battle-choices');
  choicesEl.innerHTML = '';
  q.choices.forEach((c, i) => {
    const btn = document.createElement('button');
    btn.className = 'choice-btn';
    btn.textContent = String.fromCharCode(65 + i) + '. ' + c;
    btn.onclick = () => battleAnswer(i, q.answer, btn);
    choicesEl.appendChild(btn);
  });
}

const rarityWeights = {Normal:50,Rare:30,'Super Rare':15,Legend:5};

function getOwnedMonsters() {
  return gameState.ownedMonsters || [1];
}

function getActiveMonster() {
  const id = gameState.activeMonster || 1;
  return monsterRoster.find(m => m.id === id) || monsterRoster[0];
}

function getMonsterData(id) {
  return gameState.monsterProgress ? (gameState.monsterProgress[id] || null) : null;
}

function initMonsterProgress(id) {
  if (!gameState.monsterProgress) gameState.monsterProgress = {};
  if (!gameState.monsterProgress[id]) {
    gameState.monsterProgress[id] = { evoStage:0, evoGauge:0 };
  }
}

// Override getMonsterStage to use active monster's progress
const origGetMonsterStage = getMonsterStage;
getMonsterStage = function(level) {
  const id = gameState.activeMonster || 1;
  const prog = getMonsterData(id);
  return prog ? (prog.evoStage || 0) : (gameState.evoStage || 0);
};

function goGacha() {
  document.getElementById('gacha-gold').textContent = gameState.gold;
  const owned = getOwnedMonsters();
  document.getElementById('gacha-owned-count').textContent = 'Collected: ' + owned.length + '/10';
  const allOwned = owned.length >= 10;
  document.getElementById('gacha-1-btn').disabled = allOwned || gameState.gold < 100;
  document.getElementById('gacha-10-btn').disabled = allOwned || gameState.gold < 900;
  document.getElementById('gacha-overlay').classList.remove('active');
  showScreen('gacha-screen');
}

function doGacha(count) {
  const cost = count === 10 ? 900 : 100;
  if (gameState.gold < cost) return;
  gameState.gold -= cost;
  saveGame();

  const pulled = [];
  for (let i = 0; i < count; i++) {
    const mon = rollGacha();
    if (mon) pulled.push(mon);
  }

  if (pulled.length === 0) {
    // All owned already — refund
    gameState.gold += cost;
    saveGame();
    goGacha();
    return;
  }

  // Show first pull (for multi-pull, show one by one would be complex; show last)
  showGachaReveal(pulled[pulled.length - 1], pulled.length);
}

function rollGacha() {
  const owned = getOwnedMonsters();
  if (owned.length >= 10) return null;

  // Weighted random rarity
  const roll = Math.random() * 100;
  let rarity;
  if (roll < 5) rarity = 'Legend';
  else if (roll < 20) rarity = 'Super Rare';
  else if (roll < 50) rarity = 'Rare';
  else rarity = 'Normal';

  // Filter available monsters of this rarity
  let pool = monsterRoster.filter(m => m.rarity === rarity && !owned.includes(m.id));
  // Fallback: try any unowned
  if (pool.length === 0) pool = monsterRoster.filter(m => !owned.includes(m.id));
  if (pool.length === 0) return null;

  const mon = pool[Math.floor(Math.random() * pool.length)];
  if (!gameState.ownedMonsters) gameState.ownedMonsters = [1];
  gameState.ownedMonsters.push(mon.id);
  initMonsterProgress(mon.id);
  saveGame();
  return mon;
}

function showGachaReveal(mon, totalCount) {
  const overlay = document.getElementById('gacha-overlay');
  const egg = document.getElementById('gacha-egg');
  const reveal = document.getElementById('gacha-reveal');

  overlay.classList.add('active');
  egg.style.display = 'block';
  egg.classList.remove('cracking');
  reveal.classList.remove('active');

  sfx.battleStart();

  setTimeout(() => {
    egg.classList.add('cracking');
    sfx.evolution();
  }, 1500);

  setTimeout(() => {
    egg.style.display = 'none';
    reveal.classList.add('active');

    const gachaCircle = document.getElementById('gacha-circle');
    gachaCircle.style.background = 'transparent';
    gachaCircle.innerHTML = `<img src="${mon.img}" alt="${mon.name}" style="width:80px;height:80px;object-fit:contain;filter:drop-shadow(0 0 12px ${mon.color});">`;

    const rarityMap = {Normal:'rarity-normal',Rare:'rarity-rare','Super Rare':'rarity-sr',Legend:'rarity-legend'};
    const rarityEl = document.getElementById('gacha-rarity');
    rarityEl.className = 'gacha-rarity ' + (rarityMap[mon.rarity] || 'rarity-normal');
    rarityEl.textContent = mon.rarity;

    document.getElementById('gacha-mon-name').textContent = mon.name;
    document.getElementById('gacha-mon-element').textContent = mon.element + ' \u2022 ' + mon.trait;
    document.getElementById('gacha-mon-stats').textContent = `HP:${mon.hp} ATK:${mon.atk} DEF:${mon.def}`;
    if (totalCount > 1) {
      document.getElementById('gacha-mon-stats').textContent += ` (+${totalCount - 1} more!)`;
    }
  }, 2200);
}

function closeGachaReveal() {
  document.getElementById('gacha-overlay').classList.remove('active');
  goGacha();
}

// ===== COLLECTION =====
function goCollection() {
  renderCollection();
  showScreen('collection-screen');
}

function renderCollection() {
  const grid = document.getElementById('collection-grid');
  grid.innerHTML = '';
  const owned = getOwnedMonsters();
  const activeId = gameState.activeMonster || 1;

  monsterRoster.forEach(mon => {
    const isOwned = owned.includes(mon.id);
    const isActive = mon.id === activeId;
    const card = document.createElement('div');
    card.className = 'collection-card' + (isActive ? ' active-mon' : '') + (!isOwned ? ' unowned' : '');

    const starCount = mon.rarity === 'Legend' ? 4 : mon.rarity === 'Super Rare' ? 3 : mon.rarity === 'Rare' ? 2 : 1;
    const stars = '\u2B50'.repeat(starCount);

    const imgFilter = !isOwned ? 'filter:grayscale(100%) brightness(30%);' : '';
    card.innerHTML = `
      <div class="card-circle" style="background:${isOwned ? 'transparent' : mon.color};">
        <img src="${mon.img}" alt="${mon.name}" style="width:60px;height:60px;object-fit:contain;${imgFilter}">
      </div>
      <div class="card-name">${isOwned ? mon.name : '???'}</div>
      <div class="card-rarity-stars">${isOwned ? stars : ''}</div>
      <div class="card-element">${isOwned ? mon.element : ''}</div>
      ${isActive ? '<div style="font-size:8px;color:#f1c40f;">ACTIVE</div>' : ''}
    `;

    if (isOwned && !isActive) {
      card.onclick = () => setActiveMonster(mon.id);
    }
    grid.appendChild(card);
  });
}

function setActiveMonster(id) {
  // Save current monster's evo progress
  saveCurrentMonsterProgress();
  gameState.activeMonster = id;
  // Load this monster's progress
  loadMonsterProgress(id);
  saveGame();
  renderCollection();
}

function saveCurrentMonsterProgress() {
  const id = gameState.activeMonster || 1;
  if (!gameState.monsterProgress) gameState.monsterProgress = {};
  gameState.monsterProgress[id] = {
    evoStage: gameState.evoStage || 0,
    evoGauge: gameState.evoGauge || 0
  };
}

function loadMonsterProgress(id) {
  initMonsterProgress(id);
  const prog = gameState.monsterProgress[id];
  gameState.evoStage = prog.evoStage || 0;
  gameState.evoGauge = prog.evoGauge || 0;
}

// Apply monster trait bonuses to effective stats
const origGetEffectiveAtk = getEffectiveAtk;
getEffectiveAtk = function() {
  let atk = origGetEffectiveAtk();
  const mon = getActiveMonster();
  if (mon.trait === 'ATK +20%') atk = Math.floor(atk * 1.2);
  if (mon.trait === 'ATK+DEF') atk = Math.floor(atk * 1.15);
  if (mon.trait === 'All +15%' || mon.trait === 'All highest') atk = Math.floor(atk * 1.15);
  return atk;
};

const origGetEffectiveDef = getEffectiveDef;
getEffectiveDef = function() {
  let def = origGetEffectiveDef();
  const mon = getActiveMonster();
  if (mon.trait === 'DEF +30%') def = Math.floor(def * 1.3);
  if (mon.trait === 'ATK+DEF') def = Math.floor(def * 1.15);
  if (mon.trait === 'All +15%' || mon.trait === 'All highest') def = Math.floor(def * 1.15);
  return def;
};

// ===== EXPLANATION SYSTEM =====
let explanationTimer = null;

function showExplanation(containerId, correct, correctAnswer, explanation, onDone) {
  clearTimeout(explanationTimer);
  const el = document.getElementById(containerId);
  el.style.display = 'block';
  el.className = 'explanation-overlay ' + (correct ? 'correct' : 'wrong');

  if (correct) {
    el.innerHTML = `<div class="expl-header">\u2713 Correct!</div><div class="expl-body">${explanation}</div><div class="expl-tap">Tap to continue</div>`;
  } else {
    el.innerHTML = `<div class="expl-header">\u2717 ${correctAnswer} is correct.</div><div class="expl-body">${explanation}</div><div class="expl-tap">Tap to continue</div>`;
  }

  const dismiss = () => {
    clearTimeout(explanationTimer);
    el.style.display = 'none';
    el.onclick = null;
    if (onDone) onDone();
  };

  el.onclick = dismiss;
  explanationTimer = setTimeout(dismiss, 3000);
}

// ===== MISTAKE TRACKER =====
function loadMistakes() {
  try {
    return JSON.parse(localStorage.getItem('monsterRPG_mistakes') || '[]');
  } catch(e) { return []; }
}

function saveMistakes(mistakes) {
  localStorage.setItem('monsterRPG_mistakes', JSON.stringify(mistakes));
}

function addMistake(question, correctAnswer, explanation, category) {
  const mistakes = loadMistakes();
  // Don't add duplicates (same question text)
  if (mistakes.find(m => m.q === question)) return;
  mistakes.push({
    q: question,
    a: correctAnswer,
    expl: explanation || '',
    cat: category || '',
    streak: 0,  // correct-in-a-row count for removal
    added: Date.now()
  });
  saveMistakes(mistakes);
}

function recordMistakeCorrect(questionText) {
  const mistakes = loadMistakes();
  const m = mistakes.find(m => m.q === questionText);
  if (m) {
    m.streak = (m.streak || 0) + 1;
    if (m.streak >= 2) {
      // Remove from mistake list
      const idx = mistakes.indexOf(m);
      mistakes.splice(idx, 1);
    }
    saveMistakes(mistakes);
  }
}

function recordMistakeWrong(questionText) {
  const mistakes = loadMistakes();
  const m = mistakes.find(m => m.q === questionText);
  if (m) {
    m.streak = 0;
    saveMistakes(mistakes);
  }
}

function updateMistakeBadges() {
  const count = loadMistakes().length;
  const homeBadge = document.getElementById('home-mistake-badge');
  const studyBadge = document.getElementById('study-mistake-badge');
  const studyBtn = document.getElementById('study-mistakes-btn');

  if (count > 0) {
    if (homeBadge) { homeBadge.textContent = count; homeBadge.style.display = 'inline-block'; }
    if (studyBadge) studyBadge.textContent = count;
    if (studyBtn) studyBtn.style.display = 'block';
  } else {
    if (homeBadge) homeBadge.style.display = 'none';
    if (studyBtn) studyBtn.style.display = 'none';
  }
}

function goMistakes() {
  renderMistakeList();
  document.getElementById('mistakes-review-area').style.display = 'none';
  document.getElementById('mistakes-feedback').innerHTML = '';
  document.getElementById('mistakes-explanation').style.display = 'none';
  document.getElementById('mistakes-next-btn').style.display = 'none';
  showScreen('mistakes-screen');
}

function renderMistakeList() {
  const list = document.getElementById('mistake-list');
  const mistakes = loadMistakes();
  list.innerHTML = '';

  if (mistakes.length === 0) {
    list.innerHTML = '<div class="mistake-empty">No mistakes to review! Keep up the great work!</div>';
    document.getElementById('mistakes-start-btn').style.display = 'none';
    return;
  }

  document.getElementById('mistakes-start-btn').style.display = 'block';

  mistakes.forEach(m => {
    const card = document.createElement('div');
    card.className = 'mistake-card';
    card.innerHTML = `
      <div class="mistake-q">${m.q.length > 80 ? m.q.substring(0, 80) + '...' : m.q}</div>
      <div class="mistake-a">\u2713 ${m.a}</div>
      ${m.expl ? '<div class="mistake-expl">' + m.expl + '</div>' : ''}
      <div class="mistake-streak">${m.streak > 0 ? '\u2B50 ' + m.streak + '/2 correct' : 'Not reviewed yet'}</div>
    `;
    list.appendChild(card);
  });
}

let currentMistakeQuestion = null;
let mistakeAnswered = false;

function startMistakeReview() {
  document.getElementById('mistake-list').innerHTML = '';
  document.getElementById('mistakes-start-btn').style.display = 'none';
  document.getElementById('mistakes-review-area').style.display = 'block';
  nextMistakeQuestion();
}

function nextMistakeQuestion() {
  mistakeAnswered = false;
  document.getElementById('mistakes-feedback').innerHTML = '';
  document.getElementById('mistakes-explanation').style.display = 'none';
  document.getElementById('mistakes-next-btn').style.display = 'none';

  const mistakes = loadMistakes();
  if (mistakes.length === 0) {
    document.getElementById('mistakes-review-area').style.display = 'none';
    renderMistakeList();
    updateMistakeBadges();
    return;
  }

  // Pick a random mistake, find the original question for choices
  const m = mistakes[Math.floor(Math.random() * mistakes.length)];
  // Find original question from all pools
  let origQ = null;
  const allPools = [questions.vocabulary, questions.grammar, questions.reading, questions.listening,
                    bossQuestions.vocabulary, bossQuestions.grammar, bossQuestions.reading];
  for (const pool of allPools) {
    const found = pool.find(q => q.q === m.q);
    if (found) { origQ = found; break; }
  }

  if (!origQ) {
    // Question no longer exists, remove it
    const idx = mistakes.indexOf(m);
    mistakes.splice(idx, 1);
    saveMistakes(mistakes);
    nextMistakeQuestion();
    return;
  }

  currentMistakeQuestion = origQ;

  const qBox = document.getElementById('mistakes-question');
  if (origQ.speech && currentMistakeQuestion) {
    qBox.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;gap:8px;">
      <div style="font-size:13px;">${origQ.q}</div>
      <button class="listen-btn" onclick="playMistakeListening()">\uD83D\uDD0A</button>
    </div>`;
    setTimeout(() => playMistakeListening(), 400);
  } else {
    qBox.textContent = origQ.q;
  }

  const choicesEl = document.getElementById('mistakes-choices');
  choicesEl.innerHTML = '';
  origQ.choices.forEach((c, i) => {
    const btn = document.createElement('button');
    btn.className = 'choice-btn';
    btn.textContent = String.fromCharCode(65 + i) + '. ' + c;
    btn.onclick = () => answerMistake(i, btn);
    choicesEl.appendChild(btn);
  });
}

function playMistakeListening() {
  if (!currentMistakeQuestion || !currentMistakeQuestion.speech || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(currentMistakeQuestion.speech);
  utter.lang = 'en-US';
  utter.rate = 0.85;
  window.speechSynthesis.speak(utter);
}

function answerMistake(idx, btnEl) {
  if (mistakeAnswered) return;
  mistakeAnswered = true;

  const correct = idx === currentMistakeQuestion.answer;
  const allBtns = document.querySelectorAll('#mistakes-choices .choice-btn');
  allBtns.forEach((b, i) => {
    b.classList.add('disabled');
    if (i === currentMistakeQuestion.answer) b.classList.add('correct');
  });
  if (!correct) btnEl.classList.add('wrong');

  const feedback = document.getElementById('mistakes-feedback');
  const correctAnswer = currentMistakeQuestion.choices[currentMistakeQuestion.answer];
  const explanation = currentMistakeQuestion.expl || '';

  if (correct) {
    feedback.innerHTML = '<span class="correct-text">Correct!</span>';
    sfx.correct();
    recordMistakeCorrect(currentMistakeQuestion.q);
  } else {
    feedback.innerHTML = `<span class="wrong-text">Wrong... The answer was ${correctAnswer}</span>`;
    sfx.wrong();
    recordMistakeWrong(currentMistakeQuestion.q);
  }

  showExplanation('mistakes-explanation', correct, correctAnswer, explanation, () => {
    document.getElementById('mistakes-next-btn').style.display = 'block';
  });
}

// ===== LEARNED VOCABULARY =====
function loadLearnedVocab() {
  try {
    return JSON.parse(localStorage.getItem('monsterRPG_learnedVocab') || '{}');
  } catch(e) { return {}; }
}

function saveLearnedVocab(vocab) {
  localStorage.setItem('monsterRPG_learnedVocab', JSON.stringify(vocab));
}

function markVocabLearned(word, explanation) {
  const vocab = loadLearnedVocab();
  const key = word.toLowerCase().trim();
  if (!vocab[key]) {
    vocab[key] = explanation;
    saveLearnedVocab(vocab);
  }
}

// Extract vocabulary words from vocabulary questions when answered correctly
function extractVocabWord(question) {
  // Try to extract the key vocabulary word from the question
  const patterns = [
    /What does "(\w+)" mean/i,
    /A "(\w+)" is/i,
    /The "(\w+)" is/i,
    /Your school "(\w+)"/i,
    /You need "(\w+)"/i,
    /"(\w+)," it means/i,
    /"(\w+)" teacher/i,
  ];
  for (const p of patterns) {
    const m = question.match(p);
    if (m) return m[1];
  }
  return null;
}

// Also extract from answer choices for fill-in-the-blank questions
function extractVocabFromAnswer(question, answer) {
  // For emotion/completion questions, the answer itself is the vocabulary word
  const emotionWords = ['anxious','frustrated','confident','relieved','overwhelmed',
    'embarrassed','motivated','jealous','grateful','exhausted','confidence',
    'assignment','deadline','presentation','experiment','hypothesis','schedule',
    'permission','absence','substitute','curriculum','vivid','consequences',
    'phenomenon','reluctant','ambiguous','compelling','evidence','implausible'];
  const lower = answer.toLowerCase();
  if (emotionWords.includes(lower)) return answer;
  return null;
}

// Highlight learned words in story intro text
function highlightLearnedWords(text) {
  const vocab = loadLearnedVocab();
  const words = Object.keys(vocab);
  if (words.length === 0) return text;

  // Sort by length (longest first) to avoid partial matches
  words.sort((a, b) => b.length - a.length);

  // Replace words with highlighted spans
  let result = text;
  words.forEach(word => {
    const regex = new RegExp('\\b(' + word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')\\b', 'gi');
    result = result.replace(regex, '<span class="vocab-word" data-word="$1" onclick="showVocabTooltip(event, \'$1\')">$1</span>');
  });
  return result;
}

let activeTooltip = null;
function showVocabTooltip(event, word) {
  event.stopPropagation();
  hideVocabTooltip();

  const vocab = loadLearnedVocab();
  const meaning = vocab[word.toLowerCase()];
  if (!meaning) return;

  const tooltip = document.createElement('div');
  tooltip.className = 'vocab-tooltip';
  tooltip.id = 'active-vocab-tooltip';
  tooltip.innerHTML = `<div class="vt-word">${word}</div><div class="vt-meaning">${meaning}</div>`;

  document.body.appendChild(tooltip);
  activeTooltip = tooltip;

  // Position near tap
  const rect = event.target.getBoundingClientRect();
  tooltip.style.left = Math.min(rect.left, window.innerWidth - 290) + 'px';
  tooltip.style.top = (rect.bottom + 8) + 'px';

  // Auto-hide after 4 seconds
  setTimeout(hideVocabTooltip, 4000);
  document.addEventListener('click', hideVocabTooltip, { once: true });
}

function hideVocabTooltip() {
  const el = document.getElementById('active-vocab-tooltip');
  if (el) el.remove();
  activeTooltip = null;
}

// ===== TEAM SYSTEM =====
let teamSelectedSlot = 0;

function goTeam() {
  teamSelectedSlot = 0;
  renderTeamScreen();
  showScreen('team-screen');
}

function renderTeamScreen() {
  const slotsEl = document.getElementById('team-slots');
  const listEl = document.getElementById('team-monster-list');
  const team = gameState.team || [1, null, null];
  const owned = getOwnedMonsters();

  // Render slots
  slotsEl.innerHTML = '';
  for (let i = 0; i < 3; i++) {
    const monId = team[i];
    const mon = monId ? monsterRoster.find(m => m.id === monId) : null;
    const prog = monId ? getMonsterData(monId) : null;
    const div = document.createElement('div');
    div.className = 'team-slot' + (i === teamSelectedSlot ? ' selected' : '') + (mon ? ' filled' : '');

    let inner = '';
    if (i === 0) inner += '<div class="leader-badge">LEADER</div>';
    inner += `<div class="slot-label">Slot ${i + 1}</div>`;
    if (mon) {
      const stage = prog ? (prog.evoStage || 0) : 0;
      inner += `<img src="${mon.img}" alt="${mon.name}">`;
      inner += `<div class="slot-name">${mon.name}</div>`;
      inner += `<div class="slot-level">Stg.${stage + 1}</div>`;
    } else {
      inner += '<div class="slot-empty">+</div>';
    }
    div.innerHTML = inner;
    div.onclick = () => { teamSelectedSlot = i; renderTeamScreen(); };
    slotsEl.appendChild(div);
  }

  // Render owned monster list
  listEl.innerHTML = '';
  owned.forEach(id => {
    const mon = monsterRoster.find(m => m.id === id);
    if (!mon) return;
    const inTeam = team.includes(id);
    const prog = getMonsterData(id);
    const stage = prog ? (prog.evoStage || 0) : 0;
    const card = document.createElement('div');
    card.className = 'team-mon-card' + (inTeam ? ' in-team' : '');
    const specText = mon.specialty ? mon.specialty.cats.map(c => c.substring(0,4)).join('+') + ' +' + Math.round(mon.specialty.bonus*100) + '%' : '';
    card.innerHTML = `
      <img src="${mon.img}" alt="${mon.name}">
      <div class="tmc-name">${mon.name}</div>
      <div class="tmc-level">Stg.${stage + 1}</div>
      ${specText ? '<div class="tmc-spec">' + specText + '</div>' : ''}
    `;
    card.onclick = () => assignToSlot(id);
    listEl.appendChild(card);
  });
}

function assignToSlot(monId) {
  const team = gameState.team || [1, null, null];
  // If monster is already in another slot, remove it from that slot
  for (let i = 0; i < 3; i++) {
    if (team[i] === monId) team[i] = null;
  }
  // Assign to selected slot
  team[teamSelectedSlot] = monId;
  gameState.team = team;
  // Leader (slot 0) is the active monster
  if (team[0]) {
    saveCurrentMonsterProgress();
    gameState.activeMonster = team[0];
    loadMonsterProgress(team[0]);
  }
  saveGame();
  renderTeamScreen();
}

// Get specialty bonus for active monster on a given skill category
function getSpecialtyBonus(skillCat) {
  const activeMon = getActiveMonster();
  if (!activeMon.specialty) return 0;
  if (skillCat === 'mixed') return 0;
  if (activeMon.specialty.cats.includes(skillCat)) return activeMon.specialty.bonus;
  return 0;
}

// Battle switch menu
function showBattleSwitchMenu() {
  const team = gameState.team || [1, null, null];
  const activeId = gameState.activeMonster;
  const log = document.getElementById('battle-log');

  // Build switch options
  let switchHtml = '<div style="display:flex;gap:6px;justify-content:center;padding:4px;">';
  let hasOptions = false;

  for (let i = 0; i < 3; i++) {
    const monId = team[i];
    if (!monId || monId === activeId) continue;
    const mon = monsterRoster.find(m => m.id === monId);
    if (!mon) continue;
    // Check if this monster has HP left (use team battle HP if tracked)
    const teamHp = battleState.teamHp ? battleState.teamHp[monId] : null;
    if (teamHp !== null && teamHp !== undefined && teamHp <= 0) continue;
    hasOptions = true;
    switchHtml += `<button class="btn btn-small" onclick="doSwitch(${monId})" style="padding:6px 10px;">
      <img src="${mon.img}" style="width:30px;height:30px;object-fit:contain;display:block;margin:0 auto;">
      <span style="font-size:8px;">${mon.name}</span>
    </button>`;
  }
  switchHtml += '</div>';

  if (!hasOptions) {
    addBattleLog('No other team members available!');
    return;
  }

  addBattleLog('Choose a monster to switch to:');
  log.innerHTML += switchHtml;
  log.scrollTop = log.scrollHeight;
}

function doSwitch(monId) {
  if (battleState.finished) return;

  // Save current monster's battle HP
  if (!battleState.teamHp) battleState.teamHp = {};
  battleState.teamHp[gameState.activeMonster] = battleState.playerHp;

  // Switch active monster
  saveCurrentMonsterProgress();
  gameState.activeMonster = monId;
  loadMonsterProgress(monId);

  const newMon = getActiveMonster();

  // Restore new monster's HP (or use full HP if first time)
  if (battleState.teamHp[monId] !== undefined) {
    battleState.playerHp = battleState.teamHp[monId];
  } else {
    battleState.playerHp = gameState.hp;
    battleState.playerMaxHp = gameState.hp;
  }
  battleState.playerMaxHp = gameState.hp;

  updateBattleHP();
  updateMonsterImages();
  renderBattleSkills();

  addBattleLog(`Switched to <b>${newMon.name}</b>!`);

  // Switching costs a turn - enemy attacks
  enemyTurn();
}

function checkTeamWipe() {
  const team = gameState.team || [1, null, null];
  if (!battleState.teamHp) battleState.teamHp = {};
  battleState.teamHp[gameState.activeMonster] = 0;

  // Check if any team member has HP remaining
  for (let i = 0; i < 3; i++) {
    const monId = team[i];
    if (!monId) continue;
    if (monId === gameState.activeMonster) continue;
    const hp = battleState.teamHp[monId];
    if (hp === undefined || hp > 0) return false; // survivor found
  }
  return true; // all fainted
}

// ===== FIREBASE & RANKING =====
const firebaseConfig = {
  apiKey: "AIzaSyAoY4XVERdArPobTyitbj_EZvtuO8E_EFg",
  authDomain: "monster-english-rpg.firebaseapp.com",
  databaseURL: "https://monster-english-rpg-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "monster-english-rpg",
  storageBucket: "monster-english-rpg.firebasestorage.app",
  messagingSenderId: "487703845364",
  appId: "1:487703845364:web:689b293f1086506c7241a1"
};

let fbApp = null;
let fbDb = null;

function initFirebase() {
  try {
    if (typeof firebase !== 'undefined' && firebase.initializeApp) {
      fbApp = firebase.initializeApp(firebaseConfig);
      fbDb = firebase.database();
      console.log('[Firebase] Initialized. PlayerId:', playerId);
      // Connection test: write and read back
      const testRef = fbDb.ref('_connTest/' + playerId);
      testRef.set({ t: Date.now() }).then(() => {
        console.log('[Firebase] Write OK');
        return testRef.once('value');
      }).then(snap => {
        console.log('[Firebase] Read OK:', snap.val());
        testRef.remove();
      }).catch(err => {
        console.warn('[Firebase] Connection test failed:', err);
      });
    } else {
      console.warn('[Firebase] SDK not loaded');
    }
  } catch(e) { console.warn('[Firebase] Init failed:', e); }
}

function getPlayerScore() {
  const level = getPlayerLevel();
  const totalCorrect = gameState.vocabCorrect + gameState.grammarCorrect + gameState.readingCorrect + (gameState.listeningCorrect || 0);
  return (level * 100) + (gameState.gold * 2) + (totalCorrect * 5);
}

function submitScore() {
  if (!fbDb || !playerId || !gameState.monsterName) return;
  const data = {
    name: gameState.monsterName,
    level: getPlayerLevel(),
    score: getPlayerScore(),
    stage: getMonsterStage(getPlayerLevel()) + 1,
    updated: Date.now()
  };
  fbDb.ref('leaderboard/' + playerId).set(data)
    .then(() => console.log('[Firebase] Score submitted:', data.score, 'for', playerId))
    .catch(e => console.warn('[Firebase] Score submit failed:', e));
}

function goRanking() {
  submitScore();
  showScreen('ranking-screen');
  fetchRanking();
}

function fetchRanking() {
  const list = document.getElementById('ranking-list');
  list.innerHTML = '<div class="ranking-loading"><div class="ranking-spinner"></div>Loading...</div>';
  document.getElementById('ranking-meta').textContent = '';

  if (!fbDb) {
    list.innerHTML = '<div class="ranking-loading">Could not connect to server.</div>';
    return;
  }

  fbDb.ref('leaderboard').orderByChild('score').limitToLast(20).once('value')
    .then(snapshot => {
      const entries = [];
      snapshot.forEach(child => {
        entries.push({ id: child.key, ...child.val() });
      });
      entries.sort((a, b) => b.score - a.score);
      renderRanking(entries);
    })
    .catch(err => {
      list.innerHTML = '<div class="ranking-loading">Failed to load rankings.</div>';
      console.warn('Ranking fetch error:', err);
    });
}

function renderRanking(entries) {
  const list = document.getElementById('ranking-list');
  list.innerHTML = '';

  if (entries.length === 0) {
    list.innerHTML = '<div class="ranking-loading">No rankings yet. Be the first!</div>';
    return;
  }

  const stageEmojis = ['\uD83D\uDFE2','\u2B50','\uD83D\uDC51','\uD83D\uDC09'];

  entries.forEach((e, i) => {
    const rank = i + 1;
    const isMe = e.id === playerId;
    const rankClass = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : '';
    const row = document.createElement('div');
    row.className = 'ranking-row' + (isMe ? ' me' : '');
    row.innerHTML = `
      <span class="ranking-rank ${rankClass}">${rank}</span>
      <span class="ranking-stage">${stageEmojis[(e.stage || 1) - 1] || '\uD83D\uDFE2'}</span>
      <span class="ranking-name">${escapeHtml(e.name || '???')}</span>
      <span class="ranking-lv">Lv.${e.level || 1}</span>
      <span class="ranking-score">${e.score || 0}</span>
    `;
    list.appendChild(row);
  });

  document.getElementById('ranking-meta').textContent = 'Top ' + entries.length + ' players — ' + new Date().toLocaleTimeString();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ===== BOOT =====
initFirebase();
updateMuteBtn();
init();
