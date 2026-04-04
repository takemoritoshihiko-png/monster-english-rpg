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
  team: [1, null, null],
  tickets: 0,
  ticketProgress: 0,
  lastLoginDate: '',
  dailyMissions: null,
  shinyMonsters: [],
  difficulty: 'normal', // 'easy' | 'normal' | 'hard'
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
    if (typeof gameState.tickets !== 'number') gameState.tickets = 0;
    if (!Array.isArray(gameState.shinyMonsters)) gameState.shinyMonsters = [];
    if (typeof gameState.ticketProgress !== 'number') gameState.ticketProgress = 0;
    if (!gameState.lastLoginDate) gameState.lastLoginDate = '';
    // Migrate old playerId from gameState if present
    if (saved.playerId && saved.playerId !== playerId) {
      playerId = saved.playerId;
      localStorage.setItem('monsterRPG_playerId', playerId);
    }
    return true;
  }
  return false;
}

// ===== DIFFICULTY SYSTEM =====
const DIFF_CONFIG = {
  easy:   { timer: 45, hints: 99, hpBonus: 1, atkBonus: 1, defBonus: 1, spdBonus: 1, goldMult: 0.5, expMult: 0.5, ticketEvery: 15, label: '🟢 Easy', color: '#2ecc71' },
  normal: { timer: 30, hints: 2,  hpBonus: 2, atkBonus: 1, defBonus: 1, spdBonus: 1, goldMult: 1.0, expMult: 1.0, ticketEvery: 10, label: '🟡 Normal', color: '#f1c40f' },
  hard:   { timer: 20, hints: 0,  hpBonus: 3, atkBonus: 2, defBonus: 2, spdBonus: 2, goldMult: 1.5, expMult: 1.5, ticketEvery: 7, label: '🔴 Hard', color: '#e74c3c' },
};
function getDiff() { return DIFF_CONFIG[gameState.difficulty] || DIFF_CONFIG.normal; }
function getQuestionPool() {
  const d = gameState.difficulty || 'normal';
  if (d === 'easy' && typeof easyQuestions !== 'undefined') return easyQuestions;
  if (d === 'hard' && typeof hardQuestions !== 'undefined') return hardQuestions;
  return questions;
}

function goSettings() { showScreen('settings-screen'); updateSettingsUI(); }
function updateSettingsUI() {
  const el = document.getElementById('settings-diff-display');
  if (el) { const d = getDiff(); el.textContent = d.label; el.style.color = d.color; }
}
function changeDifficulty(newDiff) {
  if (newDiff === gameState.difficulty) return;
  if (!confirm('Changing difficulty will adjust your rewards from now on. Continue?')) return;
  gameState.difficulty = newDiff;
  saveGame();
  updateSettingsUI();
  updateHomeUI();
}

// ===== PLAYER LEVEL (derived from total correct answers) =====
function getPlayerLevel() {
  const total = gameState.vocabCorrect + gameState.grammarCorrect + gameState.readingCorrect + (gameState.listeningCorrect || 0);
  return Math.floor(total / 5) + 1;
}

// ===== MONSTER STAGE IMAGES =====
// Blue Slime evolution stages (id:1)
const stageImages = ['monster-stage1.png','monster-stage2.png','monster-stage3.png','monster-stage4.png'];
const stageThresholds = [1, 10, 20, 30]; // level thresholds

function getMonsterStage(level) {
  return gameState.evoStage || 0;
}

function getMonsterImage(level) {
  return stageImages[getMonsterStage(level)];
}

function getMonsterStageImage(mon, stage) {
  if (!mon) return 'monster-stage1.png';
  if (stage <= 0) return mon.img;
  // Stage 2+: try monster-X-stage(N+1).png, fallback to base with CSS effect
  return `monster-${mon.id}-stage${stage + 1}.png`;
}

