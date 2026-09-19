const STORAGE_KEY = "hazels-game-state-v1";
const SUITS = [
  { key: "spades", name: "Spades", symbol: "♠", color: "black" },
  { key: "hearts", name: "Hearts", symbol: "♥", color: "red" },
  { key: "diamonds", name: "Diamonds", symbol: "♦", color: "red" },
  { key: "clubs", name: "Clubs", symbol: "♣", color: "black" },
  { key: "no-trump", name: "No trump", symbol: "NT", color: "no-trump" },
];

const app = document.querySelector("#app");

let state = loadState() ?? {
  phase: "setup",
  players: [
    { id: makeId(), name: "Hazel" },
    { id: makeId(), name: "" },
    { id: makeId(), name: "" },
    { id: makeId(), name: "" },
  ],
  startingDealerId: null,
  rounds: [],
  currentRoundIndex: 0,
  drawerOpen: false,
  scorecardReturn: "setup",
  endedEarly: false,
};

if (!state.startingDealerId && state.players.length > 0) {
  state.startingDealerId = state.players[0].id;
}

render();

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, drawerOpen: false }));
}

function getMaxCards(playerCount = state.players.length) {
  return playerCount > 0 ? Math.floor(52 / playerCount) : 0;
}

function createCardSequence(maxCards) {
  const descending = Array.from({ length: maxCards }, (_, index) => maxCards - index);
  const ascending = Array.from({ length: Math.max(0, maxCards - 1) }, (_, index) => index + 2);
  return [...descending, ...ascending];
}

function createGame() {
  const players = state.players.map((player) => ({ ...player, name: player.name.trim() }));
  const maxCards = getMaxCards(players.length);
  const startingDealerIndex = 0;
  const cardsByRound = createCardSequence(maxCards);

  state = {
    ...state,
    phase: "bidding",
    players,
    rounds: cardsByRound.map((cards, index) => ({
      handNumber: index + 1,
      cards,
      trump: SUITS[index % SUITS.length].key,
      dealerId: players[(startingDealerIndex + index) % players.length].id,
      bids: Object.fromEntries(players.map((player) => [player.id, 0])),
      results: Object.fromEntries(players.map((player) => [player.id, null])),
      scoresAfter: null,
    })),
    currentRoundIndex: 0,
    drawerOpen: false,
    endedEarly: false,
  };

  saveState();
  render();
}

function currentRound() {
  return state.rounds[state.currentRoundIndex];
}

function suitFor(key) {
  return SUITS.find((suit) => suit.key === key) ?? SUITS[0];
}

function playerFor(id) {
  return state.players.find((player) => player.id === id);
}

function dealerFor(round = currentRound()) {
  return playerFor(round.dealerId);
}

function biddingOrder(round = currentRound()) {
  const dealerIndex = state.players.findIndex((player) => player.id === round.dealerId);
  return Array.from(
    { length: state.players.length },
    (_, offset) => state.players[(dealerIndex + offset + 1) % state.players.length],
  );
}

function completedRounds() {
  return state.rounds.filter((round) => round.scoresAfter !== null);
}

function currentScores() {
  const completed = completedRounds();
  if (completed.length === 0) {
    return Object.fromEntries(state.players.map((player) => [player.id, 0]));
  }
  return completed[completed.length - 1].scoresAfter;
}

function dealerRestriction(round = currentRound()) {
  const othersTotal = state.players
    .filter((player) => player.id !== round.dealerId)
    .reduce((sum, player) => sum + Number(round.bids[player.id] ?? 0), 0);

  if (othersTotal > round.cards) {
    return { prohibited: null, othersTotal, overbid: true };
  }

  const prohibited = round.cards - othersTotal;
  return {
    prohibited: prohibited <= round.cards ? prohibited : null,
    othersTotal,
    overbid: false,
  };
}

function setupIsValid() {
  const names = state.players.map((player) => player.name.trim().toLowerCase());
  return (
    state.players.length >= 2 &&
    state.players.length <= 52 &&
    names.every(Boolean) &&
    new Set(names).size === names.length
  );
}

