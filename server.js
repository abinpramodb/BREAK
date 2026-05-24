const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

// ========== CONSTANTS & RULES ==========
const FAM = {
  royal:     { name:'Royal Dynasty',    emoji:'👑', ranks:['King','Queen','Prince','Princess'] },
  political: { name:'Political Order',  emoji:'🏛️', ranks:['President','Prime Minister','Minister','Mayor'] },
  justice:   { name:'Justice League',   emoji:'⚖️', ranks:['Judge','Lawyer','Police','People'] }
};

const PDEFS = [
  { st:'thief1', t:'thief', sacks:1, name:'Thief', sub:'1 Sack',     ico:'🎒',  col:'#A78BFA', bg:'rgba(167,139,250,0.18)', cnt:3 },
  { st:'thief2', t:'thief', sacks:2, name:'Thief', sub:'2 Sacks',    ico:'🎒🎒', col:'#A78BFA', bg:'rgba(167,139,250,0.18)', cnt:3 },
  { st:'thief3', t:'thief', sacks:3, name:'Thief', sub:'3 Sacks',    ico:'🎒🎒🎒',col:'#A78BFA', bg:'rgba(167,139,250,0.18)', cnt:2 },
  { st:'swap',   t:'swap',  sacks:0, name:'Swap',  sub:'Exchange Hands',ico:'🔄', col:'#06B6D4', bg:'rgba(6,182,212,0.18)',   cnt:4 },
  { st:'break',  t:'break', sacks:0, name:'BREAK', sub:'Destroy & Redraw',ico:'💥', col:'#EF4444', bg:'rgba(239,68,68,0.18)',  cnt:4 },
  { st:'psw',    t:'psw',   sacks:0, name:'Power Swap',sub:'Defend & Counter',ico:'🛡️', col:'#F59E0B', bg:'rgba(245,158,11,0.18)',cnt:3 }
];

const shuffle = a => { const b=[...a]; for(let i=b.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]];} return b; };
const spliceRnd = a => { if(!a.length)return null; const i=Math.floor(Math.random()*a.length); return a.splice(i,1)[0]; };

function mkDeck() {
  const cards=[]; let id=0;
  for(const [fam,fd] of Object.entries(FAM)) {
    for(let r=0;r<fd.ranks.length;r++) {
      for(let c=0;c<3;c++) {
        cards.push({id:id++,k:'char',fam,rank:fd.ranks[r],rnum:3-r,name:fd.ranks[r]});
      }
    }
  }
  for(const pd of PDEFS) {
    for(let c=0;c<pd.cnt;c++) {
      cards.push({id:id++,k:'pow',t:pd.t,st:pd.st,sacks:pd.sacks,name:pd.name,sub:pd.sub,ico:pd.ico,col:pd.col,bg:pd.bg});
    }
  }
  return shuffle(cards);
}

function getHandSequence(hand) {
  for (const [famId, fam] of Object.entries(FAM)) {
    const hasAll = fam.ranks.every(rank => hand.some(c => c.k === 'char' && c.fam === famId && c.rank === rank));
    if (hasAll) return famId;
  }
  return null;
}

