const fs = require('fs');
const path = require('path');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;

const htmlPath = path.join(__dirname, 'index.html');
const htmlContent = fs.readFileSync(htmlPath, 'utf8');

// We need to provide a mock for requestAnimationFrame and canvas in JSDOM
const virtualConsole = new jsdom.VirtualConsole();
virtualConsole.on('log', (...args) => console.log(...args));
virtualConsole.on('error', (...args) => console.error(...args));
virtualConsole.on('warn', (...args) => console.warn(...args));
virtualConsole.on('jsdomError', (...args) => console.error(...args));

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

// Wait for scripts to load and run
setTimeout(async () => {
  console.log('JSDOM window loaded.');
  
  // Verify that the global state objects are defined
  if (typeof window.startGame !== 'function') {
    console.error('FAIL: startGame function is not defined.');
    process.exit(1);
  }
  console.log('PASS: startGame is defined.');
  
  try {
    // 1. Test starting a game with 1 AI
    console.log('Testing startGame(1)...');
    window.startGame(1);
    
    // Check if DOM updated with player name and cards
    const turnName = window.document.getElementById('tname').textContent;
    if (turnName === '—') {
      console.error('FAIL: Turn player name not updated in header.');
      process.exit(1);
    }
    console.log('PASS: Game successfully started with 1 AI. Turn name:', turnName);
    
    // Check if bottom zone (player hand) has cards rendered
    const handCards = window.document.querySelectorAll('#pos-bottom .hand-card');
    if (handCards.length === 0) {
      console.error('FAIL: No hand cards rendered for Human player.');
      process.exit(1);
    }
    console.log('PASS: Human player cards rendered in DOM. Count:', handCards.length);
    
    // Check if the game UI became active
    const gameDiv = window.document.getElementById('game');
    if (!gameDiv.classList.contains('active')) {
      console.error('FAIL: Game element does not have active class.');
      process.exit(1);
    }
    console.log('PASS: Game container active.');
    
    // 2. Test starting the tutorial
    console.log('Testing startTutorial()...');
    window.startTutorial();
    
    // Wait slightly for setTimeout in startTutorial to trigger showPTutStep
    await new Promise(r => setTimeout(r, 600));
    
    const coach = window.document.getElementById('tut-coach');
    const stepLabel = window.document.getElementById('tc-step').textContent;
    if (!coach.classList.contains('open') || !stepLabel.includes('Step 1 of')) {
      console.error('FAIL: Tutorial coach panel did not open correctly. Step Label:', stepLabel);
      process.exit(1);
    }
    console.log('PASS: Tutorial active and coach panel open at Step 1.');
    
    // 3. Test opening the manual tutorial modal
    console.log('Testing openTutorial()...');
    window.openTutorial();
    const tutModal = window.document.getElementById('tut-modal');
    if (!tutModal.classList.contains('open')) {
      console.error('FAIL: Tutorial modal did not open.');
      process.exit(1);
    }
    console.log('PASS: Manual tutorial modal opened.');
    
    console.log('All tests passed successfully in JSDOM!');
    process.exit(0);
  } catch (err) {
    console.error('Runtime exception caught during testing:\n', err);
    process.exit(1);
  }
}, 500);