function layout(content, options = {}) {
  const { showMenu = state.phase !== "setup" } = options;

  return `
    <div class="app-shell">
      ${
        showMenu
          ? `<button class="menu-fab" data-action="open-menu" aria-label="Open game menu">☰</button>`
          : ""
      }
      <main class="main${showMenu ? " has-menu" : ""}">${content}</main>
      ${state.drawerOpen ? renderDrawer() : ""}
    </div>
  `;
}

function render() {
  switch (state.phase) {
    case "setup":
      app.innerHTML = renderSetup();
      break;
    case "bidding":
      app.innerHTML = renderBidding();
      break;
    case "play":
      app.innerHTML = renderPlay();
      break;
    case "results":
      app.innerHTML = renderResults();
      break;
    case "final":
      app.innerHTML = renderFinal();
      break;
    case "scorecard":
      app.innerHTML = renderScorecard();
      break;
    default:
      state.phase = "setup";
      app.innerHTML = renderSetup();
  }
}

function renderSetup() {
  const maxCards = getMaxCards();
  const handCount = maxCards > 0 ? maxCards * 2 - 1 : 0;
  const validNames = state.players.filter((player) => player.name.trim()).length;
  const duplicateNames =
    new Set(state.players.map((player) => player.name.trim().toLowerCase()).filter(Boolean))
      .size !== validNames;

  return layout(
    `
      <div class="setup">
        <div class="setup-head">
          <h1 class="screen-title">Players</h1>
          <p class="setup-hint">First player is the starting dealer · drag to reorder</p>
        </div>
        <div class="player-list">
          ${state.players
            .map(
              (player, index) => `
                <div class="player-row" data-player-id="${player.id}">
                  <span class="order-number ${index === 0 ? "is-dealer" : ""}">${
                    index === 0 ? "D" : index + 1
                  }</span>
                  <input
                    class="text-input"
                    data-player-name="${player.id}"
                    value="${escapeHtml(player.name)}"
                    aria-label="Player ${index + 1} name"
                    autocomplete="name"
                    autocapitalize="words"
                    maxlength="30"
                    placeholder="Player ${index + 1}"
                  />
                  <button class="remove-player" data-action="remove-player" data-player-id="${
                    player.id
                  }" tabindex="-1" aria-label="Remove player" ${
                    state.players.length <= 2 ? "disabled" : ""
                  }>×</button>
                  <button class="drag-handle" data-drag-handle tabindex="-1" aria-label="Drag to reorder">⠿</button>
                </div>
              `,
            )
            .join("")}
        </div>
        <button class="button secondary full-width" data-action="add-player" ${
          state.players.length >= 52 ? "disabled" : ""
        }>＋ Add player</button>
        ${
          duplicateNames
            ? '<p class="restriction">Each player needs a unique name.</p>'
            : ""
        }
        <div class="setup-foot">
          <span class="setup-meta">${state.players.length} players · ${maxCards} cards · ${handCount} hands</span>
          <button class="button gold" data-action="start-game" ${
            setupIsValid() ? "" : "disabled"
          }>Start <span aria-hidden="true">→</span></button>
        </div>
      </div>
    `,
    { showMenu: false },
  );
}

function renderRoundBanner(round) {
  const suit = suitFor(round.trump);
  return `
    <section class="card round-banner">
      <div class="round-stat">
        <span>Hand</span>
        <strong>${round.handNumber}/${state.rounds.length}</strong>
      </div>
      <div class="round-stat">
        <span>Dealer</span>
        <strong>${escapeHtml(dealerFor(round).name)}</strong>
      </div>
      <div class="round-stat">
        <span>Cards</span>
        <strong>${round.cards}</strong>
      </div>
      <div class="round-stat round-stat-trump">
        <span>Trump</span>
        <strong class="trump-inline">
          <span class="suit-badge ${suit.color}">${suit.symbol}</span>
          <span class="trump-name">${suit.name}</span>
        </strong>
      </div>
    </section>
  `;
}