function updateMonsterImages() {
  const activeMon = getActiveMonster();
  const stage = gameState.evoStage || 0;
  const imgEl = document.getElementById('monster-img');
  const battleEl = document.getElementById('player-battle-sprite');

  let imgSrc = activeMon.img;
  let useFilter = false;
  let evoFilter = '';

  // Blue Slime (id:1) uses monster-stage1.png
  if (activeMon.id === 1) imgSrc = 'monster-stage1.png';

  imgEl.style.display = 'block';
  battleEl.style.display = 'block';

  if (stage > 0) {
    if (activeMon.id === 1) {
      imgSrc = stageImages[stage] || 'monster-stage1.png';
    } else {
      imgSrc = getMonsterStageImage(activeMon, stage);
    }
    const evoScale = 1 + stage * 0.08;
    const evoBright = 1 + stage * 0.15;
    evoFilter = `brightness(${evoBright}) drop-shadow(0 0 ${8 + stage * 6}px ${activeMon.color})`;
    useFilter = true;
    imgEl.onerror = () => { imgEl.src = activeMon.id === 1 ? 'monster-stage1.png' : activeMon.img; };
    battleEl.onerror = () => { battleEl.src = activeMon.id === 1 ? 'monster-stage1.png' : activeMon.img; };
  } else {
    imgEl.onerror = null;
    battleEl.onerror = null;
  }

  imgEl.src = imgSrc;
  battleEl.src = imgSrc;

  // Apply shiny filter on ALL stages if monster is shiny
  const monShiny = isShiny(activeMon.id);
  let finalFilter = useFilter ? evoFilter : '';
  if (monShiny) {
    const shinyF = getShinyFilter(activeMon.id);
    // Final form extra glow
    const maxStage = (activeMon.maxStages || 4) - 1;
    const extraGlow = (stage >= maxStage) ? ` drop-shadow(0 0 20px ${activeMon.color})` : '';
    finalFilter = (finalFilter ? finalFilter + ' ' : '') + shinyF + extraGlow;
  }
  imgEl.style.filter = finalFilter;
  imgEl.style.transform = useFilter ? `scale(${1 + stage * 0.08})` : '';
  battleEl.style.filter = finalFilter;

  // Shiny sparkle ring + particles on home screen
  const container = imgEl.closest('.monster-display');
  if (container) {
    let ring = container.querySelector('.shiny-ring');
    let particles = container.querySelector('.shiny-particles');
    if (monShiny) {
      if (!ring) {
        ring = document.createElement('div');
        ring.className = 'shiny-ring';
        container.appendChild(ring);
      }
      ring.style.display = 'block';
      if (!particles) {
        particles = document.createElement('div');
        particles.className = 'shiny-particles';
        particles.innerHTML = '✨✨✨';
        container.appendChild(particles);
      }
      particles.style.display = 'block';
    } else {
      if (ring) ring.style.display = 'none';
      if (particles) particles.style.display = 'none';
    }
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
  gameState.hp += bonus.hp;
  gameState.atk += bonus.atk;
  gameState.def += bonus.def;
  gameState.spd = (gameState.spd || 1) + bonus.spd;
  awardTickets(2, 'Evolution reward!');
  saveGame();
  updateMonsterImages();
  playEvoAnimation(newStage, oldStage);
}

// === EVOLUTION SOUND EFFECTS ===
function evoSfxRise() {
  // Dramatic rising tone during spin
  for (let i = 0; i < 8; i++) playTone(200 + i * 80, 0.15, 'sine', 0.12 + i * 0.02, i * 0.12);
}
function evoSfxFlash() {
  playTone(1200, 0.06, 'square', 0.3); playTone(1200, 0.06, 'square', 0.3, 0.12); playTone(1200, 0.06, 'square', 0.3, 0.24);
}
function evoSfxBoom() {
  playTone(80, 0.4, 'sine', 0.4); playNoise(0.2, 0.35); playTone(120, 0.3, 'triangle', 0.3, 0.05);
}
function evoSfxDing() { playTone(1320, 0.12, 'sine', 0.25); playTone(1760, 0.1, 'sine', 0.15, 0.08); }
function evoSfxFanfare() {
  playTone(523, 0.15, 'square', 0.2);
  playTone(659, 0.15, 'square', 0.2, 0.15);
  playTone(784, 0.15, 'square', 0.2, 0.3);
  playTone(1047, 0.4, 'square', 0.25, 0.45);
  playTone(784, 0.15, 'square', 0.15, 0.55);
  playTone(1047, 0.5, 'sine', 0.3, 0.7);
}

function playEvoAnimation(newStage, oldStage) {
  const overlay = document.getElementById('evo-fullscreen');
  const bg = document.getElementById('evo-bg');
  const monster = document.getElementById('evo-monster');
  const title = document.getElementById('evo-title');
  const subtitle = document.getElementById('evo-subtitle');
  const statsList = document.getElementById('evo-stats-list');

  const activeMon = getActiveMonster();
  const names = activeMon.stageNames || stageNames;
  const oldImg = (activeMon.id === 1) ? stageImages[oldStage] : (oldStage > 0 ? getMonsterStageImage(activeMon, oldStage) : activeMon.img);
  const newImg = (activeMon.id === 1) ? stageImages[newStage] : getMonsterStageImage(activeMon, newStage);

  // Start with old monster image
  monster.src = oldImg;
  monster.onerror = () => { monster.src = activeMon.img; };
  title.textContent = 'EVOLUTION!!';
  subtitle.textContent = '';
  statsList.innerHTML = '';
  overlay.classList.add('active');

  // Reset styles
  bg.style.transition = ''; bg.style.opacity = '0'; bg.style.background = '#000';
  monster.style.opacity = '0'; monster.style.filter = ''; monster.style.transform = 'scale(1)'; monster.style.transition = '';
  title.style.opacity = '0'; title.style.animation = '';
  subtitle.style.opacity = '0';

  // Phase 1 (0.0s): Screen dims to black
  bg.style.transition = 'opacity 0.5s ease';
  bg.style.opacity = '1';

  // Phase 2 (0.5s): Old monster appears glowing white
  setTimeout(() => {
    monster.style.transition = 'all 0.4s ease';
    monster.style.opacity = '1';
    monster.style.filter = 'brightness(1.5) drop-shadow(0 0 30px #fff)';
    evoSfxRise();
  }, 500);

  // Phase 3 (1.0s): Monster spins and grows
  setTimeout(() => {
    monster.style.transition = 'all 1.0s ease-in-out';
    monster.style.transform = 'scale(1.6) rotate(720deg)';
    monster.style.filter = 'brightness(3) drop-shadow(0 0 60px #fff)';
  }, 1000);

  // Phase 4 (1.5s): 3 rapid white flashes
  setTimeout(() => {
    evoSfxFlash();
    let f = 0;
    const fi = setInterval(() => {
      bg.style.background = f % 2 === 0 ? '#fff' : '#000';
      f++;
      if (f >= 6) { clearInterval(fi); bg.style.background = '#000'; }
    }, 80);
  }, 1500);

  // Phase 5 (2.0s): "EVOLUTION!!" slams in
  setTimeout(() => {
    bg.style.transition = 'opacity 0.3s';
    bg.style.opacity = '0.85';
    bg.style.background = '#000';
    title.style.opacity = '1';
    title.style.animation = 'evoSlam 0.4s ease-out';
    // Screen shake
    overlay.style.animation = 'evoShake 0.4s ease';
    setTimeout(() => overlay.style.animation = '', 400);
    evoSfxBoom();
  }, 2000);

  // Phase 6 (2.5s): New monster bursts in with explosion
  setTimeout(() => {
    monster.src = newImg;
    monster.onerror = () => { monster.src = activeMon.img; };
    monster.style.transition = 'all 0.4s ease-out';
    monster.style.transform = 'scale(1)';
    monster.style.filter = 'brightness(1.2) drop-shadow(0 0 25px ' + (activeMon.color || '#f1c40f') + ')';
    bg.style.opacity = '0.12';
    // Light burst particles
    for (let i = 0; i < 12; i++) {
      const line = document.createElement('div');
      line.style.cssText = `position:absolute;width:3px;height:40px;background:linear-gradient(180deg,#fff,transparent);top:50%;left:50%;z-index:1;transform-origin:center bottom;transform:rotate(${i*30}deg) translateY(-80px);opacity:0.8;animation:evoRay 0.6s ease-out forwards;pointer-events:none;`;
      overlay.appendChild(line);
      setTimeout(() => line.remove(), 700);
    }
  }, 2500);

  // Phase 7 (3.0s): New monster name
  setTimeout(() => {
    const newName = names[newStage] || activeMon.name;
    subtitle.textContent = newName.toUpperCase() + ' has awakened!';
    subtitle.style.opacity = '1';
    subtitle.style.animation = 'evoSlam 0.3s ease-out';
  }, 3000);

  // Phase 8 (3.5s): Stats one by one with ding
  const bonus = activeMon.evoBonus || {hp:5,atk:2,def:2,spd:2};
  const stats = [
    { label: 'HP ▲', val: '+' + bonus.hp, color: '#2ecc71' },
    { label: 'ATK ▲', val: '+' + bonus.atk, color: '#e94560' },
    { label: 'DEF ▲', val: '+' + bonus.def, color: '#3498db' },
    { label: 'SPD ▲', val: '+' + bonus.spd, color: '#f1c40f' },
  ];
  stats.forEach((s, i) => {
    setTimeout(() => {
      const line = document.createElement('div');
      line.className = 'evo-stat-line';
      line.style.opacity = '1';
      line.style.color = s.color;
      line.style.animation = 'evoStatPop 0.3s ease-out';
      line.textContent = s.label + ' ' + s.val;
      statsList.appendChild(line);
      evoSfxDing();
    }, 3500 + i * 350);
  });

  // Phase 9 (4.5s): Confetti + ticket reward
  setTimeout(() => {
    evoSfxFanfare();
    // Confetti
    const colors = ['#e94560','#f1c40f','#2ecc71','#3498db','#9b59b6','#ff6b6b','#FFD700'];
    for (let i = 0; i < 40; i++) {
      const p = document.createElement('div');
      p.style.cssText = `position:absolute;width:${6+Math.random()*6}px;height:${6+Math.random()*6}px;background:${colors[i%colors.length]};border-radius:${Math.random()>0.5?'50%':'2px'};left:${Math.random()*100}%;top:${10+Math.random()*20}%;z-index:5;pointer-events:none;animation:confettiFall ${1.5+Math.random()*1.5}s ease-out ${Math.random()*0.3}s forwards;`;
      overlay.appendChild(p);
      setTimeout(() => p.remove(), 3500);
    }
    // Ticket reward display
    const ticketDiv = document.createElement('div');
    ticketDiv.className = 'evo-stat-line';
    ticketDiv.style.cssText = 'opacity:1;color:#f1c40f;font-size:12px;animation:evoStatPop 0.3s ease-out;';
    ticketDiv.textContent = '🎫 x2 GET!';
    statsList.appendChild(ticketDiv);
  }, 4500);

  // Phase 10 (5.0s): "TAP TO CONTINUE"
  setTimeout(() => {
    const tap = document.createElement('div');
    tap.style.cssText = 'position:absolute;bottom:30px;width:100%;text-align:center;color:#888;font-size:12px;z-index:10;animation:fadeIn 0.5s;cursor:pointer;';
    tap.textContent = 'TAP TO CONTINUE';
    tap.id = 'evo-tap-continue';
    overlay.appendChild(tap);
    const closeEvo = () => {
      overlay.classList.remove('active');
      bg.style.opacity = '0'; bg.style.background = '#000';
      monster.style.opacity = '0'; monster.style.filter = ''; monster.style.transform = 'scale(1)';
      title.style.opacity = '0'; title.style.animation = '';
      subtitle.style.opacity = '0'; subtitle.style.animation = '';
      statsList.innerHTML = '';
      tap.remove();
      overlay.removeEventListener('click', closeEvo);
      overlay.removeEventListener('touchend', closeEvo);
      updateHomeUI();
    };
    overlay.addEventListener('click', closeEvo);
    overlay.addEventListener('touchend', closeEvo);
  }, 5000);
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
  const shinyTag = isShiny(activeMon.id) ? '✨ ' : '';
  document.getElementById('home-monster-name').textContent = shinyTag + gameState.monsterName + ' (' + activeMon.name + ')';
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
  checkDailyLogin();
  updateDailyUI();
  // Difficulty badge
  const diffBadge = document.getElementById('diff-badge');
  if (diffBadge) { const d = getDiff(); diffBadge.textContent = d.label; diffBadge.style.color = d.color; }
}

// ===== GACHA TICKET SYSTEM =====
function awardTicket(reason) {
  gameState.tickets = (gameState.tickets || 0) + 1;
  saveGame();
  showTicketPopup(reason);
}
function awardTickets(n, reason) {
  gameState.tickets = (gameState.tickets || 0) + n;
  saveGame();
  showTicketPopup(reason + ' (x' + n + ')');
}
function showTicketPopup(reason) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:200;display:flex;align-items:center;justify-content:center;animation:fadeIn .3s;';
  overlay.innerHTML = `<div style="background:linear-gradient(135deg,#1a1a2e,#16213e);border:2px solid #f1c40f;border-radius:16px;padding:24px;text-align:center;color:#fff;animation:popIn .4s ease-out;max-width:300px;">
    <div style="font-size:48px;">🎫</div>
    <h3 style="color:#f1c40f;margin:8px 0;">Gacha Ticket GET!</h3>
    <p style="font-size:13px;color:#ccc;">${reason}</p>
    <p style="font-size:16px;color:#f1c40f;font-weight:bold;">Total: ${gameState.tickets} 🎫</p>
    <button class="btn" onclick="this.closest('div[style]').parentElement.remove()" style="margin-top:12px;">OK</button>
  </div>`;
  document.body.appendChild(overlay);
  setTimeout(() => { if (overlay.parentElement) overlay.remove(); }, 5000);
}
function checkTicketProgress() {
  gameState.ticketProgress = (gameState.ticketProgress || 0) + 1;
  const ticketThreshold = getDiff().ticketEvery;
  if (gameState.ticketProgress >= ticketThreshold) {
    gameState.ticketProgress = 0;
    awardTicket('10 correct answers!');
  }
  saveGame();
}