// ========== HTTP SERVER ==========
const server = http.createServer((req, res) => {
  let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
  // Restrict to project files
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end('Access Denied');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  let contentType = 'text/html';
  if (ext === '.css') contentType = 'text/css';
  else if (ext === '.js') contentType = 'application/javascript';
  else if (ext === '.png') contentType = 'image/png';
  else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
  else if (ext === '.svg') contentType = 'image/svg+xml';
  else if (ext === '.ico') contentType = 'image/x-icon';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404);
        res.end('Not Found');
      } else {
        res.writeHead(500);
        res.end('Internal Server Error: ' + err.code);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

// ========== MULTIPLAYER STATE ==========
const rooms = new Map(); // roomCode -> room object

function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let code;
  do {
    code = '';
    for (let i = 0; i < 4; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
  } while (rooms.has(code));
  return code;
}

// ========== WEBSOCKET SERVER ==========
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  let playerObj = null;
  let roomObj = null;

  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg);
      handleMessage(ws, data);
    } catch (e) {
      console.error('Error handling WebSocket message:', e);
    }
  });

  ws.on('close', () => {
    if (roomObj && playerObj) {
      console.log(`Player ${playerObj.name} disconnected from room ${roomObj.code}`);
      const idx = roomObj.players.indexOf(playerObj);
      if (idx >= 0) {
        roomObj.players.splice(idx, 1);
      }

      if (roomObj.players.length === 0) {
        console.log(`Room ${roomObj.code} is empty. Deleting.`);
        rooms.delete(roomObj.code);
      } else {
        // If host disconnected, assign a new host
        if (playerObj.isHost) {
          roomObj.players[0].isHost = true;
        }

        if (roomObj.started) {
          // If game started, notify everyone and reset to lobby
          roomObj.started = false;
          broadcastToRoom(roomObj, {
            type: 'log',
            message: `⚠️ ${playerObj.name} disconnected. Returning to lobby.`
          });
          broadcastLobbyUpdate(roomObj);
        } else {
          broadcastLobbyUpdate(roomObj);
        }
      }
    }
  });

  function handleMessage(ws, data) {
    switch (data.type) {
      case 'join_lobby': {
        const name = (data.name || 'Anonymous').trim().substring(0, 10);
        let code = (data.code || '').trim().toUpperCase();

        if (code) {
          // Join existing room
          if (!rooms.has(code)) {
            ws.send(JSON.stringify({ type: 'error', message: 'Room not found.' }));
            return;
          }
          roomObj = rooms.get(code);
          if (roomObj.started) {
            ws.send(JSON.stringify({ type: 'error', message: 'Game already started in this room.' }));
            return;
          }
          if (roomObj.players.length >= 4) {
            ws.send(JSON.stringify({ type: 'error', message: 'Room is full (max 4 players).' }));
            return;
          }
          playerObj = {
            ws,
            name,
            isHost: false,
            hand: [],
            elim: false,
            monkey: false,
            supr: false,
            winP: false
          };
          roomObj.players.push(playerObj);
        } else {
          // Create new room
          code = generateRoomCode();
          roomObj = {
            code,
            players: [],
            started: false,
            deck: [],
            discard: [],
            ci: 0,
            phase: 'play',
            wpIdx: null,
            wturns: 0,
            pp: null,
            log: [],
            fe: null,
            winner: null,
            PSS: null,
            turns: 0
          };
          playerObj = {
            ws,
            name,
            isHost: true,
            hand: [],
            elim: false,
            monkey: false,
            supr: false,
            winP: false
          };
          roomObj.players.push(playerObj);
          rooms.set(code, roomObj);
        }

        console.log(`Player ${name} joined room ${code}`);
        broadcastLobbyUpdate(roomObj);
        break;
      }

      case 'start_game': {
        if (!roomObj || !playerObj || !playerObj.isHost) return;
        if (roomObj.players.length < 2) {
          ws.send(JSON.stringify({ type: 'error', message: 'Need at least 2 players to start.' }));
          return;
        }

        // Initialize game
        roomObj.started = true;
        roomObj.deck = mkDeck();
        roomObj.discard = [];
        roomObj.ci = roomObj.players.findIndex(p => p.supr);
        if (roomObj.ci < 0) roomObj.ci = 0;
        roomObj.phase = 'play';
        roomObj.wpIdx = null;
        roomObj.wturns = 0;
        roomObj.pp = null;
        roomObj.PSS = null;
        roomObj.fe = null;
        roomObj.winner = null;
        roomObj.turns = 0;
        roomObj.log = ['Game started! Draw phase activated.'];

        // Reset player hand states
        roomObj.players.forEach(p => {
          p.hand = [];
          p.elim = false;
          p.winP = false;
        });

        // Deal 4 cards to each player
        for (let i = 0; i < 4; i++) {
          roomObj.players.forEach(p => {
            p.hand.push(roomObj.deck.pop());
          });
        }

        startTurn(roomObj);
        break;
      }

      case 'discard': {
        if (!roomObj || !roomObj.started) return;
        const playerIdx = roomObj.players.indexOf(playerObj);
        if (playerIdx !== roomObj.ci || roomObj.phase !== 'play') return;

        const cardId = data.cardId;
        const handIdx = playerObj.hand.findIndex(c => c.id === cardId);
        if (handIdx < 0) return;

        const card = playerObj.hand.splice(handIdx, 1)[0];
        roomObj.discard.push(card);
        addLog(roomObj, `${playerObj.name} discarded ${card.name}.`);

        endTurn(roomObj);
        break;
      }

      case 'play_power': {
        if (!roomObj || !roomObj.started) return;
        const playerIdx = roomObj.players.indexOf(playerObj);
        if (playerIdx !== roomObj.ci || roomObj.phase !== 'play') return;

        const cardId = data.cardId;
        const handIdx = playerObj.hand.findIndex(c => c.id === cardId);
        if (handIdx < 0) return;

        const card = playerObj.hand[handIdx];
        if (card.k !== 'pow' || card.t === 'psw') return;

        const targetIdx = data.targetIdx;

        roomObj.pp = {
          atk: playerIdx,
          ci: handIdx,
          card,
          targetIdx,
          swapMode: data.swapMode,
          swapTargetBIdx: data.swapTargetBIdx
        };

        // Check for defensive Power Swap
        if (card.t === 'swap' && data.swapMode === 'others') {
          // Double target swap cannot be power swapped by the caster, but does it target others?
          // Rules check: Swap two others can be countered by any of the two targets?
          // Normally, defensive Power Swap targets the direct attack target.
          // Let's check both targets for Power Swap.
          const targetA = roomObj.players[targetIdx];
          const targetB = roomObj.players[data.swapTargetBIdx];
          const hasPSA = targetA.hand.findIndex(c => c.t === 'psw');
          const hasPSB = targetB.hand.findIndex(c => c.t === 'psw');

          if (hasPSA >= 0) {
            triggerPowerSwap(roomObj, targetIdx, hasPSA);
          } else if (hasPSB >= 0) {
            triggerPowerSwap(roomObj, data.swapTargetBIdx, hasPSB);
          } else {
            applyPowerAction(roomObj);
          }
        } else {
          // Single target power cards (Thief, Break, Swap Self)
          const target = roomObj.players[targetIdx];
          const hasPS = target.hand.findIndex(c => c.t === 'psw');
          if (hasPS >= 0) {
            triggerPowerSwap(roomObj, targetIdx, hasPS);
          } else {
            applyPowerAction(roomObj);
          }
        }
        break;
      }

      case 'counter_response': {
        if (!roomObj || !roomObj.started || roomObj.phase !== 'psw') return;
        if (!roomObj.PSS) return;
        const playerIdx = roomObj.players.indexOf(playerObj);
        if (playerIdx !== roomObj.PSS.tIdx) return;

        const action = data.action; // 'cancel', 'skip', 'redirect'

        if (action === 'cancel') {
          // Discard Power Swap
          playerObj.hand.splice(roomObj.PSS.pi, 1);
          roomObj.discard.push({ k: 'pow', t: 'psw', name: 'Power Swap', col: '#F59E0B' });

          addLog(roomObj, `🛡️ ${playerObj.name} used Power Swap to cancel the attack from ${roomObj.players[roomObj.PSS.atkIdx].name}!`);
          discardPP(roomObj);
          roomObj.PSS = null;
          roomObj.phase = 'play';
          advanceTurn(roomObj);
          syncGameState(roomObj);
        } else if (action === 'skip') {
          // Skip countering, apply the action
          const { atkIdx, tIdx, action: attackAction, param } = roomObj.PSS;
          roomObj.PSS = null;
          roomObj.phase = 'play';
          executePower(roomObj, atkIdx, tIdx, attackAction, param);
        } else if (action === 'redirect') {
          // Redirect to target
          const redirectTargetIdx = data.redirectTargetIdx;
          if (redirectTargetIdx === roomObj.PSS.tIdx) return; // Cannot redirect to oneself

          // Discard Power Swap
          playerObj.hand.splice(roomObj.PSS.pi, 1);
          roomObj.discard.push({ k: 'pow', t: 'psw', name: 'Power Swap', col: '#F59E0B' });

          addLog(roomObj, `🛡️ ${playerObj.name} used Power Swap → redirected to ${roomObj.players[redirectTargetIdx].name}!`);

          // Check if new target has Power Swap recursively
          const newTargetObj = roomObj.players[redirectTargetIdx];
          const hasPS = newTargetObj.hand.findIndex(c => c.t === 'psw');
          if (hasPS >= 0) {
            // Update PSS and prompt them
            roomObj.PSS = {
              atkIdx: roomObj.PSS.atkIdx,
              tIdx: redirectTargetIdx,
              action: roomObj.PSS.action,
              param: roomObj.PSS.param,
              pi: hasPS
            };
            syncGameState(roomObj);
          } else {
            // Apply action to new target
            const { atkIdx, action: attackAction, param } = roomObj.PSS;
            roomObj.PSS = null;
            roomObj.phase = 'play';
            executePower(roomObj, atkIdx, redirectTargetIdx, attackAction, param);
          }
        }
        break;
      }

      case 'reveal': {
        if (!roomObj || !roomObj.started) return;
        const playerIdx = roomObj.players.indexOf(playerObj);
        if (playerIdx !== roomObj.ci || roomObj.phase !== 'play') return;

        const famId = getHandSequence(playerObj.hand);
        if (!famId) return;

        // Discard extra 5th card
        const seqRanks = [...FAM[famId].ranks];
        const discarded = [];
        const kept = [];
        for (const card of playerObj.hand) {
          const idx = seqRanks.indexOf(card.rank);
          if (card.k === 'char' && card.fam === famId && idx >= 0) {
            kept.push(card);
            seqRanks.splice(idx, 1);
          } else {
            discarded.push(card);
          }
        }

        if (discarded.length > 0) {
          const discCard = discarded[0];
          const handIdx = playerObj.hand.indexOf(discCard);
          if (handIdx >= 0) playerObj.hand.splice(handIdx, 1);
          roomObj.discard.push(discCard);
          addLog(roomObj, `${playerObj.name} discarded ${discCard.name} to complete the sequence.`);
        }

        playerObj.winP = true;
        roomObj.wpIdx = playerIdx;
        const others = roomObj.players.filter(x => !x.elim && x.idx !== playerIdx);
        roomObj.wturns = others.length;

        addLog(roomObj, `⭐ ${playerObj.name} has revealed a winning sequence of ${FAM[famId].name}! ${roomObj.wturns} turn(s) to survive!`);

        advanceTurn(roomObj);
        syncGameState(roomObj);
        break;
      }

      case 'restart': {
        if (!roomObj || !playerObj || !playerObj.isHost) return;
        // Reshuffle and start game
        roomObj.started = true;
        roomObj.deck = mkDeck();
        roomObj.discard = [];
        roomObj.ci = roomObj.players.findIndex(p => p.supr);
        if (roomObj.ci < 0) roomObj.ci = 0;
        roomObj.phase = 'play';
        roomObj.wpIdx = null;
        roomObj.wturns = 0;
        roomObj.pp = null;
        roomObj.PSS = null;
        roomObj.fe = null;
        roomObj.winner = null;
        roomObj.turns = 0;
        roomObj.log = ['New game started!'];

        roomObj.players.forEach(p => {
          p.hand = [];
          p.elim = false;
          p.winP = false;
        });

        for (let i = 0; i < 4; i++) {
          roomObj.players.forEach(p => {
            p.hand.push(roomObj.deck.pop());
          });
        }

        startTurn(roomObj);
        break;
      }

      case 'leave': {
        ws.close();
        break;
      }
    }
  }
});

