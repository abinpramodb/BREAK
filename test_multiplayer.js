const child_process = require('child_process');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const ws = require('ws');

const htmlPath = path.join(__dirname, 'index.html');
const htmlContent = fs.readFileSync(htmlPath, 'utf8');

console.log('Starting WebSocket/HTTP server on port 8085...');
const serverProc = child_process.spawn('node', ['server.js'], {
  env: { ...process.env, PORT: '8085' }
});

let serverOutput = '';
serverProc.stdout.on('data', (data) => {
  serverOutput += data.toString();
  console.log('[SERVER]', data.toString().trim());
});
serverProc.stderr.on('data', (data) => {
  console.error('[SERVER-ERR]', data.toString().trim());
});

setTimeout(async () => {
  try {
    console.log('Initializing Client A (Host)...');
    const winA = createClientWindow('Alice', htmlContent);
    await sleep(200);

    console.log('Initializing Client B (Friend)...');
    const winB = createClientWindow('Bob', htmlContent);
    await sleep(200);

    // Alice: Enter name and Create Room
    winA.document.getElementById('mp-name-input').value = 'Alice';
    winA.mpCreateRoom();
    
    // Wait for room to be created and code to appear
    await sleep(500);
    const code = winA.document.getElementById('lobby-code-val').textContent.trim();
    console.log(`Room created with code: "${code}"`);
    if (!code || code === '----' || code.length !== 4) {
      throw new Error(`Invalid room code: ${code}`);
    }

    // Bob: Enter name, enter room code, and Join Room
    winB.document.getElementById('mp-name-input').value = 'Bob';
    winB.document.getElementById('mp-code-input').value = code;
    winB.mpJoinRoom();

    // Wait for Bob to join
    await sleep(500);

    // Verify both players are in lobby lists
    const listA = winA.document.getElementById('lobby-players-list').textContent;
    const listB = winB.document.getElementById('lobby-players-list').textContent;
    console.log(`Lobby list A: "${listA.trim()}"`);
    console.log(`Lobby list B: "${listB.trim()}"`);
    
    if (!listA.includes('Alice') || !listA.includes('Bob')) {
      throw new Error('Alice or Bob missing in Alice\'s lobby list');
    }
    if (!listB.includes('Alice') || !listB.includes('Bob')) {
      throw new Error('Alice or Bob missing in Bob\'s lobby list');
    }

    // Alice (Host) clicks Start Game
    console.log('Alice: Starting game...');
    winA.mpStartGame();
    await sleep(500);

    // Verify game started on both screens
    const splashA = winA.document.getElementById('splash');
    const splashB = winB.document.getElementById('splash');
    const gameA = winA.document.getElementById('game');
    const gameB = winB.document.getElementById('game');

    if (splashA.style.display !== 'none' || !gameA.classList.contains('active')) {
      throw new Error('Game did not start on Client A');
    }
    if (splashB.style.display !== 'none' || !gameB.classList.contains('active')) {
      throw new Error('Game did not start on Client B');
    }
    console.log('Game screens activated on both clients.');

    // Retrieve state objects G
    const GA = winA.eval("G");
    const GB = winB.eval("G");
    console.log('G object multiplayer status:', GA.isMultiplayer, GB.isMultiplayer);
    console.log('Client indexes - Alice:', GA.myIdx, 'Bob:', GB.myIdx);
    
    if (!GA.isMultiplayer || !GB.isMultiplayer) {
      throw new Error('G.isMultiplayer not set to true');
    }

    // Verify clockwise layout displays other human names
    // Alice's screen top zone should show Bob
    const zoneTopA = winA.document.querySelector('#pos-top .zone-name').textContent;
    console.log(`Alice's top zone name: "${zoneTopA.trim()}"`);
    if (!zoneTopA.includes('Bob')) {
      throw new Error('Alice\'s top player zone does not display Bob');
    }

    // Bob's screen top zone should show Alice
    const zoneTopB = winB.document.querySelector('#pos-top .zone-name').textContent;
    console.log(`Bob's top zone name: "${zoneTopB.trim()}"`);
    if (!zoneTopB.includes('Alice')) {
      throw new Error('Bob\'s top player zone does not display Alice');
    }

    // Clean up
    winA.close();
    winB.close();
    serverProc.kill();
    console.log('SUCCESS: Multiplayer match simulation passed!');
    process.exit(0);

  } catch (err) {
    console.error('FAIL:', err);
    serverProc.kill();
    process.exit(1);
  }
}, 1500);

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function createClientWindow(name, htmlContent) {
  const dom = new JSDOM(htmlContent, {
    resources: 'usable',
    runScripts: 'dangerously',
    url: 'http://localhost:8085/',
    beforeParse(window) {
      window.requestAnimationFrame = (callback) => setTimeout(callback, 16);
      window.HTMLCanvasElement.prototype.getContext = () => ({
        clearRect: () => {},
        beginPath: () => {},
        arc: () => {},
        fill: () => {},
        fillStyle: ''
      });
      window.WebSocket = ws;
    }
  });
  return dom.window;
}
