/** Chromium polyfill. */
let browser = globalThis.browser ?? {
  storage: {
    local: {
      set: function (items) {
        return new Promise((resolve, reject) => {
          chrome.storage.local.set(items, () => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError));
            } else {
              resolve();
            }
          })
        });
      },
      get: function (items) {
        return new Promise((resolve, reject) => {
          chrome.storage.local.get(items, (i) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError));
            } else {
              resolve(i);
            }
          })
        });
      }
    }
  }
};

const observer = new MutationObserver(handleMutation);
const casinoPattern = /dealeren/i;
const betPattern = /Du slenger (\d+) kongerupi på bordet/;
const dealPattern = /Dealeren flipper kortet rundt. Det er ([SRKH])\w+ ([2-4]). Han legger det i haug (sju|åtte|ni),/;
const winPattern = /Han blar opp kongerupi fra under disken, og legger dem pent under den halve steinen. Du løfter den opp og tar pengene./;
const losePattern = /Det blir krakk. Beklager./;
const seven = "sju";
const eight = "åtte";
const nine = "ni";
let state = {
  bet: 0,
  deck: [],
  sevens: [],
  eights: [],
  nines: [],
  position: -1,
  reset: false
};

function observe() {
  observer.observe(document.getElementById("app-area"),
    {childList: true, attributes: true, subtree: true});
}

function getCasinoContainer() {
  return document.getElementById("casino-container");;
}

function createCasinoContainer() {
  let casinoContainer = getCasinoContainer();
  if (!casinoContainer) {
    let casinoHeader = document.createElement("h1");
    let royaleWithoutE = document.createElement("s");
    let betContainer = document.createElement("p");
    let deckContainer = document.createElement("div");
    let sevensContainer = document.createElement("div");
    let eightsContainer = document.createElement("div");
    let ninesContainer = document.createElement("div");

    royaleWithoutE.textContent = "e";

    casinoHeader.textContent = "Casino Royal"
    casinoHeader.append(royaleWithoutE);

    betContainer.id = "bet-container"
    betContainer.textContent = "Innsats: ";

    deckContainer.className = "casino-deck";
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 12; j++) {
        let gridCell = document.createElement("div");
        gridCell.id = "casino-deck-" + j + "-" + i;
        deckContainer.append(gridCell);
      }
    }

    sevensContainer.id = "casino-pile-7";
    eightsContainer.id = "casino-pile-8";
    ninesContainer.id = "casino-pile-9";

    casinoContainer = document.createElement("div");
    casinoContainer.id = "casino-container";
    casinoContainer.append(casinoHeader);
    casinoContainer.append(betContainer);
    casinoContainer.append(deckContainer);
    casinoContainer.append(sevensContainer);
    casinoContainer.append(eightsContainer);
    casinoContainer.append(ninesContainer);

    document.getElementById("app-area").append(casinoContainer);
  }
  return casinoContainer;
}

function anyElementMatches(elements, pattern) {
  for (let e of elements) {
    let m = e.innerText.match(pattern);
    if (m && m.length > 0) {
      return m;
    }
  }
}

function anyElementMatchesOneOf(elements, ...patterns) {
  for (let pattern of patterns) {
    let m = anyElementMatches(elements, pattern);
    if (m) {
      return [m,pattern];
    }
  }
}

function setBet(match) {
  state.bet = parseInt(match[1]);
  state.position = -1;

  if (state.reset) {
    state.deck = [];
    state.sevens = [];
    state.eights = [];
    state.nines = [];
    state.reset = false;
  }
}

function cardEquals(card1, card2) {
  return card1.suit === card2.suit && card1.value === card2.value;
}

function popPiles(index) {
  for (let i = state.deck.length - 1; i >= index; i--) {
    if (state.sevens.length > 0 && cardEquals(state.sevens[state.sevens.length - 1], state.deck[i])) {
      state.sevens.pop();
    } else if (state.eights.length > 0 && cardEquals(state.eights[state.eights.length - 1], state.deck[i])) {
      state.eights.pop();
    } else if (state.nines.length > 0 && cardEquals(state.nines[state.nines.length - 1], state.deck[i])) {
      state.nines.pop();
    }
  }
}

function setCard(match) {
  let card = {suit: match[1], value: parseInt(match[2])};
  let pile = match[3];
  let index = state.deck.findIndex(c => cardEquals(c, card));

  if (index >= 0) {
    state.position = index;
    popPiles(index);
  } else {
    state.deck.push(card);
    state.position = state.deck.length - 1;
  }

  switch (pile) {
    case seven: state.sevens.push(card); break;
    case eight: state.eights.push(card); break;
    case nine: state.nines.push(card); break;
  }

  state.reset = false;
}

function updateState(proseElements) {
  let changed = true;
  const [match, pattern] = anyElementMatchesOneOf(proseElements, betPattern, dealPattern);
  switch (pattern) {
    case betPattern: setBet(match); break;
    case dealPattern: setCard(match); break;
    default: changed = false;
  }

  if (anyElementMatchesOneOf(proseElements, winPattern, losePattern)) {
    state.reset = true;
  }

  if (changed) {
    browser.storage.local.set({state})
      .catch(e => console.error("Failed to store state:", e));
  }
}

function pileString(pile, targetValue) {
  let sum = pile.reduce((acc, c) => acc + c.value, 0);
  let flush = pile.reduce((acc, c) => acc === null || c.suit === acc ? c.suit : false, null);
  if (sum === 0) {
    return "";
  }

  return targetValue + ": " + pile.map(c => c.suit + c.value).join(" ")
    + " (" + sum + (sum === targetValue ? " klink" : "") + (flush ? " fløsj" : "") + ")";
}

function renderState() {
  observer.disconnect();
  let betContainer = document.getElementById("bet-container");
  betContainer.innerText = state.bet > 0 ? "Innsats: " + state.bet + " kongerupi" : "Innsats:";
  for (let i = 0; i < 12; i++) {
    document.getElementById("casino-deck-" + i + "-0").innerText = state.deck[i]?.suit ?? "-";
    document.getElementById("casino-deck-" + i + "-1").innerText = state.deck[i]?.value ?? "-";
    document.getElementById("casino-deck-" + i + "-2").innerText = i === state.position + 1 ? "^" : " ";
  }

  document.getElementById("casino-pile-7").innerText = pileString(state.sevens, 7);
  document.getElementById("casino-pile-8").innerText = pileString(state.eights, 8);
  document.getElementById("casino-pile-9").innerText = pileString(state.nines, 9);

  observe();
}

function handleMutation(_mutations, _observer) {
  let proseElements = document.getElementsByClassName("prose");
  let isCasino = false;
  let casinoContainer = getCasinoContainer();

  if(anyElementMatches(proseElements, casinoPattern)) {
    isCasino = true;
    casinoContainer = createCasinoContainer();
  }

  if (isCasino) {
    if (state.reset && document.getElementsByClassName("reverted").length > 0) {
      state.reset = false;
    }

    updateState(proseElements);
    renderState();
  } else if (casinoContainer) {
    casinoContainer.remove();
  }
}

browser.storage.local.get("state")
  .then(s => {
    if(s && Object.keys(s).length > 0)
      state = s.state
  });

observe();