// ========== GAME LOGIC CORE ==========
function startTurn(room) {
  const p = room.players[room.ci];
  room.turns++;

  if (room.deck.length > 0) {
    p.hand.push(room.deck.pop());
    addLog(room, `${p.name} drew a card.`);
  } else {
    addLog(room, 'Deck empty — no draw.');
  }

  if (p.hand.length === 0 && room.deck.length === 0) {
    addLog(room, `${p.name} has no cards — eliminated!`);
    eliminatePlayer(room, p);
    if (checkFinalWin(room)) return;
    advanceTurn(room);
    syncGameState(room);
    return;
  }

  room.phase = 'play';
  syncGameState(room);
}

function triggerPowerSwap(room, targetIdx, psIndex) {
  room.phase = 'psw';
  const atkIdx = room.pp.atk;
  const card = room.pp.card;
  room.PSS = {
    atkIdx,
    tIdx: targetIdx,
    action: card.t,
    param: card.sacks,
    pi: psIndex
  };
  syncGameState(room);
}

function applyPowerAction(room) {
  const pp = room.pp;
  room.phase = 'play';
  room.pp = null;
  executePower(room, pp.atk, pp.targetIdx, pp.card.t, pp.card.sacks, pp.swapMode, pp.swapTargetBIdx);
}

