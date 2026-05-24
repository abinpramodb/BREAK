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
  console.log('JSDOM loaded for tutorial test.');
  try {
    // Start tutorial
    console.log('Starting tutorial...');
    window.startTutorial();
    await new Promise(r => setTimeout(r, 600));

    const coach = window.document.getElementById('tut-coach');
    const msg = window.document.getElementById('tc-msg');
    const nextBtn = window.document.getElementById('tc-next');
    
    // Step 1: intro
    console.log(`Step 1 (ID: intro): "${msg.textContent}"`);
    if (!coach.classList.contains('open')) throw new Error('Coach panel not open');
    if (nextBtn.style.display === 'none') throw new Error('Next button should be visible');
    nextBtn.click();
    await new Promise(r => setTimeout(r, 200));

    // Step 2: hand-info
    console.log(`Step 2 (ID: hand-info): "${msg.textContent}"`);
    if (nextBtn.style.display === 'none') throw new Error('Next button should be visible');
    nextBtn.click();
    await new Promise(r => setTimeout(r, 200));

    // Step 3: tut-draw
    console.log(`Step 3 (ID: tut-draw): "${msg.textContent}"`);
    if (nextBtn.style.display !== 'none') throw new Error('Next button should not be visible');
    
    // Click deck pile to draw
    const deckPile = window.document.getElementById('deck-pile');
    console.log('Clicking deck pile...');
    deckPile.click();
    await new Promise(r => setTimeout(r, 200));

    // Step 4: power-intro
    console.log(`Step 4 (ID: power-intro): "${msg.textContent}"`);
    // Need to click the Thief card. In human hand, find the Thief card.
    const handCards = window.document.querySelectorAll('#pos-bottom .hand-card');
    let thiefCardIndex = -1;
    // Let's find which card has the "tcard-thief" id
    for (let i = 0; i < handCards.length; i++) {
      if (handCards[i].id === 'tcard-thief') {
        thiefCardIndex = i;
        break;
      }
    }
    if (thiefCardIndex === -1) throw new Error('Thief card not found in player hand');
    console.log(`Clicking Thief card (index ${thiefCardIndex})...`);
    handCards[thiefCardIndex].click();
    await new Promise(r => setTimeout(r, 500));

    // Step 5: activate
    console.log(`Step 5 (ID: activate): "${msg.textContent}"`);
    const btnPower = window.document.getElementById('btn-power');
    if (btnPower.disabled) throw new Error('Expected Activate Power button to be enabled');
    console.log('Clicking Activate Power button...');
    btnPower.click();
    await new Promise(r => setTimeout(r, 200));

    // Step 6: pick-tgt
    console.log(`Step 6 (ID: pick-tgt): "${msg.textContent}"`);
    // Target modal should be open
    const tmod = window.document.getElementById('tmod');
    if (!tmod.classList.contains('open')) throw new Error('Expected target modal to be open');
    const tbtn = window.document.querySelector('#tm-list .tbtn');
    if (!tbtn) throw new Error('No target buttons found in modal');
    console.log('Picking Alex in target modal...');
    tbtn.click();
    await new Promise(r => setTimeout(r, 500));

    // Step 7: stole-info
    console.log(`Step 7 (ID: stole-info): "${msg.textContent}"`);
    if (nextBtn.style.display === 'none') throw new Error('Next button should be visible');
    nextBtn.click();
    await new Promise(r => setTimeout(r, 200));

    // Step 8: reveal-intro
    console.log(`Step 8 (ID: reveal-intro): "${msg.textContent}"`);
    // Step 8: reveal-intro
    console.log(`Step 8 (ID: reveal-intro): "${msg.textContent}"`);
    const cardElms = window.document.querySelectorAll('#pos-bottom .hand-card');
    console.log("Rendered card count:", cardElms.length);
    cardElms.forEach((el, idx) => {
      console.log(`Card ${idx}:`, el.innerHTML.replace(/<[^>]+>/g, ' ').trim());
    });
    const btnReveal = window.document.getElementById('btn-reveal');
    if (btnReveal.disabled) throw new Error('Expected Reveal Sequence button to be enabled');
    console.log('Clicking Reveal Sequence button...');
    btnReveal.click();
    await new Promise(r => setTimeout(r, 500));

    // Step 9: ai-turn
    console.log(`Step 9 (ID: ai-turn): "${msg.textContent}"`);
    console.log('Waiting for Alex\'s turn to process...');
    await new Promise(r => setTimeout(r, 3500));

    // Step 10: done
    console.log(`Step 10 (ID: done): "${msg.textContent}"`);
    if (nextBtn.style.display === 'none') throw new Error('Next button should be visible');
    console.log('Clicking play real game to complete tutorial...');
    nextBtn.click();
    await new Promise(r => setTimeout(r, 500));

    // Should return to splash screen
    const splash = window.document.getElementById('splash');
    if (splash.style.display === 'none') throw new Error('Expected splash screen to be visible');
    
    console.log('SUCCESS: Tutorial walkthrough runs perfectly without getting stuck!');
    process.exit(0);
  } catch (err) {
    console.error('FAIL:', err);
    process.exit(1);
  }
}, 500);