function renderBidding() {
  const round = currentRound();
  const order = biddingOrder(round);
  const restriction = dealerRestriction(round);
  const dealerBid = Number(round.bids[round.dealerId]);
  const totalBids = state.players.reduce(
    (total, player) => total + Number(round.bids[player.id]),
    0,
  );
  const invalidDealerBid =
    restriction.prohibited !== null && dealerBid === restriction.prohibited;

  return layout(`
    ${renderRoundBanner(round)}
    <h1 class="screen-title">Place your bids</h1>
    <section class="bid-grid">
      ${order
        .map((player, index) => {
          const isDealer = player.id === round.dealerId;
          const bid = Number(round.bids[player.id]);
          return `
            <article class="card bid-card ${isDealer ? "is-dealer" : ""}">
              <span class="bid-order ${isDealer ? "is-dealer" : ""}">${
                isDealer ? "D" : index + 1
              }</span>
              <div class="player-name">${escapeHtml(player.name)}</div>
              <div class="stepper" aria-label="${escapeHtml(player.name)} bid">
                <button data-action="change-bid" data-player-id="${player.id}" data-delta="-1" ${
                  bid <= 0 ? "disabled" : ""
                } aria-label="Decrease bid">−</button>
                <output>${bid}</output>
                <button data-action="change-bid" data-player-id="${player.id}" data-delta="1" ${
                  bid >= round.cards ? "disabled" : ""
                } aria-label="Increase bid">＋</button>
              </div>
            </article>
          `;
        })
        .join("")}
    </section>
    ${
      restriction.overbid
        ? `<p class="restriction overbid">
            <strong class="bid-total">${totalBids} of ${round.cards} bid</strong>
            <span>Overbid. ${escapeHtml(dealerFor(round).name)} may bid any amount.</span>
          </p>`
        : `<p class="restriction">
            <strong class="bid-total">${totalBids} of ${round.cards} bid</strong>
            <span>${escapeHtml(dealerFor(round).name)} cannot bid <strong>${
              restriction.prohibited
            }</strong>.</span>
          </p>`
    }
    <div class="action-row">
      <button class="button" data-action="confirm-bids" ${
        invalidDealerBid ? "disabled" : ""
      }>Confirm bids <span aria-hidden="true">→</span></button>
    </div>
  `);
}

function renderPlay() {
  const round = currentRound();
  const suit = suitFor(round.trump);
  const order = biddingOrder(round);
  return layout(`
    <section class="play-screen">
      <div class="trump-hero ${suit.color}">
        <button class="menu-fab play-menu-fab" data-action="open-menu" aria-label="Open game menu">☰</button>
        <div class="suit-symbol ${suit.color}" aria-label="${suit.name}">${suit.symbol}</div>
        <div class="trump-title">${suit.name}</div>
        <div class="trump-meta">${round.cards} card${round.cards === 1 ? "" : "s"} · ${escapeHtml(
          dealerFor(round).name,
        )} deals</div>
      </div>
      <div class="play-bids" style="--bid-columns:${Math.min(order.length, 2)}">
        <div class="bid-reminder-list">
          ${order
            .map(
              (player) => `
                <div class="bid-reminder">
                  <span class="player-name">${escapeHtml(player.name)}</span>
                  <span class="bid-bubble">${round.bids[player.id]}</span>
                </div>
              `,
            )
            .join("")}
        </div>
        <button class="button gold full-width" data-action="end-hand">End hand</button>
      </div>
    </section>
  `, { showMenu: false });
}

function renderResults() {
  const round = currentRound();
  const allEntered = state.players.every((player) => round.results[player.id] !== null);
  return layout(`
    ${renderRoundBanner(round)}
    <h1 class="screen-title">Who made it?</h1>
    <section class="result-grid">
      ${biddingOrder(round)
        .map((player) => {
          const result = round.results[player.id];
          const points = result === "made" ? 10 + Number(round.bids[player.id]) : 0;
          return `
            <article class="card result-card">
              <div>
                <span class="player-name">${escapeHtml(player.name)}</span>
                <span class="bid-note">Bid ${round.bids[player.id]} ${
                  result === null
                    ? '<span class="choose-result">· Choose a result</span>'
                    : `· <span class="points-preview">+${points} points</span>`
                }</span>
              </div>
              <div class="result-toggle" aria-label="${escapeHtml(player.name)} result">
                <button class="${result === "made" ? "active-made" : ""}" data-action="set-result" data-player-id="${
                  player.id
                }" data-result="made">Made</button>
                <button class="${result === "set" ? "active-set" : ""}" data-action="set-result" data-player-id="${
                  player.id
                }" data-result="set">Set</button>
              </div>
            </article>
          `;
        })
        .join("")}
    </section>
    <div class="action-row">
      <button class="button secondary" data-action="back-to-play">← Back to hand</button>
      <button class="button" data-action="save-results" ${
        allEntered ? "" : "disabled"
      }>${round.handNumber === state.rounds.length ? "Finish game" : "Save & next hand"} →</button>
    </div>
  `);
}