function executePower(room, atkIdx, tIdx, action, param, swapMode, swapTargetBIdx) {
  const atk = room.players[atkIdx];
  const tgt = room.players[tIdx];

  if (action === 'thief') {
    const stolen = [];
    const cnt = Math.min(param, tgt.hand.length);
    for (let i = 0; i < cnt; i++) {
      const c = spliceRnd(tgt.hand);
      if (c) stolen.push(c);
    }
    atk.hand.push(...stolen);
    if (stolen.length) {
      addLog(room, `🎒 ${atk.name} stole ${stolen.length} card(s) from ${tgt.name}!`);
    } else {
      addLog(room, `${tgt.name} had no cards to steal.`);
    }
    checkElim(room, tgt);
    checkWinPendingDisrupted(room, tgt);
  } else if (action === 'break') {
    room.discard.push(...tgt.hand);
    tgt.hand = [];
    if (room.wpIdx === tgt.idx) {
      cancelWin(room, tgt, 'BREAK!');
    }
    const draw = Math.min(4, room.deck.length);
    for (let i = 0; i < draw; i++) {
      tgt.hand.push(room.deck.pop());
    }
    addLog(room, `💥 ${atk.name} used BREAK on ${tgt.name}!`);
    checkElim(room, tgt);
  } else if (action === 'swap') {
    if (swapMode === 'others') {
      const pA = room.players[tIdx];
      const pB = room.players[swapTargetBIdx];
      const tmp = pA.hand;
      pA.hand = pB.hand;
      pB.hand = tmp;
      addLog(room, `🔄 ${atk.name} swapped ${pA.name}'s & ${pB.name}'s hands!`);
      checkWinPendingDisrupted(room, pA);
      checkWinPendingDisrupted(room, pB);
    } else {
      const tmp = atk.hand;
      atk.hand = tgt.hand;
      tgt.hand = tmp;
      addLog(room, `🔄 ${atk.name} swapped hands with ${tgt.name}!`);
      checkWinPendingDisrupted(room, atk);
      checkWinPendingDisrupted(room, tgt);
    }
  }

  discardPP(room);
  advanceTurn(room);
  syncGameState(room);
}