// ===== DAILY MISSION SYSTEM =====
function getTodayStr() { return new Date().toISOString().slice(0, 10); }
function getDailyMissions() {
  const today = getTodayStr();
  if (!gameState.dailyMissions || gameState.dailyMissions.date !== today) {
    gameState.dailyMissions = {
      date: today,
      vocabDone: 0, grammarDone: 0, storyDone: 0, loginDone: false,
      vocabClaimed: false, grammarClaimed: false, storyClaimed: false, loginClaimed: false,
      allClaimed: false,
    };
    saveGame();
  }
  return gameState.dailyMissions;
}
function checkDailyLogin() {
  const dm = getDailyMissions();
  const today = getTodayStr();
  if (gameState.lastLoginDate !== today) {
    gameState.lastLoginDate = today;
    dm.loginDone = true;
    saveGame();
  }
}
function recordDailyCorrect(category) {
  const dm = getDailyMissions();
  if (category === 'vocabulary') dm.vocabDone = Math.min((dm.vocabDone || 0) + 1, 5);
  else if (category === 'grammar') dm.grammarDone = Math.min((dm.grammarDone || 0) + 1, 5);
  saveGame();
}
function recordDailyStory() {
  const dm = getDailyMissions();
  dm.storyDone = 1;
  saveGame();
}
function claimMission(type) {
  const dm = getDailyMissions();
  if (type === 'vocab' && dm.vocabDone >= 5 && !dm.vocabClaimed) {
    dm.vocabClaimed = true; awardTicket('Daily: 5 Vocabulary');
  } else if (type === 'grammar' && dm.grammarDone >= 5 && !dm.grammarClaimed) {
    dm.grammarClaimed = true; awardTicket('Daily: 5 Grammar');
  } else if (type === 'story' && dm.storyDone >= 1 && !dm.storyClaimed) {
    dm.storyClaimed = true; awardTicket('Daily: Story Battle'); gameState.gold += 20;
  } else if (type === 'login' && dm.loginDone && !dm.loginClaimed) {
    dm.loginClaimed = true; awardTicket('Daily Login');
  }
  // Check all complete
  if (dm.vocabClaimed && dm.grammarClaimed && dm.storyClaimed && dm.loginClaimed && !dm.allClaimed) {
    dm.allClaimed = true; awardTickets(2, 'All Missions Complete!');
  }
  saveGame();
  updateDailyUI();
}
function updateDailyUI() {
  const el = document.getElementById('daily-missions-body');
  if (!el) return;
  const dm = getDailyMissions();
  const missions = [
    { key:'vocab', label:'Answer 5 vocabulary', done: dm.vocabDone||0, max:5, claimed: dm.vocabClaimed },
    { key:'grammar', label:'Answer 5 grammar', done: dm.grammarDone||0, max:5, claimed: dm.grammarClaimed },
    { key:'story', label:'Complete 1 story battle', done: dm.storyDone||0, max:1, claimed: dm.storyClaimed },
    { key:'login', label:'Login today', done: dm.loginDone?1:0, max:1, claimed: dm.loginClaimed },
  ];
  el.innerHTML = missions.map(m => {
    const complete = m.done >= m.max;
    const icon = m.claimed ? '✅' : complete ? '🟢' : '⬜';
    const btn = complete && !m.claimed ? `<button class="btn btn-small" onclick="claimMission('${m.key}')" style="padding:4px 8px;font-size:10px;">Claim 🎫</button>` : (m.claimed ? '<span style="color:#2ecc71;font-size:10px;">Claimed</span>' : '');
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.05);font-size:12px;">
      <span>${icon} ${m.label} (${m.done}/${m.max})</span>${btn}</div>`;
  }).join('');
  if (dm.allClaimed) el.innerHTML += '<div style="text-align:center;color:#f1c40f;font-size:11px;font-weight:bold;margin-top:4px;">🎉 All Missions Complete! +2 bonus 🎫</div>';
  // Update ticket display
  const ticketEl = document.getElementById('ticket-val');
  if (ticketEl) ticketEl.textContent = gameState.tickets || 0;
  // Update ticket progress bar
  const tpBar = document.getElementById('ticket-progress-bar');
  const tt = getDiff().ticketEvery;
  if (tpBar) tpBar.style.width = ((gameState.ticketProgress || 0) / tt * 100) + '%';
  const tpText = document.getElementById('ticket-progress-text');
  if (tpText) tpText.textContent = `Next 🎫: ${gameState.ticketProgress || 0}/${tt}`;
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
let studyCombo = 0;
let studyQuestionStart = 0; // timestamp for speed bonus

// Dramatic feedback helpers
function screenFlash(color, duration) {
  const fl = document.createElement('div');
  fl.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;background:${color};z-index:999;pointer-events:none;opacity:0.5;`;
  document.body.appendChild(fl);
  setTimeout(() => fl.remove(), duration || 200);
}
function showBigText(text, color, parent) {
  const el = document.createElement('div');
  el.style.cssText = `position:absolute;top:30%;left:50%;transform:translate(-50%,-50%) scale(0.3);font-family:'Press Start 2P',monospace;font-size:20px;color:${color};z-index:100;pointer-events:none;text-align:center;text-shadow:0 0 15px ${color};white-space:nowrap;`;
  el.textContent = text;
  (parent || document.getElementById('study-screen')).appendChild(el);
  requestAnimationFrame(() => { el.style.transition = 'all 0.4s ease-out'; el.style.transform = 'translate(-50%,-50%) scale(1.2)'; el.style.opacity = '1'; });
  setTimeout(() => { el.style.transition = 'all 0.4s ease-out'; el.style.transform = 'translate(-50%,-80%) scale(0.8)'; el.style.opacity = '0'; }, 500);
  setTimeout(() => el.remove(), 1000);
}
function showStatFloat(text, color) {
  const el = document.createElement('div');
  el.style.cssText = `position:absolute;top:40%;left:50%;transform:translateX(-50%);font-size:22px;font-weight:900;color:${color};z-index:100;pointer-events:none;text-shadow:0 0 10px ${color};`;
  document.getElementById('study-screen').appendChild(el);
  el.textContent = text;
  let y = 0;
  const anim = setInterval(() => { y -= 2; el.style.transform = `translateX(-50%) translateY(${y}px)`; el.style.opacity = String(1 + y/60); if (y < -60) { clearInterval(anim); el.remove(); } }, 16);
}
function showComboText(combo) {
  const el = document.getElementById('study-combo');
  if (!el) return;
  if (combo < 3) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  if (combo >= 10) { el.textContent = `⚡ PERFECT STREAK x${combo}!!`; el.style.color = '#FFD700'; }
  else if (combo >= 5) { el.textContent = `🔥🔥 COMBO x${combo}!!`; el.style.color = '#FF6600'; }
  else { el.textContent = `🔥 COMBO x${combo}!`; el.style.color = '#FF8800'; }
  el.style.animation = 'none'; void el.offsetWidth; el.style.animation = 'evoSlam 0.3s ease-out';
}

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

  studyQuestionStart = Date.now();
  const qPool = getQuestionPool();
  const pool = qPool[currentCategory] || questions[currentCategory];
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
    const dc = getDiff();
    if (currentCategory === 'vocabulary') {
      gameState.hp += dc.hpBonus;
      gameState.vocabCorrect++;
      statMsg = `HP +${dc.hpBonus} !!`;
      // Mark vocabulary as learned
      const vocabWord = extractVocabWord(currentQuestion.q) || extractVocabFromAnswer(currentQuestion.q, correctAnswer);
      if (vocabWord) markVocabLearned(vocabWord, explanation);
    } else if (currentCategory === 'grammar') {
      gameState.grammarCorrect++;
      gameState.grammarStreak++;
      if (gameState.grammarStreak >= 3) {
        gameState.atk += dc.atkBonus;
        gameState.grammarStreak = 0;
        statMsg = `ATK +${dc.atkBonus} !! (3 correct in a row)`;
      } else {
        statMsg = `${3 - gameState.grammarStreak} more for ATK up`;
      }
    } else if (currentCategory === 'reading') {
      gameState.readingCorrect++;
      gameState.readingStreak++;
      if (gameState.readingStreak >= 2) {
        gameState.def += dc.defBonus;
        gameState.readingStreak = 0;
        statMsg = `DEF +${dc.defBonus} !! (2 correct in a row)`;
      } else {
        statMsg = `${2 - gameState.readingStreak} more for DEF up`;
      }
    } else if (currentCategory === 'listening') {
      gameState.listeningCorrect = (gameState.listeningCorrect || 0) + 1;
      gameState.spd = (gameState.spd || 1) + dc.spdBonus;
      statMsg = `SPD +${dc.spdBonus} !!`;
    }
    // === DRAMATIC CORRECT FEEDBACK ===
    studyCombo++;
    screenFlash('#2ecc71', 200);
    showBigText('CORRECT! ✓', '#2ecc71');
    if (statMsg.includes('+')) {
      const statColor = statMsg.includes('HP') ? '#2ecc71' : statMsg.includes('ATK') ? '#e94560' : statMsg.includes('DEF') ? '#3498db' : '#f1c40f';
      setTimeout(() => showStatFloat(statMsg.replace(' !!',''), statColor), 200);
    }
    showComboText(studyCombo);
    // Speed bonus
    const answerTime = (Date.now() - studyQuestionStart) / 1000;
    if (answerTime < 8 && studyQuestionStart > 0) {
      setTimeout(() => showStatFloat('FAST! +20%', '#FFD700'), 400);
    }
    // Combo screen effects
    if (studyCombo >= 10) screenFlash('#FFD700', 300);
    else if (studyCombo >= 5) {
      const glow = document.getElementById('study-screen');
      if (glow) { glow.style.boxShadow = 'inset 0 0 40px rgba(255,102,0,0.3)'; setTimeout(() => glow.style.boxShadow = '', 500); }
    }
    feedback.innerHTML = `<span class="correct-text">Correct!</span><span class="stat-up-anim">${statMsg}</span>`;
    sfx.correct();
    addEvoGauge(3);
    checkTicketProgress();
    recordDailyCorrect(currentCategory);
    if (currentCategory === 'grammar' && gameState.grammarStreak === 0 && statMsg.includes('ATK')) {
      awardTicket('Grammar 3 streak!');
    }
    saveGame();
    checkEvolution();
  } else {
    // === WRONG ANSWER FEEDBACK ===
    const lostCombo = studyCombo;
    studyCombo = 0;
    if (currentCategory === 'grammar') gameState.grammarStreak = 0;
    if (currentCategory === 'reading') gameState.readingStreak = 0;
    screenFlash('rgba(231,76,60,0.3)', 200);
    feedback.innerHTML = `<span class="wrong-text">Not quite! The answer is ${String.fromCharCode(65 + currentQuestion.answer)}. ${correctAnswer}</span>`;
    if (lostCombo >= 3) feedback.innerHTML += `<div style="font-size:9px;color:#888;margin-top:2px;">combo lost</div>`;
    showComboText(0);
    // Soft thud sound
    playTone(100, 0.15, 'triangle', 0.15);
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
    awardTickets(3, 'Boss defeated!');
    recordDailyStory();
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
  setEnemySprite(enemy);
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
  const pool = enemies.filter(e => playerLevel >= (e.minLv || 1) && (!e.maxLv || playerLevel <= e.maxLv));
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
  setEnemySprite(enemy);
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

function setEnemySprite(enemy) {
  const el = document.getElementById('enemy-sprite');
  if (enemy.img) {
    el.textContent = '';
    el.style.fontSize = '0';
    let img = el.querySelector('img');
    if (!img) { img = document.createElement('img'); img.style.cssText = 'width:130px;height:130px;object-fit:contain;'; el.appendChild(img); }
    img.src = enemy.img;
    img.alt = enemy.name;
  } else {
    const old = el.querySelector('img'); if (old) old.remove();
    el.style.fontSize = '';
    el.textContent = enemy.emoji || '?';
  }
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
  const gTicketEl = document.getElementById('gacha-tickets');
  if (gTicketEl) gTicketEl.textContent = gameState.tickets || 0;
  const owned = getOwnedMonsters();
  // Count unique types collected
  const uniqueTypes = new Set(owned).size;
  document.getElementById('gacha-owned-count').textContent = 'Types: ' + uniqueTypes + '/10 | Total: ' + owned.length;
  document.getElementById('gacha-1-btn').disabled = gameState.gold < 100 && (gameState.tickets||0) < 1;
  document.getElementById('gacha-10-btn').disabled = gameState.gold < 900;
  const tBtn = document.getElementById('gacha-ticket-btn');
  if (tBtn) tBtn.disabled = (gameState.tickets||0) < 1;
  document.getElementById('gacha-overlay').classList.remove('active');
  showScreen('gacha-screen');
}

function doGachaTicket() {
  if ((gameState.tickets||0) < 1) return;
  gameState.tickets--;
  saveGame();
  const pulled = [];
  const mon = rollGacha();
  if (mon && !mon._full) pulled.push(mon);
  if (pulled.length === 0) { gameState.tickets++; saveGame(); alert('Collection Full!'); goGacha(); return; }
  showGachaReveal(pulled[0], 1);
}

function doGacha(count) {
  const cost = count === 10 ? 900 : 100;
  if (gameState.gold < cost) return;
  gameState.gold -= cost;
  saveGame();

  const pulled = [];
  for (let i = 0; i < count; i++) {
    const mon = rollGacha();
    if (mon && !mon._full) pulled.push(mon);
  }

  if (pulled.length === 0) {
    gameState.gold += cost;
    saveGame();
    alert('Collection Full! All monster types are at max (×5).');
    goGacha();
    return;
  }

  // Show first pull (for multi-pull, show one by one would be complex; show last)
  showGachaReveal(pulled[pulled.length - 1], pulled.length);
}

// ===== SHINY SYSTEM =====
const SHINY_RATES = { 'Normal': 0.03, 'Rare': 0.015, 'Super Rare': 0.005, 'Legend': 0.001 };
const SHINY_FILTERS = {
  1: 'hue-rotate(40deg) saturate(1.5) brightness(1.2)',   // Blue Slime → Gold
  2: 'hue-rotate(180deg) saturate(1.3)',                   // Fire Fox → Ice Blue
  3: 'hue-rotate(270deg) saturate(1.4)',                   // Stone Golem → Purple Crystal
  4: 'hue-rotate(300deg) saturate(1.5)',                   // Thunder Bird → Pink
  5: 'hue-rotate(30deg) saturate(1.6)',                    // Ice Wolf → Sunset Orange
  6: 'hue-rotate(120deg) saturate(1.8)',                   // Dark Bat → Neon Green
  7: 'hue-rotate(100deg) saturate(1.5)',                   // Wind Dragon → Red Fire
  8: 'brightness(1.8) saturate(0.3)',                      // Lava Titan → Arctic White
  9: 'hue-rotate(60deg) saturate(1.4)',                    // Storm Phoenix → Gold
  10: 'hue-rotate(220deg) saturate(1.6) brightness(0.9)', // Celestial Beast → Dark Cosmic
};
const SHINY_STAT_BONUSES = { 'Normal': 0.15, 'Rare': 0.25, 'Super Rare': 0.35, 'Legend': 0.50 };

function isShiny(monId) { return (gameState.shinyMonsters || []).includes(monId); }
function getShinyFilter(monId) { return SHINY_FILTERS[monId] || 'hue-rotate(40deg) saturate(1.5) brightness(1.2)'; }
function getShinyStatBonus(monId) {
  if (!isShiny(monId)) return 0;
  const mon = monsterRoster.find(m => m.id === monId);
  return SHINY_STAT_BONUSES[mon ? mon.rarity : 'Normal'] || 0.15;
}

function evoSfxShinyFanfare() {
  playTone(1047, 0.1, 'sine', 0.3); playTone(1319, 0.1, 'sine', 0.3, 0.1);
  playTone(1568, 0.1, 'sine', 0.3, 0.2); playTone(2093, 0.15, 'sine', 0.35, 0.3);
  playTone(2637, 0.2, 'sine', 0.3, 0.45); playTone(3136, 0.4, 'sine', 0.25, 0.6);
}

function rollGacha() {
  // Weighted random rarity
  const roll = Math.random() * 100;
  let rarity;
  if (roll < 5) rarity = 'Legend';
  else if (roll < 20) rarity = 'Super Rare';
  else if (roll < 50) rarity = 'Rare';
  else rarity = 'Normal';

  // Allow duplicates up to 5 per type
  const owned = gameState.ownedMonsters || [1];
  let pool = monsterRoster.filter(m => m.rarity === rarity && owned.filter(o => o === m.id).length < 5);
  if (pool.length === 0) pool = monsterRoster.filter(m => owned.filter(o => o === m.id).length < 5);
  if (pool.length === 0) return { _full: true }; // All types at max 5

  const mon = pool[Math.floor(Math.random() * pool.length)];
  if (!gameState.ownedMonsters) gameState.ownedMonsters = [1];
  gameState.ownedMonsters.push(mon.id);
  initMonsterProgress(mon.id);
  // Shiny roll (rate based on rarity)
  const gotShiny = Math.random() < (SHINY_RATES[mon.rarity] || 0.01);
  if (gotShiny && !gameState.shinyMonsters.includes(mon.id)) {
    gameState.shinyMonsters.push(mon.id);
  }
  saveGame();
  return { ...mon, _isShiny: gotShiny };
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

  const shiny = mon._isShiny;
  // Determine if video should play
  const videoFile = shiny ? 'gacha-shiny.mp4' : (mon.rarity === 'Legend' ? 'gacha-legend.mp4' : (mon.rarity === 'Rare' || mon.rarity === 'Super Rare' ? 'gacha-rare.mp4' : null));

  function showMonsterResult() {
    egg.style.display = 'none';
    reveal.classList.add('active');

    const gachaCircle = document.getElementById('gacha-circle');
    gachaCircle.style.background = 'transparent';
    const shinyFilter = shiny ? getShinyFilter(mon.id) : '';
    const imgStyle = `width:80px;height:80px;object-fit:contain;filter:drop-shadow(0 0 12px ${mon.color}) ${shinyFilter};`;
    gachaCircle.innerHTML = `<img src="${mon.img}" alt="${mon.name}" style="${imgStyle}">`;
    gachaCircle.style.animation = shiny ? 'shinySparkle 1s ease-in-out infinite' : '';

    const rarityMap = {Normal:'rarity-normal',Rare:'rarity-rare','Super Rare':'rarity-sr',Legend:'rarity-legend'};
    const rarityEl = document.getElementById('gacha-rarity');
    rarityEl.className = 'gacha-rarity ' + (rarityMap[mon.rarity] || 'rarity-normal');
    rarityEl.textContent = shiny ? '✨ SHINY ' + mon.rarity + ' ✨' : mon.rarity;

    document.getElementById('gacha-mon-name').textContent = shiny ? '✨ Shiny ' + mon.name : mon.name;
    document.getElementById('gacha-mon-element').textContent = mon.element + ' \u2022 ' + mon.trait;
    const shinyPct = Math.round((SHINY_STAT_BONUSES[mon.rarity] || 0.15) * 100);
    const bonusTxt = shiny ? ` (✨ +${shinyPct}% all stats!)` : '';
    document.getElementById('gacha-mon-stats').textContent = `HP:${mon.hp} ATK:${mon.atk} DEF:${mon.def}${bonusTxt}`;
    // Remove any leftover rareNote
    const oldNotes = reveal.querySelectorAll('.gacha-rare-note'); oldNotes.forEach(n => n.remove());
    if (shiny) {
      const rareNote = document.createElement('div');
      rareNote.className = 'gacha-rare-note';
      rareNote.style.cssText = 'font-size:10px;color:#f1c40f;margin-top:4px;animation:fadeIn .5s;';
      const rate = SHINY_RATES[mon.rarity] || 0.01;
      rareNote.textContent = `Extremely Rare! Only ${rate * 100}% chance!`;
      reveal.appendChild(rareNote);
    }
    if (totalCount > 1) {
      document.getElementById('gacha-mon-stats').textContent += ` (+${totalCount - 1} more!)`;
    }
    sfx.evolution();
  }

  if (videoFile) {
    // Play video first, then reveal
    setTimeout(() => {
      egg.style.display = 'none';
      const vid = document.createElement('video');
      vid.src = videoFile;
      vid.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;z-index:20;border-radius:14px;';
      vid.muted = true; vid.playsInline = true; vid.autoplay = true;
      overlay.appendChild(vid);
      // Skip button
      const skipBtn = document.createElement('button');
      skipBtn.textContent = 'Skip ▶';
      skipBtn.style.cssText = 'position:absolute;top:8px;right:8px;z-index:25;background:rgba(0,0,0,0.6);color:#fff;border:1px solid rgba(255,255,255,0.3);border-radius:6px;padding:4px 12px;font-size:11px;cursor:pointer;';
      overlay.appendChild(skipBtn);
      let finished = false;
      function onVideoEnd() {
        if (finished) return; finished = true;
        vid.remove(); skipBtn.remove();
        showMonsterResult();
      }
      vid.onended = onVideoEnd;
      vid.onerror = onVideoEnd;
      skipBtn.onclick = onVideoEnd;
      // Fallback timeout
      setTimeout(() => { if (!finished) onVideoEnd(); }, 12000);
    }, 1200);
  } else {
    // Normal pull: egg crack → reveal (no video)
    setTimeout(() => { egg.classList.add('cracking'); sfx.evolution(); }, 1500);
    setTimeout(() => { showMonsterResult(); }, 2200);
  }
}

function closeGachaReveal() {
  document.getElementById('gacha-overlay').classList.remove('active');
  goGacha();
}

// ===== CRAFTING SYSTEM =====
const CRAFT_RECIPES = [
  {
    id: 'slime-king', name: 'Slime Demon King', img: 'monster-slime-king.png',
    rarity: 'MYTHIC', color: '#9b59b6',
    hp: 200, atk: 80, def: 60, spd: 40,
    specialty: { cats: ['vocabulary','grammar','reading','listening'], bonus: 0.30 },
    trait: 'All +30%', element: 'Dark/Water',
    aura: 'drop-shadow(0 0 25px #9b59b6)',
    ingredients: [
      { desc: 'Blue Slime (any stage) ×3', check: () => countMonsterCopies(1) >= 3, consume: () => removeMonsterCopies(1, 3) },
    ],
    ingredientText: 'Blue Slime ×3 (stages 1-4 count)',
  },
  {
    id: 'chimera-king', name: 'Chimera King', img: 'monster-chimera-king.png',
    rarity: 'MYTHIC', color: '#FFD700',
    hp: 250, atk: 100, def: 80, spd: 50,
    specialty: { cats: ['vocabulary','grammar','reading','listening'], bonus: 0.25 },
    trait: 'Inherits best', element: 'All',
    aura: 'drop-shadow(0 0 25px #FFD700)',
    ingredients: [
      { desc: '5 different monsters at final evo', check: () => countFinalEvo() >= 5, consume: () => removeFinalEvo(5) },
    ],
    ingredientText: '5 different fully-evolved monsters',
  },
  {
    id: 'god', name: 'GOD', img: 'monster-god.png',
    rarity: 'DIVINE', color: '#ff6b6b',
    hp: 999, atk: 150, def: 120, spd: 80,
    specialty: { cats: ['vocabulary','grammar','reading','listening'], bonus: 0.50 },
    trait: 'All +50%', element: 'Divine',
    aura: 'drop-shadow(0 0 30px #ff0) drop-shadow(0 0 60px #f0f)',
    ingredients: [
      { desc: '5 Shiny monsters at final evo', check: () => countShinyFinalEvo() >= 5, consume: () => removeShinyFinalEvo(5) },
    ],
    ingredientText: '5 different Shiny fully-evolved monsters',
  },
];

function countMonsterCopies(id) {
  return (gameState.ownedMonsters || []).filter(m => m === id).length;
}
function removeMonsterCopies(id, n) {
  let removed = 0;
  gameState.ownedMonsters = (gameState.ownedMonsters || []).filter(m => {
    if (m === id && removed < n) { removed++; return false; }
    return true;
  });
}
function countFinalEvo() {
  const owned = gameState.ownedMonsters || [];
  let count = 0;
  const seen = new Set();
  for (const id of owned) {
    if (seen.has(id)) continue;
    const mon = monsterRoster.find(m => m.id === id);
    if (!mon) continue;
    const maxStage = (mon.maxStages || 4) - 1;
    const prog = gameState.monsterProgress && gameState.monsterProgress[id];
    const stage = prog ? (prog.evoStage || 0) : (id === (gameState.activeMonster||1) ? (gameState.evoStage||0) : 0);
    if (stage >= maxStage) { count++; seen.add(id); }
  }
  return count;
}
function removeFinalEvo(n) {
  let removed = 0;
  const toRemove = [];
  const owned = gameState.ownedMonsters || [];
  for (const id of owned) {
    if (removed >= n) break;
    if (toRemove.includes(id)) continue;
    const mon = monsterRoster.find(m => m.id === id);
    if (!mon) continue;
    const maxStage = (mon.maxStages || 4) - 1;
    const prog = gameState.monsterProgress && gameState.monsterProgress[id];
    const stage = prog ? (prog.evoStage || 0) : (id === (gameState.activeMonster||1) ? (gameState.evoStage||0) : 0);
    if (stage >= maxStage) { toRemove.push(id); removed++; }
  }
  for (const id of toRemove) {
    const idx = gameState.ownedMonsters.indexOf(id);
    if (idx >= 0) gameState.ownedMonsters.splice(idx, 1);
  }
}
function countShinyFinalEvo() {
  let count = 0;
  for (const id of (gameState.shinyMonsters || [])) {
    const mon = monsterRoster.find(m => m.id === id);
    if (!mon) continue;
    const maxStage = (mon.maxStages || 4) - 1;
    const prog = gameState.monsterProgress && gameState.monsterProgress[id];
    const stage = prog ? (prog.evoStage || 0) : (id === (gameState.activeMonster||1) ? (gameState.evoStage||0) : 0);
    if (stage >= maxStage) count++;
  }
  return count;
}
function removeShinyFinalEvo(n) {
  // Remove n shiny final-evo monsters from both shiny and owned lists
  let removed = 0;
  const toRemove = [];
  for (const id of (gameState.shinyMonsters || [])) {
    if (removed >= n) break;
    const mon = monsterRoster.find(m => m.id === id);
    if (!mon) continue;
    const maxStage = (mon.maxStages || 4) - 1;
    const prog = gameState.monsterProgress && gameState.monsterProgress[id];
    const stage = prog ? (prog.evoStage || 0) : (id === (gameState.activeMonster||1) ? (gameState.evoStage||0) : 0);
    if (stage >= maxStage) { toRemove.push(id); removed++; }
  }
  for (const id of toRemove) {
    const si = gameState.shinyMonsters.indexOf(id); if (si >= 0) gameState.shinyMonsters.splice(si, 1);
    const oi = gameState.ownedMonsters.indexOf(id); if (oi >= 0) gameState.ownedMonsters.splice(oi, 1);
  }
}

function goCraft() {
  renderCraftList();
  showScreen('craft-screen');
}

function renderCraftList() {
  const list = document.getElementById('craft-list');
  list.innerHTML = '';
  const crafted = gameState.craftedMonsters || [];
  CRAFT_RECIPES.forEach(recipe => {
    const owned = crafted.includes(recipe.id);
    const canCraft = !owned && recipe.ingredients.every(ing => ing.check());
    const card = document.createElement('div');
    card.style.cssText = `background:rgba(10,10,26,0.7);border:2px solid ${owned ? '#2ecc71' : canCraft ? '#f1c40f' : '#333'};border-radius:12px;padding:12px;`;
    const rarityColor = recipe.rarity === 'DIVINE' ? '#ff6b6b' : '#9b59b6';
    const statusIcon = owned ? '✅ Crafted' : canCraft ? '⚒️ Ready!' : '🔒 Locked';
    card.innerHTML = `
      <div style="display:flex;gap:10px;align-items:center;">
        <img src="${recipe.img}" style="width:64px;height:64px;object-fit:contain;filter:${owned ? recipe.aura : 'grayscale(0.5) brightness(0.7)'};border-radius:8px;">
        <div style="flex:1;">
          <div style="font-weight:bold;font-size:13px;color:#fff;">${recipe.name}</div>
          <div style="font-size:10px;color:${rarityColor};font-weight:bold;">${recipe.rarity}</div>
          <div style="font-size:9px;color:#aaa;margin-top:2px;">HP:${recipe.hp} ATK:${recipe.atk} DEF:${recipe.def} SPD:${recipe.spd}</div>
          <div style="font-size:9px;color:#888;margin-top:2px;">${recipe.ingredientText}</div>
          <div style="font-size:10px;margin-top:3px;">${statusIcon}</div>
        </div>
      </div>
      ${!owned && canCraft ? `<button class="btn btn-primary" onclick="doCraft('${recipe.id}')" style="width:100%;margin-top:8px;font-size:12px;">⚒️ CRAFT NOW</button>` : ''}
    `;
    list.appendChild(card);
  });
}

function doCraft(recipeId) {
  const recipe = CRAFT_RECIPES.find(r => r.id === recipeId);
  if (!recipe) return;
  if (!recipe.ingredients.every(ing => ing.check())) return;
  // Consume ingredients
  recipe.ingredients.forEach(ing => ing.consume());
  // Add crafted monster
  if (!gameState.craftedMonsters) gameState.craftedMonsters = [];
  gameState.craftedMonsters.push(recipe.id);
  // Add to monster roster as a special entry
  const craftId = 100 + CRAFT_RECIPES.indexOf(recipe);
  if (!gameState.ownedMonsters.includes(craftId)) gameState.ownedMonsters.push(craftId);
  // Register in monsterRoster if not there
  if (!monsterRoster.find(m => m.id === craftId)) {
    monsterRoster.push({
      id: craftId, name: recipe.name, element: recipe.element, emoji: '⚒️',
      color: recipe.color, rarity: recipe.rarity, hp: recipe.hp, atk: recipe.atk,
      def: recipe.def, trait: recipe.trait, img: recipe.img,
      specialty: recipe.specialty, maxStages: 1, evoThresholds: [], evoBonus: {hp:0,atk:0,def:0,spd:0}, stageNames: [recipe.name],
    });
  }
  saveGame();
  playCraftAnimation(recipe);
}

function playCraftAnimation(recipe) {
  const overlay = document.getElementById('craft-overlay');
  const text = document.getElementById('craft-anim-text');
  const img = document.getElementById('craft-anim-img');
  const name = document.getElementById('craft-anim-name');
  const stats = document.getElementById('craft-anim-stats');
  const closeBtn = document.getElementById('craft-anim-close');
  overlay.style.display = 'flex'; text.style.opacity = '0'; img.style.opacity = '0';
  name.style.opacity = '0'; stats.style.opacity = '0'; closeBtn.style.display = 'none';
  img.src = recipe.img; img.style.filter = recipe.aura;
  // Phase 1: swirl text
  sfx.evolution();
  setTimeout(() => { text.textContent = 'CRAFTING...'; text.style.opacity = '1'; text.style.animation = 'evoSlam 0.4s ease-out'; }, 300);
  // Phase 2: flash
  setTimeout(() => { overlay.style.background = 'rgba(255,255,255,0.8)'; }, 1200);
  setTimeout(() => { overlay.style.background = 'rgba(0,0,0,0.95)'; }, 1400);
  // Phase 3: reveal
  setTimeout(() => {
    text.textContent = 'CREATION COMPLETE!'; text.style.color = recipe.rarity === 'DIVINE' ? '#ff6b6b' : '#f1c40f';
    text.style.animation = 'evoSlam 0.4s ease-out';
    evoSfxShinyFanfare();
  }, 1600);
  setTimeout(() => { img.style.opacity = '1'; img.style.animation = 'evoSlam 0.5s ease-out'; }, 2000);
  setTimeout(() => { name.textContent = recipe.name; name.style.opacity = '1'; name.style.color = recipe.color; }, 2500);
  setTimeout(() => { stats.textContent = `HP:${recipe.hp} ATK:${recipe.atk} DEF:${recipe.def} SPD:${recipe.spd}`; stats.style.opacity = '1'; }, 2800);
  setTimeout(() => { closeBtn.style.display = 'block'; }, 3200);
}

function closeCraftReveal() {
  document.getElementById('craft-overlay').style.display = 'none';
  renderCraftList();
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

  // Count copies of each monster
  const copyCount = {};
  for (const id of owned) copyCount[id] = (copyCount[id] || 0) + 1;

  let shinyCount = 0;
  monsterRoster.forEach(mon => {
    const count = copyCount[mon.id] || 0;
    const isOwned = count > 0;
    const isActive = mon.id === activeId;
    const monShiny = isShiny(mon.id);
    if (monShiny) shinyCount++;
    const card = document.createElement('div');
    card.className = 'collection-card' + (isActive ? ' active-mon' : '') + (!isOwned ? ' unowned' : '') + (monShiny ? ' shiny-card' : '');

    const starCount = mon.rarity === 'Legend' ? 4 : mon.rarity === 'Super Rare' ? 3 : mon.rarity === 'Rare' ? 2 : 1;
    const stars = '\u2B50'.repeat(starCount);

    const imgFilter = !isOwned ? 'filter:grayscale(100%) brightness(30%);' : (monShiny ? 'filter:' + getShinyFilter(mon.id) + ';' : '');
    const shinyBadge = monShiny ? '<div style="font-size:8px;color:#f1c40f;">✨ Shiny</div>' : '';
    const countBadge = count > 1 ? `<div style="font-size:8px;color:#00BFFF;font-weight:bold;">×${count}</div>` : '';
    const canRelease = isOwned && (gameState.ownedMonsters || []).length > 1;
    const releaseBtn = canRelease ? `<button onclick="event.stopPropagation();releaseMonster(${mon.id})" style="font-size:7px;padding:2px 6px;background:#e74c3c;color:#fff;border:none;border-radius:4px;cursor:pointer;margin-top:2px;">Release</button>` : '';
    card.innerHTML = `
      <div class="card-circle" style="background:${isOwned ? 'transparent' : mon.color};">
        <img src="${mon.img}" alt="${mon.name}" style="width:60px;height:60px;object-fit:contain;${imgFilter}">
      </div>
      <div class="card-name">${isOwned ? (monShiny ? '✨ ' : '') + mon.name : '???'}</div>
      <div class="card-rarity-stars">${isOwned ? stars : ''}</div>
      <div class="card-element">${isOwned ? mon.element : ''}</div>
      ${countBadge}
      ${shinyBadge}
      ${isActive ? '<div style="font-size:8px;color:#f1c40f;">ACTIVE</div>' : ''}
      ${releaseBtn}
    `;

    if (isOwned && !isActive) {
      card.onclick = () => setActiveMonster(mon.id);
    }
    grid.appendChild(card);
  });
  // Shiny counter
  const counterEl = document.getElementById('shiny-counter');
  if (counterEl) counterEl.textContent = 'Shinies: ' + shinyCount + '/10';
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

function releaseMonster(monId) {
  const owned = gameState.ownedMonsters || [];
  // Must keep at least 1 total monster
  if (owned.length <= 1) { alert('Cannot release your last monster!'); return; }
  const mon = monsterRoster.find(m => m.id === monId);
  const name = mon ? mon.name : 'Monster #' + monId;
  // Confirmation popup
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:200;display:flex;align-items:center;justify-content:center;';
  overlay.innerHTML = `<div style="background:#1a1a2e;border:2px solid #e74c3c;border-radius:12px;padding:20px;text-align:center;max-width:280px;color:#fff;">
    <p style="font-size:14px;margin-bottom:12px;">Release <b>${name}</b>?<br><span style="font-size:11px;color:#aaa;">This cannot be undone.</span></p>
    <button class="btn" style="background:#e74c3c;border-color:#c0392b;margin-right:8px;" onclick="confirmRelease(${monId});this.closest('div[style*=fixed]').remove();">YES, RELEASE</button>
    <button class="btn" onclick="this.closest('div[style*=fixed]').remove();">CANCEL</button>
  </div>`;
  document.body.appendChild(overlay);
}

function confirmRelease(monId) {
  const idx = gameState.ownedMonsters.indexOf(monId);
  if (idx < 0) return;
  gameState.ownedMonsters.splice(idx, 1);
  // Remove from team if present
  if (gameState.team) {
    for (let i = 0; i < gameState.team.length; i++) {
      if (gameState.team[i] === monId) gameState.team[i] = null;
    }
  }
  // If released active monster, switch to first available
  if (gameState.activeMonster === monId && !gameState.ownedMonsters.includes(monId)) {
    gameState.activeMonster = gameState.ownedMonsters[0] || 1;
    loadMonsterProgress(gameState.activeMonster);
  }
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