function renderDrawer() {
  const scores = currentScores();
  const ranked = [...state.players].sort(
    (a, b) => scores[b.id] - scores[a.id] || a.name.localeCompare(b.name),
  );
  const canShowScorecard = completedRounds().length > 0;

  return `
    <div class="drawer-backdrop" data-action="close-menu"></div>
    <aside class="drawer" role="dialog" aria-modal="true" aria-label="Game menu">
      <div class="drawer-head">
        <div>
          <p class="eyebrow">Game menu</p>
          <h2>Current scores</h2>
        </div>
        <button class="icon-button" data-action="close-menu" aria-label="Close menu">×</button>
      </div>
      <div class="drawer-score-list">
        ${ranked
          .map(
            (player, index) => `
              <div class="drawer-score">
                <span><strong>${index + 1}.</strong> ${escapeHtml(player.name)}</span>
                <strong>${scores[player.id]}</strong>
              </div>
            `,
          )
          .join("")}
      </div>
      <div class="drawer-actions">
        ${
          canShowScorecard
            ? '<button class="button secondary full-width" data-action="view-scorecard">View scorecard</button>'
            : ""
        }
        ${
          !["final", "scorecard"].includes(state.phase)
            ? '<button class="button danger full-width" data-action="end-game-early">End game early</button>'
            : ""
        }
        <button class="button secondary full-width" data-action="close-menu">Return to game</button>
      </div>
    </aside>
  `;
}