function discardPP(room) {
  if (!room.pp) return;
  const cardId = room.pp.card.id;
  let found = false;
  for (const p of room.players) {
    const idx = p.hand.findIndex(c => c.id === cardId);
    if (idx >= 0) {
      room.discard.push(p.hand.splice(idx, 1)[0]);
      found = true;
      break;
    }
  }
  if (!found) {
    room.discard.push(room.pp.card);
  }
  room.pp = null;
}

function advanceTurn(room) {
  if (room.wpIdx !== null && room.ci !== room.wpIdx) {
    room.wturns--;
    if (room.wturns <= 0) {
      const wp = room.players[room.wpIdx];
      if (getHandSequence(wp.hand) !== null) {
        endGame(room, wp);
        return;
      } else {
        cancelWin(room, wp, 'disrupted');
      }
    }
  }

  if (checkFinalWin(room)) return;

  let next = (room.ci + 1) % room.players.length;
  let loops = 0;
  while (room.players[next].elim && loops < room.players.length) {
    next = (next + 1) % room.players.length;
    loops++;
  }
  room.ci = next;
  startTurn(room);
}

function checkFinalWin(room) {
  const alive = room.players.filter(p => !p.elim);
  if (alive.length <= 1) {
    endGame(room, alive[0] || room.players[0]);
    return true;
  }
  return false;
}

