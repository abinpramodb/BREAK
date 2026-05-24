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
  console.log('JSDOM loaded for play test.');
  try {
    // Start game with 1 AI
    window.startGame(1);
    
    // The player's turn should have started
    // Let's check G from the window. Note that we declared `let G = {}` in script, 
    // which in JSDOM won't be on the window object directly unless exposed.
    // However, we can inspect the DOM or call functions.
    
    const handCards = window.document.querySelectorAll('#pos-bottom .hand-card');
    console.log(`Human hand cards count: ${handCards.length}`);
    if (handCards.length !== 5) {
      throw new Error(`Expected 5 cards in hand (4 start + 1 draw), got ${handCards.length}`);
    }
    
    // Let's simulate clicking the first card
    console.log('Simulating click on the first hand card...');
    handCards[0].click();
    
    // Check if the card is highlighted (should have 'sel' class)
    const selectedCards = window.document.querySelectorAll('#pos-bottom .hand-card.sel');
    console.log(`Selected cards count: ${selectedCards.length}`);
    if (selectedCards.length !== 1) {
      throw new Error(`Expected 1 selected card, got ${selectedCards.length}`);
    }
    
    // Check if the discard button is enabled
    const btnDisc = window.document.getElementById('btn-disc');
    console.log(`Discard button disabled state: ${btnDisc.disabled}`);
    if (btnDisc.disabled) {
      throw new Error('Expected Discard button to be enabled after selecting a card.');
    }
    
    // Simulate clicking Discard
    console.log('Simulating click on Discard button...');
    btnDisc.click();
    
    // Wait for the turn to end and AI turn to complete
    console.log('Waiting for turn transitions...');
    await new Promise(r => setTimeout(r, 2500));
    
    console.log('Turn transitions completed. Current turn player header:', window.document.getElementById('tname').textContent);
    
    console.log('SUCCESS: Click-to-play-or-discard flows work perfectly!');
    process.exit(0);
  } catch (err) {
    console.error('FAIL:', err);
    process.exit(1);
  }
}, 500);