function renderFinal() {
  const scores = currentScores();
  const ranked = [...state.players].sort(
    (a, b) => scores[b.id] - scores[a.id] || a.name.localeCompare(b.name),
  );
  const handsPlayed = completedRounds().length;
  const leaders = ranked.filter((player) => scores[player.id] === scores[ranked[0]?.id]);
  const resultTitle =
    handsPlayed === 0
      ? "No hands scored."
      : leaders.length > 1
        ? `${leaders.map((player) => escapeHtml(player.name)).join(" & ")} tie!`
        : `${escapeHtml(ranked[0]?.name ?? "No one")} wins!`;
  const podiumOrder =
    ranked.length >= 3 ? [ranked[1], ranked[0], ranked[2]] : ranked.length === 2 ? [ranked[1], ranked[0]] : ranked;

  return layout(`
    <div class="screen-heading" style="justify-content:center;text-align:center">
      <div>
        <p class="eyebrow">${state.endedEarly ? "Game ended early" : "Game complete"}</p>
        <h1>${resultTitle}</h1>
        <p class="lede" style="margin-inline:auto">${handsPlayed} hand${
          handsPlayed === 1 ? "" : "s"
        } played.</p>
      </div>
    </div>
    ${
      ranked.length <= 3
        ? `
          <div class="podium">
            ${podiumOrder
              .map((player) => {
                const rank = ranked.indexOf(player) + 1;
                return `
                  <div class="podium-place ${rank === 1 ? "first" : ""}">
                    <span class="podium-rank">${rank === 1 ? "Winner" : `#${rank}`}</span>
                    <span class="podium-name">${escapeHtml(player.name)}</span>
                    <span class="podium-score">${scores[player.id]} points</span>
                  </div>
                `;
              })
              .join("")}
          </div>
        `
        : `
          <div class="ranking-list">
            ${ranked
              .map(
                (player, index) => `
                  <div class="card ranking-row">
                    <strong>#${index + 1}</strong>
                    <span class="player-name">${escapeHtml(player.name)}</span>
                    <strong>${scores[player.id]} pts</strong>
                  </div>
                `,
              )
              .join("")}
          </div>
        `
    }
    <div class="final-actions">
      <button class="button secondary" data-action="view-scorecard">View full scorecard</button>
      <button class="button" data-action="new-same-players">New game · same players</button>
      <button class="button secondary" data-action="new-players">New players</button>
    </div>
  `);
}

function renderScorecard() {
  const rounds = completedRounds();
  return layout(`
    <div class="screen-heading">
      <h1 class="screen-title">Scorecard</h1>
      <button class="button secondary" data-action="close-scorecard">← Back</button>
    </div>
    <section class="card scorecard-wrap">
      ${
        rounds.length === 0
          ? '<div class="empty-state">Complete a hand to begin the scorecard.</div>'
          : `
            <div class="table-scroll">
              <table class="score-table">
                <thead>
                  <tr>
                    <th>Hand</th>
                    <th>Cards</th>
                    <th>Dealer</th>
                    <th>Trump</th>
                    ${state.players.map((player) => `<th>${escapeHtml(player.name)}</th>`).join("")}
                  </tr>
                </thead>
                <tbody>
                  ${rounds
                    .map((round) => {
                      const suit = suitFor(round.trump);
                      return `
                        <tr>
                          <td>${round.handNumber}</td>
                          <td>${round.cards}</td>
                          <td>${escapeHtml(dealerFor(round).name)}</td>
                          <td><span class="suit ${suit.color}">${suit.symbol}</span> ${suit.name}</td>
                          ${state.players
                            .map((player) => {
                              const made = round.results[player.id] === "made";
                              const points = made ? 10 + Number(round.bids[player.id]) : 0;
                              return `<td class="${made ? "made" : "set"}">Bid ${
                                round.bids[player.id]
                              } · ${made ? "Made" : "Set"} · +${points} · ${round.scoresAfter[player.id]}</td>`;
                            })
                            .join("")}
                        </tr>
                      `;
                    })
                    .join("")}
                </tbody>
              </table>
            </div>
          `
      }
    </section>
  `);
}

function showToast(message) {
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.append(toast);
  window.setTimeout(() => toast.remove(), 2200);
}

function addPlayer() {
  if (state.players.length >= 52) return;
  state.players.push({ id: makeId(), name: "" });
  saveState();
  render();
  window.setTimeout(() => {
    const inputs = document.querySelectorAll("[data-player-name]");
    inputs[inputs.length - 1]?.focus();
  });
}

app.addEventListener("input", (event) => {
  const playerId = event.target.dataset.playerName;
  if (!playerId) return;
  const player = playerFor(playerId);
  if (!player) return;
  player.name = event.target.value;
  saveState();

  const startButton = document.querySelector('[data-action="start-game"]');
  if (startButton) startButton.disabled = !setupIsValid();
});

app.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || !event.target.matches("[data-player-name]")) return;
  event.preventDefault();
  const inputs = [...document.querySelectorAll("[data-player-name]")];
  const currentIndex = inputs.indexOf(event.target);
  const nextInput = inputs[currentIndex + 1];

  if (nextInput && !nextInput.value.trim()) {
    nextInput.focus();
    return;
  }

  addPlayer();
});

let dragState = null;

app.addEventListener("pointerdown", (event) => {
  const handle = event.target.closest("[data-drag-handle]");
  if (!handle) return;
  event.preventDefault();
  const row = handle.closest(".player-row");
  if (!row) return;
  const list = row.parentElement;
  dragState = { row, list, pointerId: event.pointerId };
  row.classList.add("dragging");
  handle.setPointerCapture(event.pointerId);
});

app.addEventListener("pointermove", (event) => {
  if (!dragState || event.pointerId !== dragState.pointerId) return;
  const { row, list } = dragState;
  const siblings = [...list.querySelectorAll(".player-row:not(.dragging)")];
  const y = event.clientY;
  const next = siblings.find((sibling) => {
    const rect = sibling.getBoundingClientRect();
    return y < rect.top + rect.height / 2;
  });
  if (next) {
    list.insertBefore(row, next);
  } else {
    list.append(row);
  }
});

function finishDrag() {
  if (!dragState) return;
  const { row, list } = dragState;
  row.classList.remove("dragging");
  const orderedIds = [...list.querySelectorAll(".player-row")].map(
    (element) => element.dataset.playerId,
  );
  state.players.sort((a, b) => orderedIds.indexOf(a.id) - orderedIds.indexOf(b.id));
  state.startingDealerId = state.players[0]?.id ?? null;
  dragState = null;
  saveState();
  render();
}

app.addEventListener("pointerup", finishDrag);
app.addEventListener("pointercancel", finishDrag);

app.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button || button.disabled) return;
  const action = button.dataset.action;

  switch (action) {
    case "add-player":
      addPlayer();
      break;
    case "remove-player": {
      if (state.players.length <= 2) return;
      state.players = state.players.filter(
        (player) => player.id !== button.dataset.playerId,
      );
      if (!state.players.some((player) => player.id === state.startingDealerId)) {
        state.startingDealerId = state.players[0].id;
      }
      saveState();
      render();
      break;
    }
    case "start-game":
      if (setupIsValid()) createGame();
      break;
    case "change-bid": {
      const round = currentRound();
      const playerId = button.dataset.playerId;
      const nextBid = Number(round.bids[playerId]) + Number(button.dataset.delta);
      round.bids[playerId] = Math.max(0, Math.min(round.cards, nextBid));
      saveState();
      render();
      break;
    }
    case "confirm-bids": {
      const restriction = dealerRestriction();
      const round = currentRound();
      if (
        restriction.prohibited !== null &&
        Number(round.bids[round.dealerId]) === restriction.prohibited
      ) {
        showToast(`The dealer cannot bid ${restriction.prohibited}.`);
        return;
      }
      state.phase = "play";
      saveState();
      render();
      break;
    }
    case "end-hand":
      state.phase = "results";
      saveState();
      render();
      break;
    case "back-to-play":
      state.phase = "play";
      saveState();
      render();
      break;
    case "set-result":
      currentRound().results[button.dataset.playerId] = button.dataset.result;
      saveState();
      render();
      break;
    case "save-results": {
      const round = currentRound();
      if (state.players.some((player) => round.results[player.id] === null)) return;
      const previousScores = currentScores();
      round.scoresAfter = Object.fromEntries(
        state.players.map((player) => {
          const points =
            round.results[player.id] === "made" ? 10 + Number(round.bids[player.id]) : 0;
          return [player.id, Number(previousScores[player.id] ?? 0) + points];
        }),
      );

      if (state.currentRoundIndex === state.rounds.length - 1) {
        state.phase = "final";
      } else {
        state.currentRoundIndex += 1;
        state.phase = "bidding";
      }
      saveState();
      render();
      break;
    }
    case "open-menu":
      state.drawerOpen = true;
      render();
      break;
    case "close-menu":
      state.drawerOpen = false;
      render();
      break;
    case "view-scorecard":
      state.scorecardReturn = state.phase;
      state.phase = "scorecard";
      state.drawerOpen = false;
      saveState();
      render();
      break;
    case "close-scorecard":
      state.phase = state.scorecardReturn || "final";
      saveState();
      render();
      break;
    case "end-game-early": {
      if (!window.confirm("End the game now? The completed hands will be kept.")) return;
      state.endedEarly = true;
      state.phase = "final";
      state.drawerOpen = false;
      saveState();
      render();
      break;
    }
    case "new-same-players":
      state = {
        phase: "setup",
        players: state.players.map((player) => ({ ...player })),
        startingDealerId: state.players[0]?.id ?? null,
        rounds: [],
        currentRoundIndex: 0,
        drawerOpen: false,
        scorecardReturn: "setup",
        endedEarly: false,
      };
      saveState();
      render();
      break;
    case "new-players": {
      const players = Array.from({ length: 4 }, () => ({ id: makeId(), name: "" }));
      state = {
        phase: "setup",
        players,
        startingDealerId: players[0].id,
        rounds: [],
        currentRoundIndex: 0,
        drawerOpen: false,
        scorecardReturn: "setup",
        endedEarly: false,
      };
      saveState();
      render();
      break;
    }
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.drawerOpen) {
    state.drawerOpen = false;
    render();
  }
});
