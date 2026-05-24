const fs = require('fs');
const path = require('path');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;

const htmlPath = path.join(__dirname, 'index.html');
const htmlContent = fs.readFileSync(htmlPath, 'utf8');

const virtualConsole = new jsdom.VirtualConsole();
virtualConsole.on('log', (...args) => console.log('[LOG]', ...args));
virtualConsole.on('error', (...args) => console.error('[ERROR]', ...args));
virtualConsole.on('warn', (...args) => console.warn('[WARN]', ...args));

const dom = new JSDOM(htmlContent, {
  resources: 'usable',
  runScripts: 'dangerously',
  virtualConsole,
  beforeParse(window) {
    window.requestAnimationFrame = (callback) => setTimeout(callback, 16);
    window.HTMLCanvasElement.prototype.getContext = () => ({
      clearRect: () => {},
      beginPath: () => {},
      arc: () => {},
      fill: () => {},
      fillStyle: ''
    });
  }
});

const { window } = dom;

setTimeout(async () => {
  console.log('JSDOM loaded for Power Swap testing.');
  try {
    // Start game with 1 AI
    window.startGame(1);
    
    // Expose local scopes using eval
    window.eval(`
      window.getG = () => G;
      window.getPSS = () => PSS;
      window.setPSS = (val) => { PSS = val; };
    `);

    const G = window.getG();
    if (!G) {
      throw new Error("Could not find global G object");
    }

    console.log("Global game state G successfully retrieved.");

    // --- TEST 1: Cancel attack using Power Swap ---
    console.log("--- TEST 1: Cancel attack using Power Swap ---");
    
    // Reset hands
    const human = G.players[0];
    const ai = G.players[1];
    
    // Give Human a Power Swap card and some character cards
    human.hand = [
      { id: 101, k: 'char', fam: 'royal', rank: 'King', rnum: 3, name: 'King' },
      { id: 102, k: 'char', fam: 'royal', rank: 'Queen', rnum: 2, name: 'Queen' },
      { id: 103, k: 'char', fam: 'royal', rank: 'Prince', rnum: 1, name: 'Prince' },
      { id: 104, k: 'pow', t: 'psw', name: 'Power Swap', col: '#F59E0B' }
    ];
    
    // Give AI a Thief card
    ai.hand = [
      { id: 201, k: 'char', fam: 'justice', rank: 'Judge', rnum: 3, name: 'Judge' },
      { id: 202, k: 'char', fam: 'justice', rank: 'Police', rnum: 1, name: 'Police' },
      { id: 203, k: 'pow', t: 'thief', name: 'Thief', sacks: 1 }
    ];

    // Set active player to AI
    G.ci = 1;
    
    // Trigger AI playing Thief card targeting Human (idx 0)
    console.log("AI playing Thief card on Human...");
    G.pp = { atk: 1, ci: 2, card: ai.hand[2] };
    
    // Call initiateThief(atkIdx, tIdx, sacks)
    window.initiateThief(1, 0, 1);

    // Verify that the Power Swap prompt is open
    const psmod = window.document.getElementById('psmod');
    if (!psmod.classList.contains('open')) {
      throw new Error("Expected Power Swap modal to be open");
    }
    console.log("Power Swap modal is open.");

    // Human clicks Cancel Attack
    console.log("Human choosing Cancel Attack...");
    window.cancelPowerSwap();

    // Verify that:
    // - Power Swap card is discarded
    // - Thief card is discarded
    // - Human hand has 3 cards (did not lose anything to thief)
    // - PSS is cleared
    // - G.pp is cleared
    console.log("Verifying hand sizes and states...");
    if (human.hand.some(c => c.t === 'psw')) {
      throw new Error("Power Swap card was not removed from Human hand");
    }
    if (ai.hand.some(c => c.t === 'thief')) {
      throw new Error("Thief card was not removed from AI hand");
    }
    if (human.hand.length !== 3) {
      throw new Error(`Expected Human hand length 3, got ${human.hand.length}`);
    }
    if (window.getPSS() !== null) {
      throw new Error("PSS was not cleared");
    }
    if (G.pp !== null) {
      throw new Error("G.pp was not cleared");
    }
    console.log("PASSED: Cancel Attack works perfectly.");

    // --- TEST 2: No penalty on next turn after Redirect ---
    console.log("--- TEST 2: No penalty on next turn after Redirect ---");
    
    // Reset hands again
    human.hand = [
      { id: 101, k: 'char', fam: 'royal', rank: 'King', rnum: 3, name: 'King' },
      { id: 102, k: 'char', fam: 'royal', rank: 'Queen', rnum: 2, name: 'Queen' },
      { id: 103, k: 'char', fam: 'royal', rank: 'Prince', rnum: 1, name: 'Prince' },
      { id: 105, k: 'pow', t: 'psw', name: 'Power Swap', col: '#F59E0B' }
    ];
    ai.hand = [
      { id: 201, k: 'char', fam: 'justice', rank: 'Judge', rnum: 3, name: 'Judge' },
      { id: 202, k: 'char', fam: 'justice', rank: 'Police', rnum: 1, name: 'Police' },
      { id: 204, k: 'pow', t: 'thief', name: 'Thief', sacks: 1 }
    ];

    G.ci = 1; // AI turn
    G.pp = { atk: 1, ci: 2, card: ai.hand[2] };
    window.initiateThief(1, 0, 1);

    if (!psmod.classList.contains('open')) {
      throw new Error("Expected Power Swap modal to be open for redirection test");
    }

    // Human clicks Use Power Swap (Redirect)
    console.log("Human choosing Redirect...");
    window.usePowerSwap();

    // Verify Redirect targets modal is open
    const tmod = window.document.getElementById('tmod');
    if (!tmod.classList.contains('open')) {
      throw new Error("Expected target modal to be open for redirection target selection");
    }

    // Select AI as redirect target
    console.log("Redirecting attack back to AI...");
    window.redirectPS(1);

    // Verify that:
    // - Power Swap card is discarded
    // - Thief card is played on AI
    // - PSS is cleared
    // - G.pp is cleared
    console.log("Verifying states post-redirection...");
    if (human.hand.some(c => c.t === 'psw')) {
      throw new Error("Power Swap card was not removed from Human hand");
    }
    if (window.getPSS() !== null) {
      throw new Error("PSS was not cleared");
    }
    if (G.pp !== null) {
      throw new Error("G.pp was not cleared");
    }

    // Now, verify that Human does not have any turn skip penalty on their next turn!
    console.log("Advancing turn to Human...");
    G.ci = 0; // Human index
    window.startTurn();

    // Since penalty is removed, Human turn should start in 'play' phase, not end immediately
    console.log(`Current phase: ${G.phase}`);
    if (G.phase !== 'play') {
      throw new Error(`Expected G.phase to be 'play', got ${G.phase}`);
    }
    console.log("PASSED: No turn-skipping penalty applied after Redirect.");

    console.log("SUCCESS: Power Swap rule updates verified successfully!");
    process.exit(0);
  } catch (err) {
    console.error("FAIL:", err);
    process.exit(1);
  }
}, 500);