function checkElim(room, p) {
  if (p.hand.length === 0 && room.deck.length === 0) {
    eliminatePlayer(room, p);
  }
}

function eliminatePlayer(room, p) {
  p.elim = true;
  if (room.fe === null) {
    room.fe = room.players.indexOf(p);
    room.players.forEach(pl => pl.monkey = false);
    p.monkey = true;
    addLog(room, `🐒 ${p.name} gets the Monkey Card!`);
  }
  if (room.wpIdx === room.players.indexOf(p)) {
    cancelWin(room, p, 'eliminated');
  }
  if (room.wpIdx !== null) {
    const rem = room.players.filter(x => !x.elim && room.players.indexOf(x) !== room.wpIdx);
    room.wturns = Math.min(room.wturns, rem.length);
  }
  addLog(room, `${p.name} has been eliminated!`);
}

function cancelWin(room, p, reason) {
  p.winP = false;
  room.wpIdx = null;
  room.wturns = 0;
  addLog(room, `${p.name}'s win pending state was disrupted (${reason})!`);
}

function checkWinPendingDisrupted(room, p) {
  if (p.winP && getHandSequence(p.hand) === null) {
    cancelWin(room, p, 'hand disrupted');
  }
}

function endGame(room, winner) {
  room.phase = 'over';
  room.winner = room.players.indexOf(winner);
  room.players.forEach(p => p.supr = false);
  winner.supr = true;
  syncGameState(room);
}

function addLog(room, msg) {
  room.log = [msg, ...room.log].slice(0, 10);
}

// ========== NETWORK SYNC ==========
function broadcastToRoom(room, data) {
  const payload = JSON.stringify(data);
  room.players.forEach(p => {
    if (p.ws.readyState === WebSocket.OPEN) {
      p.ws.send(payload);
    }
  });
}

function broadcastLobbyUpdate(room) {
  room.players.forEach((p, idx) => {
    if (p.ws.readyState === WebSocket.OPEN) {
      p.ws.send(JSON.stringify({
        type: 'lobby_update',
        code: room.code,
        isHost: p.isHost,
        players: room.players.map(pl => ({
          name: pl.name,
          isHost: pl.isHost
        }))
      }));
    }
  });
}

function syncGameState(room) {
  room.players.forEach((p, idx) => {
    if (p.ws.readyState === WebSocket.OPEN) {
      const publicG = {
        ci: room.ci,
        phase: room.phase,
        discard: room.discard,
        deckCount: room.deck.length,
        players: room.players.map((pl, pIdx) => ({
          name: pl.name,
          idx: pIdx,
          handCount: pl.hand.length,
          elim: pl.elim,
          monkey: pl.monkey,
          supr: pl.supr,
          winP: pl.winP,
          isHost: pl.isHost,
          // Show full hand only if they are win pending
          hand: pl.winP ? pl.hand : undefined
        })),
        wpIdx: room.wpIdx,
        wturns: room.wturns,
        fe: room.fe,
        winner: room.winner,
        log: room.log,
        isMultiplayer: true,
        myIdx: idx
      };

      const myCards = p.hand;
      const counterPrompt = (room.phase === 'psw' && room.PSS && room.PSS.tIdx === idx) ? {
        attackerName: room.players[room.PSS.atkIdx].name,
        action: room.PSS.action
      } : null;

      p.ws.send(JSON.stringify({
        type: 'sync',
        G: publicG,
        myCards,
        counterPrompt
      }));
    }
  });
}

// ========== RUN SERVER ==========
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`BREAK Card Game Server listening on http://localhost:${PORT}`);
});
