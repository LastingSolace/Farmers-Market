/**
 * Farmers Market
 *
 * The farm is a field of plots you work by hand: till, plant, and water.
 * Watered crops grow one stage each hour. Prices are a separate clock.
 *
 * The save is shaped so a later server can share one world: prices and
 * history are the world, and gold, seeds, crops, and plots belong to one player.
 *
 * Each hour a crop's price steps at random, then pulls back toward its usual
 * price (an Ornstein-Uhlenbeck step):
 *   next = price + kappa * (mean - price) + sigma * noise
 */

const SAVE_KEY = "farmers-market-v2";
const HISTORY = 24 * 7;
const HOUR_MS = 8000;
const ORDER = ["wheat", "carrot", "tomato", "cotton"];
const MAP_COLS = 24;
const MAP_ROWS = 14;
const TILE = 48;
const WALK_SPEED = 180;
const BODY = { ox: TILE / 2, oy: TILE - 6, hw: 8, hh: 5 };
const FIELD = { x: 2, y: 3, w: 12, h: 8 };
const PLOT_COUNT = FIELD.w * FIELD.h;
const PLOT_PRICE = 100;
const CAN_MAX = 6;
const SPRINKLER_PRICE = 250;
const SPRINKLER_PLOTS = 5;
const FARMHAND_PRICE = 1000;
const FARMHAND_WAGE = 15;
const MAX_HANDS = 10;
const HAMMER_PRICE = 200;
const STOCK_PRICE = 1000;
const STARTER_PLOTS = { w: 3, h: 2 };
const TOOLS = ["hoe", "water", "seed", "hand"];
const FACING = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

const CROPS = {
  wheat: {
    name: "Wheat",
    singular: "wheat",
    plural: "wheat",
    mean: 14,
    kappa: 0.023,
    sigma: 0.9,
    growHours: 6,
    seedPrice: 5,
    color: "#c4922a",
    note: "Fast grain. Six hours watered, twelve if you skip it.",
  },
  carrot: {
    name: "Carrots",
    singular: "carrot",
    plural: "carrots",
    mean: 24,
    kappa: 0.019,
    sigma: 1.65,
    growHours: 9,
    seedPrice: 8,
    color: "#d4652f",
    note: "A steady garden crop. Nine hours watered, eighteen if you skip it.",
  },
  tomato: {
    name: "Tomatoes",
    singular: "tomato",
    plural: "tomatoes",
    mean: 36,
    kappa: 0.0165,
    sigma: 2.95,
    growHours: 12,
    seedPrice: 12,
    color: "#c4473a",
    note: "Wild prices. Twelve hours watered, a full day if you skip it.",
  },
  cotton: {
    name: "Cotton",
    singular: "cotton",
    plural: "cotton",
    mean: 58,
    kappa: 0.0144,
    sigma: 3.45,
    growHours: 15,
    seedPrice: 20,
    color: "#3f6f62",
    note: "Slow cash crop. Fifteen hours watered, thirty if you skip it.",
  },
};

const px = (body, w = 16, h = 16) => `<svg viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges" aria-hidden="true">${body}</svg>`;

const SPROUT = px(`
  <rect x="6" y="8" width="2" height="5" fill="#3f7d32"/>
  <rect x="3" y="7" width="5" height="3" fill="#7dba45"/>
  <rect x="8" y="5" width="5" height="3" fill="#b6de6a"/>
  <rect x="5" y="4" width="3" height="2" fill="#e8f5b0"/>
`);

const PLANTS = {
  sprout: SPROUT,
  wheat: px(`
    <rect x="1" y="10" width="14" height="4" fill="#4f8f34"/>
    <rect x="2" y="6" width="3" height="6" fill="#6aaa3c"/>
    <rect x="6" y="4" width="3" height="8" fill="#7dba45"/>
    <rect x="11" y="6" width="3" height="6" fill="#5f9a38"/>
    <rect x="4" y="8" width="2" height="3" fill="#8fd15a"/>
  `),
  wheatReady: px(`
    <rect x="1" y="11" width="14" height="4" fill="#3f7d32"/>
    <rect x="1" y="4" width="3" height="8" fill="#e6b84a"/>
    <rect x="5" y="2" width="3" height="10" fill="#f2d06a"/>
    <rect x="9" y="3" width="3" height="9" fill="#d9a43a"/>
    <rect x="12" y="5" width="3" height="7" fill="#e6b84a"/>
    <rect x="1" y="2" width="3" height="3" fill="#fff1c2"/>
    <rect x="5" y="1" width="3" height="3" fill="#fff6d4"/>
    <rect x="9" y="2" width="3" height="2" fill="#f2d06a"/>
    <rect x="12" y="4" width="3" height="2" fill="#fff1c2"/>
  `),
  carrot: px(`
    <rect x="1" y="3" width="6" height="6" fill="#2f7a28"/>
    <rect x="8" y="2" width="7" height="7" fill="#3f8a32"/>
    <rect x="3" y="8" width="10" height="6" fill="#5aaa40"/>
    <rect x="2" y="5" width="3" height="3" fill="#8fd15a"/>
    <rect x="10" y="4" width="3" height="3" fill="#c8e57a"/>
    <rect x="6" y="7" width="3" height="3" fill="#e8f5b0"/>
  `),
  carrotReady: px(`
    <rect x="1" y="2" width="6" height="6" fill="#2f7a28"/>
    <rect x="8" y="1" width="7" height="7" fill="#3f8a32"/>
    <rect x="2" y="7" width="11" height="5" fill="#5aaa40"/>
    <rect x="2" y="4" width="3" height="3" fill="#c8e57a"/>
    <rect x="11" y="3" width="3" height="3" fill="#e8f5b0"/>
    <rect x="4" y="12" width="3" height="3" fill="#e07a2f"/>
    <rect x="9" y="12" width="3" height="3" fill="#f0943c"/>
  `),
  tomato: px(`
    <rect x="1" y="3" width="7" height="7" fill="#2f7a28"/>
    <rect x="8" y="2" width="7" height="7" fill="#3c8a34"/>
    <rect x="3" y="8" width="10" height="6" fill="#4f9a3c"/>
    <rect x="5" y="5" width="3" height="3" fill="#8fd15a"/>
    <rect x="10" y="6" width="3" height="3" fill="#c8e57a"/>
  `),
  tomatoReady: px(`
    <rect x="0" y="3" width="7" height="7" fill="#2f7a28"/>
    <rect x="8" y="2" width="8" height="7" fill="#3c8a34"/>
    <rect x="2" y="8" width="12" height="6" fill="#4f9a3c"/>
    <rect x="2" y="5" width="3" height="3" fill="#e23d32"/>
    <rect x="7" y="4" width="3" height="3" fill="#ff5a4a"/>
    <rect x="11" y="6" width="3" height="3" fill="#c4473a"/>
    <rect x="5" y="9" width="3" height="3" fill="#e23d32"/>
    <rect x="10" y="10" width="3" height="3" fill="#ff5a4a"/>
  `),
  cotton: px(`
    <rect x="1" y="5" width="5" height="4" fill="#3f8a32"/>
    <rect x="10" y="4" width="5" height="5" fill="#4f9a3c"/>
    <rect x="2" y="10" width="5" height="4" fill="#2f7a28"/>
    <rect x="9" y="11" width="5" height="4" fill="#3c8a34"/>
    <rect x="4" y="3" width="3" height="3" fill="#7dba45"/>
    <rect x="7" y="3" width="2" height="13" fill="#6b4228"/>
    <rect x="4" y="7" width="3" height="1" fill="#5c3a22"/>
    <rect x="9" y="8" width="3" height="1" fill="#5c3a22"/>
    <rect x="6" y="1" width="4" height="3" fill="#d9cbb0"/>
    <rect x="1" y="6" width="3" height="2" fill="#e6d8bc"/>
    <rect x="12" y="6" width="3" height="2" fill="#d9cbb0"/>
  `),
  cottonReady: px(`
    <rect x="0" y="7" width="4" height="3" fill="#5f9a38"/>
    <rect x="12" y="6" width="4" height="3" fill="#6aaa3c"/>
    <rect x="0" y="12" width="4" height="3" fill="#4f8a32"/>
    <rect x="12" y="12" width="4" height="3" fill="#5f9a38"/>
    <rect x="11" y="2" width="3" height="2" fill="#7dba45"/>
    <rect x="2" y="2" width="3" height="2" fill="#8fd15a"/>
    <rect x="7" y="4" width="2" height="12" fill="#7a4e2a"/>
    <rect x="3" y="6" width="4" height="1" fill="#6b4228"/>
    <rect x="9" y="7" width="4" height="1" fill="#6b4228"/>
    <rect x="4" y="10" width="3" height="1" fill="#6b4228"/>
    <rect x="9" y="11" width="3" height="1" fill="#6b4228"/>
    <rect x="6" y="0" width="4" height="1" fill="#fffaf3"/>
    <rect x="5" y="1" width="6" height="3" fill="#f3eee4"/>
    <rect x="6" y="1" width="2" height="1" fill="#ffffff"/>
    <rect x="8" y="3" width="2" height="1" fill="#ddd2bc"/>
    <rect x="6" y="4" width="4" height="1" fill="#8a5a32"/>
    <rect x="0" y="3" width="4" height="1" fill="#fffaf3"/>
    <rect x="0" y="4" width="5" height="2" fill="#f3eee4"/>
    <rect x="1" y="4" width="2" height="1" fill="#ffffff"/>
    <rect x="1" y="6" width="3" height="1" fill="#8a5a32"/>
    <rect x="11" y="4" width="4" height="1" fill="#fffaf3"/>
    <rect x="11" y="5" width="5" height="2" fill="#f4efe6"/>
    <rect x="12" y="5" width="2" height="1" fill="#ffffff"/>
    <rect x="12" y="7" width="3" height="1" fill="#8a5a32"/>
    <rect x="1" y="8" width="4" height="1" fill="#fffaf3"/>
    <rect x="1" y="9" width="5" height="2" fill="#f3eee4"/>
    <rect x="2" y="9" width="2" height="1" fill="#ffffff"/>
    <rect x="2" y="11" width="3" height="1" fill="#7a4e2a"/>
    <rect x="10" y="9" width="4" height="1" fill="#fffaf3"/>
    <rect x="10" y="10" width="5" height="2" fill="#f4efe6"/>
    <rect x="11" y="10" width="2" height="1" fill="#ffffff"/>
    <rect x="11" y="12" width="3" height="1" fill="#8a5a32"/>
  `),
};

const READY_ART = {
  wheatReady: "art/wheat-ready.png?v=1",
  carrotReady: "art/carrot-ready.png?v=1",
  tomatoReady: "art/tomato-ready.png?v=1",
  cottonReady: "art/cotton-ready.png?v=1",
};

const ICONS = {
  wheat: PLANTS.wheatReady,
  carrot: PLANTS.carrotReady,
  tomato: PLANTS.tomatoReady,
  cotton: PLANTS.cottonReady,
};

const FARMER = `<img src="art/farmer.png?v=1" alt="">`;

const HELPER = px(`
  <rect x="2" y="3" width="12" height="2" fill="#5f8f3a"/>
  <rect x="5" y="1" width="6" height="3" fill="#3f6a28"/>
  <rect x="4" y="5" width="8" height="2" fill="#6b3a22"/>
  <rect x="5" y="6" width="6" height="4" fill="#f0c4a0"/>
  <rect x="6" y="7" width="1" height="1" fill="#3a2a22"/>
  <rect x="9" y="7" width="1" height="1" fill="#3a2a22"/>
  <rect x="4" y="10" width="8" height="2" fill="#3f8f4a"/>
  <rect x="5" y="12" width="6" height="4" fill="#c4a574"/>
  <rect x="5" y="16" width="2" height="2" fill="#4a3428"/>
  <rect x="9" y="16" width="2" height="2" fill="#4a3428"/>
`, 16, 18);

const HELPER_BACK = px(`
  <rect x="2" y="3" width="12" height="2" fill="#5f8f3a"/>
  <rect x="5" y="1" width="6" height="3" fill="#3f6a28"/>
  <rect x="4" y="5" width="8" height="3" fill="#6b3a22"/>
  <rect x="4" y="8" width="8" height="3" fill="#3f8f4a"/>
  <rect x="5" y="11" width="6" height="5" fill="#c4a574"/>
  <rect x="5" y="16" width="2" height="2" fill="#4a3428"/>
  <rect x="9" y="16" width="2" height="2" fill="#4a3428"/>
`, 16, 18);

const HOUSE = px(`
  <rect x="14" y="0" width="4" height="3" fill="#6b3e24"/>
  <rect x="12" y="2" width="8" height="3" fill="#c45a3a"/>
  <rect x="6" y="4" width="20" height="3" fill="#a33b2b"/>
  <rect x="1" y="6" width="30" height="3" fill="#8d3424"/>
  <rect x="0" y="8" width="32" height="3" fill="#6b3e24"/>
  <rect x="3" y="11" width="26" height="19" fill="#e8c48a"/>
  <rect x="3" y="11" width="26" height="2" fill="#c9a15c"/>
  <rect x="10" y="11" width="1" height="19" fill="#c9a15c"/>
  <rect x="20" y="11" width="1" height="19" fill="#c9a15c"/>
  <rect x="5" y="15" width="5" height="5" fill="#9fd4e0"/>
  <rect x="22" y="15" width="5" height="5" fill="#9fd4e0"/>
  <rect x="13" y="18" width="6" height="12" fill="#6b3e24"/>
  <rect x="17" y="24" width="1" height="1" fill="#f0c56a"/>
  <rect x="4" y="27" width="8" height="3" fill="#4f8f34"/>
  <rect x="5" y="26" width="2" height="2" fill="#e07aa0"/>
  <rect x="8" y="26" width="2" height="2" fill="#f2d06a"/>
  <rect x="20" y="27" width="8" height="3" fill="#4f8f34"/>
  <rect x="22" y="26" width="2" height="2" fill="#7ec8e3"/>
`, 32, 32);

const SHOP = px(`
  <rect x="4" y="0" width="6" height="4" fill="#6b3e24"/>
  <rect x="2" y="3" width="28" height="5" fill="#2f7a28"/>
  <rect x="0" y="7" width="32" height="4" fill="#e8c48a"/>
  <rect x="0" y="7" width="8" height="4" fill="#c4473a"/>
  <rect x="8" y="7" width="8" height="4" fill="#f6edd8"/>
  <rect x="16" y="7" width="8" height="4" fill="#c4473a"/>
  <rect x="24" y="7" width="8" height="4" fill="#f6edd8"/>
  <rect x="3" y="11" width="26" height="19" fill="#c9844a"/>
  <rect x="3" y="11" width="26" height="2" fill="#a86b3c"/>
  <rect x="6" y="15" width="6" height="5" fill="#9fd4e0"/>
  <rect x="20" y="15" width="6" height="5" fill="#9fd4e0"/>
  <rect x="12" y="17" width="8" height="13" fill="#6b3e24"/>
  <rect x="17" y="23" width="2" height="2" fill="#f0c56a"/>
  <rect x="5" y="26" width="5" height="4" fill="#e6b84a"/>
  <rect x="22" y="26" width="5" height="4" fill="#7dba45"/>
`, 32, 32);

const STALL = px(`
  <rect x="0" y="1" width="4" height="3" fill="#c4473a"/>
  <rect x="4" y="1" width="4" height="3" fill="#f6edd8"/>
  <rect x="8" y="1" width="4" height="3" fill="#c4473a"/>
  <rect x="12" y="1" width="4" height="3" fill="#f6edd8"/>
  <rect x="1" y="4" width="2" height="12" fill="#6b3e24"/>
  <rect x="13" y="4" width="2" height="12" fill="#6b3e24"/>
  <rect x="2" y="8" width="12" height="6" fill="#c9844a"/>
  <rect x="4" y="9" width="3" height="3" fill="#e23d32"/>
  <rect x="8" y="9" width="3" height="3" fill="#7dba45"/>
  <rect x="3" y="14" width="10" height="2" fill="#8b5a32"/>
`, 16, 16);

const WELL = px(`
  <rect x="2" y="1" width="12" height="3" fill="#8b5a32"/>
  <rect x="4" y="0" width="8" height="2" fill="#a86b3c"/>
  <rect x="3" y="4" width="2" height="6" fill="#6b3e24"/>
  <rect x="11" y="4" width="2" height="6" fill="#6b3e24"/>
  <rect x="2" y="9" width="12" height="6" fill="#9aa3a8"/>
  <rect x="4" y="10" width="8" height="4" fill="#6e787e"/>
  <rect x="6" y="11" width="4" height="2" fill="#4a3428"/>
`, 16, 16);

const TREE = px(`
  <rect x="6" y="12" width="4" height="6" fill="#6b3e24"/>
  <rect x="2" y="6" width="12" height="7" fill="#3f8a32"/>
  <rect x="4" y="3" width="8" height="5" fill="#5aaa40"/>
  <rect x="6" y="1" width="4" height="3" fill="#7dba45"/>
  <rect x="4" y="5" width="2" height="2" fill="#c8e57a"/>
  <rect x="9" y="7" width="2" height="2" fill="#2f7a28"/>
`, 16, 18);

const CITY_BUILDINGS = [
  { id: "bakery", name: "Bakery", x: 1, y: 1, w: 3, h: 3 },
  { id: "cafe", name: "Cafe", x: 5, y: 1, w: 3, h: 3 },
  { id: "hq", name: "Farmer's HQ", x: 15, y: 1, w: 4, h: 3 },
  { id: "library", name: "Library", x: 21, y: 1, w: 2, h: 3 },
  { id: "bank", name: "Bank", x: 1, y: 4, w: 3, h: 2 },
  { id: "fountain", name: "Fountain", x: 7, y: 4, w: 2, h: 2 },
  { id: "exchange", name: "Exchange", x: 10, y: 0, w: 3, h: 6 },
  { id: "cottage", name: "Cottage", x: 16, y: 4, w: 2, h: 2 },
  { id: "cottage", name: "Cottage", x: 19, y: 4, w: 2, h: 2 },
  { id: "monsango", name: "Monsango", x: 4, y: 9, w: 4, h: 3 },
  { id: "cottage", name: "Cottage", x: 1, y: 10, w: 2, h: 2 },
  { id: "market", name: "Market Hall", x: 15, y: 9, w: 3, h: 3 },
  { id: "chapel", name: "Chapel", x: 19, y: 9, w: 3, h: 3 },
];

const CITY_LAMPS = [[10, 8], [12, 8]];

const CITY_ART = {
  bakery: px(`
    <rect x="12" y="0" width="4" height="4" fill="#6b3e24"/>
    <rect x="2" y="3" width="28" height="5" fill="#c4473a"/>
    <rect x="2" y="6" width="28" height="2" fill="#f6edd8"/>
    <rect x="3" y="8" width="26" height="22" fill="#c9844a"/>
    <rect x="6" y="12" width="7" height="6" fill="#f6edd8"/>
    <rect x="19" y="12" width="7" height="6" fill="#f6edd8"/>
    <rect x="12" y="18" width="8" height="12" fill="#6b3e24"/>
    <rect x="7" y="14" width="5" height="2" fill="#e6b84a"/>
  `, 32, 32),
  cafe: px(`
    <rect x="1" y="4" width="30" height="5" fill="#3f8f4a"/>
    <rect x="1" y="8" width="30" height="2" fill="#f6edd8"/>
    <rect x="3" y="10" width="26" height="20" fill="#f3e2c4"/>
    <rect x="7" y="13" width="18" height="8" fill="#9fd4e0"/>
    <rect x="12" y="21" width="8" height="9" fill="#6b3e24"/>
    <rect x="4" y="26" width="5" height="4" fill="#7dba45"/>
  `, 32, 32),
  hq: px(`
    <rect x="8" y="0" width="32" height="4" fill="#3f8f4a"/>
    <rect x="2" y="4" width="44" height="6" fill="#7dba45"/>
    <rect x="4" y="10" width="40" height="20" fill="#eee6d6"/>
    <rect x="8" y="12" width="4" height="18" fill="#c9bfae"/>
    <rect x="18" y="12" width="4" height="18" fill="#c9bfae"/>
    <rect x="28" y="12" width="4" height="18" fill="#c9bfae"/>
    <rect x="36" y="12" width="4" height="18" fill="#c9bfae"/>
    <rect x="20" y="16" width="8" height="14" fill="#6b3e24"/>
    <rect x="22" y="6" width="4" height="3" fill="#f0c56a"/>
  `, 48, 32),
  library: px(`
    <rect x="2" y="2" width="28" height="6" fill="#3d5c8a"/>
    <rect x="4" y="8" width="24" height="22" fill="#f4efe4"/>
    <rect x="7" y="11" width="5" height="10" fill="#9fd4e0"/>
    <rect x="14" y="11" width="5" height="10" fill="#9fd4e0"/>
    <rect x="21" y="11" width="5" height="10" fill="#9fd4e0"/>
    <rect x="12" y="22" width="8" height="8" fill="#6b3e24"/>
  `, 32, 32),
  bank: px(`
    <rect x="2" y="2" width="28" height="5" fill="#9aa3a8"/>
    <rect x="6" y="7" width="3" height="16" fill="#d5dbe0"/>
    <rect x="14" y="7" width="3" height="16" fill="#d5dbe0"/>
    <rect x="22" y="7" width="3" height="16" fill="#d5dbe0"/>
    <rect x="4" y="23" width="24" height="7" fill="#6e787e"/>
    <rect x="12" y="14" width="8" height="12" fill="#2f4a38"/>
    <rect x="15" y="18" width="2" height="2" fill="#f0c56a"/>
  `, 32, 32),
  fountain: px(`
    <rect x="4" y="18" width="24" height="8" fill="#9aa3a8"/>
    <rect x="7" y="16" width="18" height="8" fill="#7eb7d4"/>
    <rect x="14" y="6" width="4" height="12" fill="#d5dbe0"/>
    <rect x="10" y="4" width="12" height="4" fill="#9fd4e0"/>
    <rect x="14" y="1" width="4" height="4" fill="#e8f6fb"/>
  `, 32, 32),
  cottage: HOUSE,
  monsango: px(`
    <rect x="0" y="2" width="48" height="6" fill="#8d3424"/>
    <rect x="4" y="8" width="40" height="22" fill="#e7c9a0"/>
    <rect x="7" y="11" width="8" height="6" fill="#9fd4e0"/>
    <rect x="20" y="11" width="8" height="6" fill="#f2d06a"/>
    <rect x="33" y="11" width="8" height="6" fill="#9fd4e0"/>
    <rect x="20" y="20" width="8" height="10" fill="#6b3e24"/>
    <rect x="2" y="14" width="6" height="8" fill="#f6edd8"/>
  `, 48, 32),
  market: px(`
    <rect x="0" y="4" width="8" height="6" fill="#c4473a"/>
    <rect x="8" y="4" width="8" height="6" fill="#f6edd8"/>
    <rect x="16" y="4" width="8" height="6" fill="#c4473a"/>
    <rect x="24" y="4" width="8" height="6" fill="#f6edd8"/>
    <rect x="2" y="10" width="4" height="18" fill="#6b3e24"/>
    <rect x="26" y="10" width="4" height="18" fill="#6b3e24"/>
    <rect x="6" y="16" width="20" height="10" fill="#c9844a"/>
    <rect x="8" y="18" width="4" height="4" fill="#e23d32"/>
    <rect x="14" y="18" width="4" height="4" fill="#7dba45"/>
    <rect x="20" y="18" width="4" height="4" fill="#f2d06a"/>
  `, 32, 32),
  exchange: px(`
    <rect x="12" y="0" width="8" height="6" fill="#6b3e24"/>
    <rect x="14" y="2" width="4" height="3" fill="#f0c56a"/>
    <rect x="2" y="6" width="28" height="5" fill="#c4473a"/>
    <rect x="3" y="11" width="26" height="24" fill="#f3e2c4"/>
    <rect x="6" y="15" width="6" height="6" fill="#9fd4e0"/>
    <rect x="20" y="15" width="6" height="6" fill="#9fd4e0"/>
    <rect x="6" y="25" width="6" height="6" fill="#9fd4e0"/>
    <rect x="20" y="25" width="6" height="6" fill="#9fd4e0"/>
    <rect x="3" y="35" width="26" height="27" fill="#e4c89a"/>
    <rect x="6" y="40" width="6" height="7" fill="#9fd4e0"/>
    <rect x="20" y="40" width="6" height="7" fill="#9fd4e0"/>
    <rect x="12" y="48" width="8" height="14" fill="#6b3e24"/>
    <rect x="16" y="54" width="2" height="2" fill="#f0c56a"/>
  `, 32, 64),
  chapel: px(`
    <rect x="14" y="0" width="4" height="6" fill="#d9d3c4"/>
    <rect x="12" y="2" width="8" height="2" fill="#f0c56a"/>
    <rect x="6" y="6" width="20" height="5" fill="#6e4a86"/>
    <rect x="4" y="11" width="24" height="19" fill="#f4efe4"/>
    <rect x="8" y="14" width="5" height="7" fill="#c9b6e2"/>
    <rect x="19" y="14" width="5" height="7" fill="#c9b6e2"/>
    <rect x="13" y="18" width="6" height="12" fill="#4a3428"/>
  `, 32, 32),
};

const LAMP = px(`
  <rect x="6" y="6" width="4" height="10" fill="#4a3428"/>
  <rect x="4" y="2" width="8" height="5" fill="#f0c56a"/>
  <rect x="6" y="1" width="4" height="2" fill="#fff1c2"/>
`, 16, 16);

const DIR_FROM_CODE = {
  ArrowUp: "up",
  KeyW: "up",
  ArrowDown: "down",
  KeyS: "down",
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right",
};

const TOOL_KEYS = {
  Digit1: { tool: "hoe" },
  Digit2: { tool: "water" },
  Digit3: { tool: "seed", seed: "wheat" },
  Digit4: { tool: "seed", seed: "carrot" },
  Digit5: { tool: "seed", seed: "tomato" },
  Digit6: { tool: "seed", seed: "cotton" },
};
const REACH = 42;

const $ = (id) => document.getElementById(id);

let world = null;

function bindWorld(data) {
  world = data;
}

let loaded = loadState();
let hasSave = loaded !== null;
let state = loaded || createNewState();
bindWorld(state);
let buildMode = false;
let buildPick = null;
let menuOpen = true;
let statusText = "Walk onto a plot. Space does whatever that soil needs next.";
if (state.plots.some(isReady)) statusText = "A crop is ready. Walk onto it and press Space to harvest.";
else if (state.plots.some((plot) => plot.crop)) statusText = "Walk onto a plot. Space waters, plants, or tills whatever it needs.";
let accumulator = 0;
let lastNow = 0;
let shopOpen = false;
let monsangoOpen = false;
let hqOpen = false;
let hqView = "active";
let marketOpen = false;
let marketDesk = "tab";
let marketView = "prices";
let acting = null;
let choreTimer = 0;
const CHORE_MS = 750;
let walking = false;
let walkTarget = null;
let moveSaveAt = 0;
let handJobs = [];
let handSaveAt = 0;
const held = new Set();
let chartGeom = null;
let hoverX = null;
let tiles = [];

function roundPrice(value) {
  return Math.round(value);
}

function gaussian() {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function stepPrice(crop, price) {
  const next = price + crop.kappa * (crop.mean - price) + gaussian() * crop.sigma;
  const floor = crop.mean * 0.35;
  const cap = crop.mean * 2.4;
  return Math.min(cap, Math.max(floor, next));
}

function noun(crop, qty) {
  return qty === 1 ? crop.singular : crop.plural;
}

function inBounds(x, y) {
  return x >= 0 && y >= 0 && x < MAP_COLS && y < MAP_ROWS;
}

function cityBuilding(x, y) {
  return CITY_BUILDINGS.find((building) => (
    x >= building.x && y >= building.y && x < building.x + building.w && y < building.y + building.h
  )) || null;
}

function cityRole(x, y) {
  if (x >= 10 && x <= 12 && y >= 8) return "street";
  if (y === 6 || y === 7) return "street";
  if (y >= 12) return "plaza";
  const building = cityBuilding(x, y);
  return building ? building.id : "plaza";
}

function roleAt(x, y, place) {
  if (!inBounds(x, y)) return "void";
  const here = place || (state.place === "city" ? "city" : "farm");
  if (here === "city") return cityRole(x, y);
  if (x === 19 && (y === 5 || y === 6)) return "shop";
  if (x === 17 && y === 10) return "bed";
  if (x >= 17 && x <= 19 && y >= 8 && y <= 10) return "house";
  const well = world && world.well ? world.well : { x: 1, y: 12 };
  if (x === well.x && y === well.y) return "well";
  if (isTree(x, y)) return "tree";
  if (x === 16 && y >= 0 && y <= 12) return "path";
  if (y === 7 && x >= 16 && x <= 21) return "path";
  if (world && world.plots) {
    if (plotAt(x, y)) return "field";
  } else if (x >= FIELD.x && x < FIELD.x + FIELD.w && y >= FIELD.y && y < FIELD.y + FIELD.h) {
    return "field";
  }
  return "grass";
}

function isTree(x, y) {
  return (x === 0 && y === 6)
    || (x === 23 && y === 6)
    || (x === 0 && y === 13)
    || (x === 23 && y === 13)
    || (x === 15 && y === 4)
    || (x === 12 && y === 1)
    || (x === 8 && y === 12)
    || (x === 22 && y === 8)
    || (x === 21 && y === 12);
}

function walkable(x, y, place) {
  const role = roleAt(x, y, place);
  return role === "grass" || role === "path" || role === "field" || role === "plaza" || role === "street";
}

function plotIndex(x, y) {
  return (y - FIELD.y) * FIELD.w + (x - FIELD.x);
}

function plotAt(x, y) {
  const plots = world && world.plots;
  if (!plots) return null;
  for (let i = 0; i < plots.length; i += 1) {
    const plot = plots[i];
    if (plot.x === x && plot.y === y) return plot;
  }
  return null;
}

function placePlots(plots) {
  const seen = new Set();
  plots.forEach((plot, index) => {
    const homeX = FIELD.x + (index % FIELD.w);
    const homeY = FIELD.y + Math.floor(index / FIELD.w);
    if (typeof plot.x !== "number" || typeof plot.y !== "number") {
      plot.x = homeX;
      plot.y = homeY;
    }
    plot.x |= 0;
    plot.y |= 0;
    const key = `${plot.x},${plot.y}`;
    if (!inBounds(plot.x, plot.y) || seen.has(key)) {
      plot.x = homeX;
      plot.y = homeY;
    }
    seen.add(`${plot.x},${plot.y}`);
  });
}

function emptyPlot() {
  return { tilled: false, watered: false, crop: null, progress: 0, owned: false };
}

function freshPrices() {
  const history = {};
  const prices = {};
  ORDER.forEach((id) => {
    const crop = CROPS[id];
    const series = [];
    let price = crop.mean;
    for (let i = 0; i < HISTORY; i += 1) {
      price = roundPrice(stepPrice(crop, price));
      series.push(price);
    }
    history[id] = series;
    prices[id] = series[series.length - 1];
  });
  return { history, prices };
}

function starterPlots() {
  const plots = Array.from({ length: PLOT_COUNT }, (_, index) => {
    const plot = emptyPlot();
    plot.x = FIELD.x + (index % FIELD.w);
    plot.y = FIELD.y + Math.floor(index / FIELD.w);
    return plot;
  });
  for (let row = 0; row < STARTER_PLOTS.h; row += 1) {
    for (let col = 0; col < STARTER_PLOTS.w; col += 1) {
      plots[row * FIELD.w + col].owned = true;
    }
  }
  return plots;
}

function createNewState() {
  const { history, prices } = freshPrices();
  return {
    version: 2,
    gold: 80,
    day: 1,
    hour: 6,
    tool: "hoe",
    player: { x: 16, y: 6, px: 16 * TILE, py: 6 * TILE, facing: "left" },
    seeds: { wheat: 10, carrot: 0, tomato: 0, cotton: 0 },
    goods: { wheat: 0, carrot: 0, tomato: 0, cotton: 0 },
    plots: starterPlots(),
    prices,
    history,
    log: ["Six plots and ten wheat seeds. More land is at Trailer Supply."],
    selectedSeed: "wheat",
    marketCrop: "wheat",
    view: "farm",
    place: "farm",
    mapScale: TILE,
    worldCols: MAP_COLS,
    worldRows: MAP_ROWS,
    growPace: 4,
    water: CAN_MAX,
    sprinklers: 0,
    farmhand: false,
    hands: [],
    handPaid: false,
    harvested: { wheat: 0, carrot: 0, tomato: 0, cotton: 0 },
    hammer: false,
    stockMarket: false,
    trades: [],
    basis: { wheat: { qty: 0, cost: 0 }, carrot: { qty: 0, cost: 0 }, tomato: { qty: 0, cost: 0 }, cotton: { qty: 0, cost: 0 } },
    well: { x: 14, y: 13 },
  };
}

function isValidSave(data) {
  if (!data || data.version !== 2) return false;
  if (!Array.isArray(data.plots) || data.plots.length !== PLOT_COUNT) return false;
  if (!data.prices || !data.history || !data.seeds || !data.goods || !data.player) return false;
  if (typeof data.gold !== "number" || typeof data.day !== "number" || typeof data.hour !== "number") return false;
  if (!walkable(data.player.x, data.player.y, data.place === "city" ? "city" : "farm")) return false;
  for (const id of ORDER) {
    if (typeof data.prices[id] !== "number") return false;
    if (!Array.isArray(data.history[id]) || data.history[id].length < 2) return false;
    if (typeof data.seeds[id] !== "number" || typeof data.goods[id] !== "number") return false;
  }
  return data.plots.every((plot) => plot && (plot.crop === null || CROPS[plot.crop]));
}

function normalize(data) {
  data.view = "farm";
  data.place = data.place === "city" ? "city" : "farm";
  data.selectedSeed = CROPS[data.selectedSeed] ? data.selectedSeed : "wheat";
  data.marketCrop = CROPS[data.marketCrop] ? data.marketCrop : "wheat";
  data.tool = TOOLS.includes(data.tool) ? data.tool : "hoe";
  data.player.facing = FACING[data.player.facing] ? data.player.facing : "left";
  if (data.mapScale !== TILE) {
    const from = typeof data.mapScale === "number" ? data.mapScale : 40;
    const scale = TILE / from;
    if (typeof data.player.px === "number") data.player.px *= scale;
    if (typeof data.player.py === "number") data.player.py *= scale;
    data.mapScale = TILE;
  }
  if (typeof data.player.px !== "number" || typeof data.player.py !== "number") {
    data.player.px = (data.player.x | 0) * TILE;
    data.player.py = (data.player.y | 0) * TILE;
  }
  data.hammer = Boolean(data.hammer);
  data.stockMarket = Boolean(data.stockMarket);
  data.trades = Array.isArray(data.trades)
    ? data.trades.filter((trade) => trade && CROPS[trade.crop] && (trade.side === "buy" || trade.side === "sell")).slice(0, 40)
    : [];
  if (!data.well || typeof data.well.x !== "number" || typeof data.well.y !== "number") {
    data.well = { x: 14, y: 13 };
  }
  data.well.x |= 0;
  data.well.y |= 0;
  const oldStart = (data.well.x === 1 && data.well.y === 12) || (data.well.x === 4 && data.well.y === 13);
  if (!inBounds(data.well.x, data.well.y) || oldStart) {
    data.well = { x: 14, y: 13 };
  }
  placePlots(data.plots);
  bindWorld(data);
  const foot = footFrom(data.player.px, data.player.py);
  const tile = tileAtPixel(foot.x, foot.y);
  if (!walkable(tile.x, tile.y, data.place)) {
    data.player.px = (data.player.x | 0) * TILE;
    data.player.py = (data.player.y | 0) * TILE;
  }
  const stood = tileAtPixel(footFrom(data.player.px, data.player.py).x, footFrom(data.player.px, data.player.py).y);
  data.player.x = stood.x;
  data.player.y = stood.y;
  data.log = Array.isArray(data.log) ? data.log.slice(0, 8).map(String) : [];
  data.hour = Math.max(0, Math.min(23, data.hour | 0));
  data.day = Math.max(1, data.day | 0);
  data.gold = Math.max(0, Math.round(data.gold));
  data.water = typeof data.water === "number"
    ? Math.max(0, Math.min(CAN_MAX, Math.round(data.water)))
    : CAN_MAX;
  data.sprinklers = Math.max(0, data.sprinklers | 0);
  if (!Array.isArray(data.hands)) data.hands = [];
  if (data.farmhand && data.hands.length === 0) {
    const prior = data.hand && typeof data.hand.px === "number" ? data.hand : null;
    data.hands = [{
      px: prior ? prior.px : FIELD.x * TILE,
      py: prior ? prior.py : (FIELD.y + FIELD.h) * TILE,
      facing: prior && FACING[prior.facing] ? prior.facing : "up",
    }];
  }
  data.hands = data.hands.filter((hand) => hand && typeof hand.px === "number" && typeof hand.py === "number").slice(0, MAX_HANDS).map((hand) => ({
    px: hand.px,
    py: hand.py,
    facing: FACING[hand.facing] ? hand.facing : "up",
  }));
  data.farmhand = data.hands.length > 0;
  data.hand = data.hands[0] || null;
  data.handPaid = data.farmhand ? data.handPaid !== false : false;
  data.harvested = data.harvested && typeof data.harvested === "object" ? data.harvested : {};
  ORDER.forEach((id) => {
    data.harvested[id] = Math.max(0, data.harvested[id] | 0);
  });
  ORDER.forEach((id) => {
    data.seeds[id] = Math.max(0, Math.floor(data.seeds[id]));
    data.goods[id] = Math.max(0, Math.floor(data.goods[id]));
    data.prices[id] = roundPrice(data.prices[id]);
    data.history[id] = data.history[id].slice(-HISTORY).map(roundPrice);
  });
  data.basis = replayBasis(data.trades, data.basis, data.goods);
  data.plots.forEach((plot) => {
    plot.tilled = Boolean(plot.tilled);
    plot.watered = Boolean(plot.watered);
    plot.progress = Math.max(0, plot.progress | 0);
    if (data.growPace !== 3 && data.growPace !== 4 && plot.crop) plot.progress *= 3;
    if (data.growPace !== 4 && plot.crop) plot.progress *= 2;
    if (!CROPS[plot.crop]) {
      plot.crop = null;
      plot.progress = 0;
    }
    if (plot.owned === undefined) plot.owned = true;
    plot.owned = Boolean(plot.owned) || Boolean(plot.crop) || plot.tilled;
  });
  if (data.growPace !== 4) data._fitted = true;
  data.growPace = 4;
  return data;
}

function migrateOldMap(data) {
  if (!data || !Array.isArray(data.plots) || data.plots.length !== 24) return;
  const next = Array.from({ length: PLOT_COUNT }, emptyPlot);
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 6; col += 1) {
      const plot = data.plots[row * 6 + col];
      if (plot) next[row * FIELD.w + col] = plot;
    }
  }
  data.plots = next;
  const ox = (data.player && data.player.x) | 0;
  const oy = (data.player && data.player.y) | 0;
  let nx = 16;
  let ny = 6;
  if (ox >= 1 && ox <= 6 && oy >= 2 && oy <= 5) {
    nx = FIELD.x + (ox - 1);
    ny = FIELD.y + (oy - 2);
  }
  if (!walkable(nx, ny, "farm")) {
    nx = 16;
    ny = 6;
  }
  data.player.x = nx;
  data.player.y = ny;
  data.player.px = nx * TILE;
  data.player.py = ny * TILE;
}

function fitWorld(data) {
  if (!data || !data.player) return false;
  let moved = false;
  if (data.worldCols === 48 && data.worldRows === 32) {
    const dx = 12;
    const dy = 9;
    data.player.x = (data.player.x | 0) - dx;
    data.player.y = (data.player.y | 0) - dy;
    const from = typeof data.mapScale === "number" ? data.mapScale : TILE;
    if (typeof data.player.px === "number") data.player.px -= dx * from;
    if (typeof data.player.py === "number") data.player.py -= dy * from;
    moved = true;
  }
  const place = data.place === "city" ? "city" : "farm";
  if (!inBounds(data.player.x | 0, data.player.y | 0) || !walkable(data.player.x | 0, data.player.y | 0, place)) {
    if (place === "city") {
      data.player.x = 11;
      data.player.y = 11;
    } else {
      data.player.x = 16;
      data.player.y = 6;
    }
    data.player.px = data.player.x * TILE;
    data.player.py = data.player.y * TILE;
    moved = true;
  }
  data.worldCols = MAP_COLS;
  data.worldRows = MAP_ROWS;
  return moved;
}

function loadState() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    migrateOldMap(data);
    const fitted = fitWorld(data);
    if (!isValidSave(data)) return null;
    const next = normalize(data);
    if (fitted) next._fitted = true;
    return next;
  } catch {
    return null;
  }
}

function save() {
  try {
    if (state && state._fitted) delete state._fitted;
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch {
    // Storage can be blocked. The session still plays.
  }
}

function log(message) {
  state.log.unshift(message);
  state.log.length = Math.min(state.log.length, 8);
}

function setStatus(message) {
  statusText = message;
}

function formatHour(hour) {
  const shown = hour % 12 === 0 ? 12 : hour % 12;
  const suffix = hour < 12 ? "AM" : "PM";
  return `${shown}:00 ${suffix}`;
}

function netWorth() {
  let total = state.gold;
  ORDER.forEach((id) => {
    total += state.goods[id] * state.prices[id];
  });
  return Math.round(total);
}

function joinNames(names) {
  if (names.length === 1) return names[0];
  if (typeof Intl.ListFormat === "function") {
    return new Intl.ListFormat("en", { type: "conjunction" }).format(names);
  }
  return names.join(" and ");
}

function formatGold(amount) {
  return `${Math.round(amount).toLocaleString()}g`;
}

function directionOf(id) {
  const series = state.history[id];
  const delta = series[series.length - 1] - series[series.length - 2];
  if (delta > 0) return "up";
  if (delta < 0) return "down";
  return "flat";
}

function versus(id) {
  const pct = Math.round(((state.prices[id] - CROPS[id].mean) / CROPS[id].mean) * 100);
  if (Math.abs(pct) < 1) return "At Fair Value";
  if (pct > 0) return `${pct}% above Fair Value`;
  return `${Math.abs(pct)}% below Fair Value`;
}

const QTY_STEPS = [100, 1000, 10000];
const SEED_QTY = [1, 10, 100];
let tradeQty = 100;
let seedQty = 1;

function readQty() {
  return QTY_STEPS.includes(tradeQty) ? tradeQty : 100;
}

function growthGoal(crop) {
  return crop.growHours * 2;
}

function hoursLeft(plot) {
  const remaining = Math.max(0, growthGoal(CROPS[plot.crop]) - plot.progress);
  return Math.ceil(remaining / (plot.watered ? 2 : 1));
}

function isReady(plot) {
  return Boolean(plot.crop) && plot.progress >= growthGoal(CROPS[plot.crop]);
}

function stepPrices() {
  ORDER.forEach((id) => {
    const next = roundPrice(stepPrice(CROPS[id], state.prices[id]));
    const series = state.history[id];
    series.push(next);
    if (series.length > HISTORY) series.shift();
    state.prices[id] = next;
  });
}

function ripeLine(ripe) {
  if (ripe.length === 1) return `${ripe[0]} is ready to harvest.`;
  if (ripe.length > 1) return `${joinNames(ripe)} are ready to harvest.`;
  return "";
}

function growCrops() {
  const ripe = [];
  state.plots.forEach((plot) => {
    if (!plot.crop) {
      plot.watered = false;
      return;
    }
    if (isReady(plot)) return;
    plot.progress += plot.watered ? 2 : 1;
    if (isReady(plot)) ripe.push(CROPS[plot.crop].name);
  });
  return [...new Set(ripe)];
}

function runSprinklers() {
  let left = state.sprinklers * SPRINKLER_PLOTS;
  if (left <= 0) return 0;
  let watered = 0;
  state.plots.forEach((plot) => {
    if (left <= 0 || !plot.owned || !plot.crop || plot.watered || isReady(plot)) return;
    plot.watered = true;
    left -= 1;
    watered += 1;
  });
  return watered;
}

function seedToPlant() {
  if (state.seeds[state.selectedSeed] > 0) return state.selectedSeed;
  return ORDER.find((id) => state.seeds[id] > 0) || null;
}

function payFarmhand() {
  const crew = state.hands.length;
  const cost = crew * FARMHAND_WAGE;
  if (state.gold < cost) {
    state.handPaid = false;
    handJobs = state.hands.map(() => null);
    hideHandFx();
    return crew === 1
      ? `The farmhand is idle today. The wage is ${FARMHAND_WAGE}g.`
      : `The crew is idle today. Wages are ${cost}g.`;
  }
  state.gold -= cost;
  state.handPaid = true;
  return crew === 1 ? `Paid the farmhand ${cost}g.` : `Paid the crew ${cost}g.`;
}

function syncCrew() {
  state.farmhand = state.hands.length > 0;
  state.hand = state.hands[0] || null;
  if (!state.farmhand) state.handPaid = false;
  handJobs.length = state.hands.length;
}

function spawnHand(index) {
  return {
    px: FIELD.x * TILE + index * 16,
    py: (FIELD.y + FIELD.h) * TILE,
    facing: "up",
  };
}

function noteHarvest(id, qty) {
  if (!state.harvested) state.harvested = {};
  state.harvested[id] = (state.harvested[id] || 0) + qty;
}

function handStand(tx, ty) {
  return {
    x: tx * TILE + TILE / 2 - BODY.ox,
    y: ty * TILE + TILE * 0.62 - BODY.oy,
  };
}

function handJobNeeded(job) {
  const plot = plotAt(job.x, job.y);
  if (!plot || !plot.owned) return false;
  if (acting && acting.x === job.x && acting.y === job.y) return false;
  if (job.id === "harvest") return isReady(plot);
  if (job.id === "water") return Boolean(plot.crop) && !plot.watered && !isReady(plot);
  if (job.id === "plant") return plot.tilled && !plot.crop && Boolean(seedToPlant());
  if (job.id === "till") return !plot.tilled && !plot.crop;
  return false;
}

function claimedPlot(x, y, except) {
  return handJobs.some((job, index) => index !== except && job && job.x === x && job.y === y);
}

function chooseHandJob(index) {
  const hand = state.hands[index];
  if (!hand) return null;
  let best = null;
  let bestRank = 99;
  let bestDist = Infinity;
  state.plots.forEach((plot) => {
    if (!plot.owned) return;
    const x = plot.x;
    const y = plot.y;
    if (claimedPlot(x, y, index)) return;
    let id = null;
    let rank = 9;
    if (isReady(plot)) {
      id = "harvest";
      rank = 0;
    } else if (plot.crop && !plot.watered) {
      id = "water";
      rank = 1;
    } else if (plot.tilled && !plot.crop && seedToPlant()) {
      id = "plant";
      rank = 2;
    } else if (!plot.tilled && !plot.crop) {
      id = "till";
      rank = 3;
    }
    if (!id) return;
    if (acting && acting.x === x && acting.y === y) return;
    const stand = handStand(x, y);
    const dist = Math.hypot(stand.x - hand.px, stand.y - hand.py);
    if (rank < bestRank || (rank === bestRank && dist < bestDist)) {
      bestRank = rank;
      bestDist = dist;
      best = { id, x, y, seed: id === "plant" ? seedToPlant() : plot.crop, left: null };
    }
  });
  return best;
}

function handFx(index) {
  let fx = document.getElementById(`hand-fx-${index}`);
  if (!fx) {
    fx = document.createElement("div");
    fx.id = `hand-fx-${index}`;
    fx.className = "chore-fx hand-fx";
    fx.hidden = true;
    const scene = $("farm-scene");
    if (scene) scene.append(fx);
  }
  return fx;
}

function showHandFx(index, id, x, y) {
  const fx = handFx(index);
  if (!fx) return;
  fx.hidden = false;
  fx.dataset.chore = id;
  fx.style.transform = `translate(${x * TILE}px, ${y * TILE}px)`;
  const bits = {
    till: "<i></i><i></i><i></i><i></i>",
    plant: '<i class="seed"></i><i class="sprout"></i><i class="heart"></i>',
    water: "<i></i><i></i><i></i><i></i><i></i>",
    harvest: "<i></i><i></i><i></i><b>+1</b>",
  };
  fx.innerHTML = bits[id] || "";
}

function hideHandFx(index) {
  if (index == null) {
    document.querySelectorAll(".hand-fx").forEach((fx) => {
      fx.hidden = true;
      fx.innerHTML = "";
      delete fx.dataset.chore;
    });
    return;
  }
  const fx = document.getElementById(`hand-fx-${index}`);
  if (!fx) return;
  fx.hidden = true;
  fx.innerHTML = "";
  delete fx.dataset.chore;
}

function finishHandJob(index) {
  const job = handJobs[index];
  handJobs[index] = null;
  hideHandFx(index);
  if (!job || !handJobNeeded(job)) return;
  const plot = plotAt(job.x, job.y);
  if (job.id === "plant") {
    const seed = seedToPlant();
    if (!seed) return;
    state.seeds[seed] -= 1;
    plot.crop = seed;
    plot.progress = 0;
  } else if (job.id === "water") {
    plot.watered = true;
  } else if (job.id === "harvest") {
    state.goods[plot.crop] += 1;
    noteHarvest(plot.crop, 1);
    plot.crop = null;
    plot.progress = 0;
    plot.watered = false;
    plot.tilled = false;
  } else if (job.id === "till") {
    plot.tilled = true;
    plot.watered = false;
  }
  save();
  paint();
}

function updateHand(dt) {
  if (!state.hands.length) {
    handJobs = [];
    return;
  }
  if (!state.handPaid) {
    handJobs = state.hands.map(() => null);
    hideHandFx();
    return;
  }
  if (menuOpen) return;
  let moved = false;
  state.hands.forEach((hand, index) => {
    let job = handJobs[index];
    if (job && job.left != null) {
      job.left -= dt * 1000;
      if (job.left <= 0) finishHandJob(index);
      return;
    }
    if (!job || !handJobNeeded(job)) {
      job = chooseHandJob(index);
      handJobs[index] = job;
    }
    if (!job) return;
    const stand = handStand(job.x, job.y);
    const vx = stand.x - hand.px;
    const vy = stand.y - hand.py;
    const length = Math.hypot(vx, vy);
    if (length < 8) {
      if (!handJobNeeded(job)) {
        handJobs[index] = null;
        return;
      }
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      job.left = reduce ? 0 : CHORE_MS;
      if (Math.abs(vx) >= Math.abs(vy)) hand.facing = vx >= 0 ? "right" : "left";
      showHandFx(index, job.id, job.x, job.y);
      if (job.left <= 0) finishHandJob(index);
      return;
    }
    const step = Math.min(length, WALK_SPEED * 0.25 * dt);
    const before = hand.px + hand.py;
    hand.px = moveAxis(hand.px, (vx / length) * step, (px) => canStand(px, hand.py, "farm"));
    hand.py = moveAxis(hand.py, (vy / length) * step, (py) => canStand(hand.px, py, "farm"));
    if (Math.abs(vx) >= Math.abs(vy)) hand.facing = vx > 0 ? "right" : "left";
    else hand.facing = vy > 0 ? "down" : "up";
    if (before !== hand.px + hand.py) moved = true;
  });
  if (moved && performance.now() - handSaveAt > 500) {
    save();
    handSaveAt = performance.now();
  }
}

function paintHand() {
  const scene = $("farm-scene");
  if (!scene) return;
  const nodes = [...scene.querySelectorAll(".player.hand")];
  const show = state.place !== "city";
  while (nodes.length < state.hands.length) {
    const hand = document.createElement("div");
    hand.className = "player hand";
    hand.hidden = true;
    scene.append(hand);
    nodes.push(hand);
  }
  nodes.forEach((node, index) => {
    const hand = state.hands[index];
    if (!hand || !show) {
      node.hidden = true;
      return;
    }
    node.hidden = false;
    const pose = hand.facing === "up" ? "back" : "front";
    if (node.dataset.pose !== pose) {
      node.dataset.pose = pose;
      node.innerHTML = pose === "back" ? HELPER_BACK : HELPER;
    }
    const job = handJobs[index];
    node.dataset.facing = hand.facing;
    node.classList.toggle("walking", Boolean(job) && job.left == null);
    node.classList.toggle("acting", Boolean(job) && job.left != null);
    if (job && job.left != null) node.dataset.chore = job.id;
    else delete node.dataset.chore;
    node.style.transform = `translate(${hand.px}px, ${hand.py}px)`;
  });
  if (!show) hideHandFx();
}

function beginMorning() {
  state.day += 1;
  const helpNote = state.farmhand ? payFarmhand() : "";
  runSprinklers();
  const ripe = growCrops();
  const readyLine = ripeLine(ripe);
  const line = [helpNote, readyLine].filter(Boolean).join(" ");
  log(line ? `Day ${state.day} begins. ${line}` : `Day ${state.day} begins.`);
  setStatus(line ? `Morning. ${line}` : "Morning.");
  save();
  paint();
}

function tickHour() {
  state.hour = (state.hour + 1) % 24;
  stepPrices();
  if (state.hour === 6) {
    beginMorning();
    return;
  }
  runSprinklers();
  const readyLine = ripeLine(growCrops());
  if (readyLine) {
    log(readyLine);
    setStatus(readyLine);
  }
  save();
  paint();
}

function footFrom(px, py) {
  return { x: px + BODY.ox, y: py + BODY.oy };
}

function tileAtPixel(x, y) {
  return { x: Math.floor(x / TILE), y: Math.floor(y / TILE) };
}

function feet() {
  return footFrom(state.player.px, state.player.py);
}

function canStand(px, py, place) {
  const spot = footFrom(px, py);
  const points = [
    [spot.x - BODY.hw, spot.y - BODY.hh],
    [spot.x + BODY.hw, spot.y - BODY.hh],
    [spot.x - BODY.hw, spot.y + BODY.hh],
    [spot.x + BODY.hw, spot.y + BODY.hh],
  ];
  const width = MAP_COLS * TILE;
  const height = MAP_ROWS * TILE;
  return points.every(([x, y]) => {
    if (x < 2 || y < 2 || x >= width - 2 || y >= height - 2) return false;
    return walkable(Math.floor(x / TILE), Math.floor(y / TILE), place);
  });
}

function moveAxis(current, delta, test) {
  if (!delta) return current;
  if (test(current + delta)) return current + delta;
  const sign = Math.sign(delta);
  const max = Math.abs(delta);
  for (let step = max - 1; step >= 1; step -= 1) {
    if (test(current + sign * step)) return current + sign * step;
  }
  return current;
}

function moveBy(dx, dy) {
  const before = tileAtPixel(feet().x, feet().y);
  state.player.px = moveAxis(state.player.px, dx, (px) => canStand(px, state.player.py));
  state.player.py = moveAxis(state.player.py, dy, (py) => canStand(state.player.px, py));
  const spot = feet();
  const tile = tileAtPixel(spot.x, spot.y);
  state.player.x = tile.x;
  state.player.y = tile.y;
  if (state.place !== "city" && before.x === 16 && before.y === 1 && tile.x === 16 && tile.y === 0) {
    enterCity();
  } else if (state.place === "city" && before.y === MAP_ROWS - 2 && tile.y === MAP_ROWS - 1 && tile.x >= 10 && tile.x <= 12) {
    enterFarm();
  }
}

function enterCity() {
  buildMode = false;
  buildPick = null;
  state.place = "city";
  state.player.x = 11;
  state.player.y = 11;
  state.player.px = 11 * TILE;
  state.player.py = 11 * TILE;
  state.player.facing = "up";
  walkTarget = null;
  paintPlace();
  save();
  paint();
}

function enterFarm() {
  state.place = "farm";
  state.player.x = 16;
  state.player.y = 2;
  state.player.px = 16 * TILE;
  state.player.py = 2 * TILE;
  state.player.facing = "down";
  walkTarget = null;
  paintPlace();
  save();
  paint();
}

function faceFromDelta(dx, dy) {
  if (!dx && !dy) return;
  if (Math.abs(dx) >= Math.abs(dy)) state.player.facing = dx > 0 ? "right" : "left";
  else state.player.facing = dy > 0 ? "down" : "up";
}

function tileDistance(tx, ty) {
  const spot = feet();
  const left = tx * TILE;
  const top = ty * TILE;
  const nearX = Math.min(Math.max(spot.x, left), left + TILE);
  const nearY = Math.min(Math.max(spot.y, top), top + TILE);
  return Math.hypot(spot.x - nearX, spot.y - nearY);
}

function nearbyPlot() {
  let best = null;
  let bestD = REACH + 1;
  state.plots.forEach((plot) => {
    if (!plot.owned) return;
    const distance = tileDistance(plot.x, plot.y);
    if (distance < bestD) {
      bestD = distance;
      best = { x: plot.x, y: plot.y, distance };
    }
  });
  return best && best.distance <= REACH ? best : null;
}

function nearbyRole(roles) {
  let best = null;
  let bestD = REACH + 1;
  for (let y = 0; y < MAP_ROWS; y += 1) {
    for (let x = 0; x < MAP_COLS; x += 1) {
      const role = roleAt(x, y);
      if (!roles.includes(role)) continue;
      const distance = tileDistance(x, y);
      if (distance < bestD) {
        bestD = distance;
        best = { x, y, role, distance };
      }
    }
  }
  return best && best.distance <= REACH ? best : null;
}

function faceTile(tx, ty) {
  const spot = feet();
  faceFromDelta((tx + 0.5) * TILE - spot.x, (ty + 0.62) * TILE - spot.y);
}

function showChoreFx(id, x, y) {
  const fx = $("chore-fx");
  fx.hidden = false;
  fx.dataset.chore = id;
  fx.style.transform = `translate(${x * TILE}px, ${y * TILE}px)`;
  const bits = {
    till: "<i></i><i></i><i></i><i></i>",
    plant: '<i class="seed"></i><i class="sprout"></i><i class="heart"></i>',
    water: "<i></i><i></i><i></i><i></i><i></i>",
    harvest: "<i></i><i></i><i></i><b>+1</b>",
  };
  fx.innerHTML = bits[id];
}

function hideChoreFx() {
  const fx = $("chore-fx");
  if (!fx) return;
  fx.hidden = true;
  fx.innerHTML = "";
  delete fx.dataset.chore;
}

function finishChore() {
  const job = acting;
  acting = null;
  choreTimer = 0;
  if (!job) return;
  const plot = plotAt(job.x, job.y);
  if (job.id === "till") {
    plot.tilled = true;
    plot.watered = false;
    setStatus("Soil turned. Plant a seed. Watering is optional and halves the grow time.");
  } else if (job.id === "plant") {
    const crop = CROPS[job.seed];
    plot.crop = job.seed;
    plot.progress = 0;
    log(`Planted ${crop.singular}.`);
    setStatus(plot.watered
      ? `Planted ${crop.singular}. It's watered, so it finishes in half the time.`
      : `Planted ${crop.singular}. It grows either way. Water once to halve the time until harvest.`);
  } else if (job.id === "water") {
    plot.watered = true;
    setStatus(plot.crop ? "Watered for the rest of its growth. That halves the time left." : "Watered soil. It dries within the hour if nothing is planted.");
  } else if (job.id === "harvest") {
    const crop = CROPS[job.seed];
    state.goods[job.seed] += 1;
    noteHarvest(job.seed, 1);
    plot.crop = null;
    plot.progress = 0;
    plot.watered = false;
    plot.tilled = false;
    log(`Harvested 1 ${crop.singular}.`);
    setStatus(`Harvested 1 ${crop.singular}. Sell it on the market when the price suits you.`);
  }
  hideChoreFx();
  save();
  paint();
}

function startChore(id, x, y) {
  if (acting) return;
  const plot = plotAt(x, y);
  if (!plot) return;
  const job = { id, x, y, seed: null, label: "Working…" };
  if (id === "till") {
    job.label = "Tilling…";
    if (plot.crop) {
      setStatus("A crop is already growing there.");
      paint();
      return;
    }
    if (plot.tilled) {
      setStatus("That plot is already tilled.");
      paint();
      return;
    }
  } else if (id === "water") {
    job.label = "Watering…";
    if (!plot.tilled) {
      setStatus("Till that plot with the hoe before you water it.");
      paint();
      return;
    }
    if (plot.watered) {
      setStatus("That plot is already watered.");
      paint();
      return;
    }
    if (state.water <= 0) {
      setStatus("The can is empty. Fill it at the well in the bottom left.");
      paint();
      return;
    }
    state.water -= 1;
  } else if (id === "plant") {
    const seed = state.selectedSeed;
    const crop = CROPS[seed];
    job.label = "Planting…";
    job.seed = seed;
    if (plot.crop) {
      setStatus(`${CROPS[plot.crop].name} is already planted there.`);
      paint();
      return;
    }
    if (!plot.tilled) {
      setStatus("Till the plot with the hoe before you plant.");
      paint();
      return;
    }
    if (state.seeds[seed] <= 0) {
      setStatus(`No ${crop.singular} seeds. Buy them at Trailer Supply.`);
      paint();
      return;
    }
    state.seeds[seed] -= 1;
  } else if (id === "harvest") {
    if (!plot.crop || !isReady(plot)) return;
    job.label = "Harvesting…";
    job.seed = plot.crop;
  } else {
    return;
  }
  faceTile(x, y);
  walkTarget = null;
  walking = false;
  acting = job;
  showChoreFx(id, x, y);
  paint();
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  choreTimer = window.setTimeout(finishChore, reduce ? 0 : CHORE_MS);
}

function nextAction(plot) {
  if (plot.crop && isReady(plot)) return { id: "harvest", label: `Harvest ${CROPS[plot.crop].name}` };
  const tool = state.tool;
  if (tool === "hoe" && !plot.crop && !plot.tilled) return { id: "till", label: "Till" };
  if (tool === "water" && plot.tilled && !plot.watered) return { id: "water", label: "Water" };
  if (tool !== "hoe" && tool !== "water" && plot.tilled && !plot.crop) {
    return { id: "plant", label: `Plant ${CROPS[state.selectedSeed].name}` };
  }
  if (plot.crop) {
    const left = hoursLeft(plot);
    const hint = plot.watered ? " Watered until harvest." : " Select the can to water it.";
    return {
      id: "wait",
      label: `${left} hour${left === 1 ? "" : "s"} left`,
      disabled: true,
      detail: `${CROPS[plot.crop].name} needs ${left} more hour${left === 1 ? "" : "s"}.${hint}`,
    };
  }
  if (!plot.tilled) {
    return { id: "wait", label: "Hoe", disabled: true, detail: "Select the hoe to till this plot." };
  }
  return { id: "wait", label: "Seed", disabled: true, detail: "Select a seed to plant." };
}

function offerHere() {
  if (state.place === "city") {
    const spots = ["exchange", "monsango", "hq"].map((role) => nearbyRole([role])).filter(Boolean);
    spots.sort((a, b) => a.distance - b.distance);
    const spot = spots[0];
    if (!spot) return null;
    if (spot.role === "hq") {
      return { kind: "hq", x: spot.x, y: spot.y, action: { id: "hq", label: "Farmer's HQ" } };
    }
    if (spot.role === "monsango") {
      return { kind: "monsango", x: spot.x, y: spot.y, action: { id: "monsango", label: "Monsango" } };
    }
    if (!state.stockMarket) {
      const short = state.gold < STOCK_PRICE;
      return {
        kind: "exchange",
        x: spot.x,
        y: spot.y,
        action: short
          ? { id: "unlock-stock", label: "Unlock 1000g", disabled: true, detail: "The stock market costs 1000g to unlock." }
          : { id: "unlock-stock", label: "Unlock 1000g" },
      };
    }
    return { kind: "exchange", x: spot.x, y: spot.y, action: { id: "exchange", label: "Stock Market" } };
  }
  const plot = nearbyPlot();
  if (plot) return { kind: "plot", x: plot.x, y: plot.y, action: nextAction(plotAt(plot.x, plot.y)) };
  const shop = nearbyRole(["shop"]);
  if (shop) return { kind: "shop", x: shop.x, y: shop.y, action: { id: "shop", label: "Trailer Supply" } };
  const well = nearbyRole(["well"]);
  if (well) {
    const full = state.water >= CAN_MAX;
    return {
      kind: "well",
      x: well.x,
      y: well.y,
      action: full
        ? { id: "fill", label: "Can full", disabled: true, detail: "The watering can is already full." }
        : { id: "fill", label: "Fill can" },
    };
  }
  return null;
}

function doOffer() {
  if (acting) return;
  const offer = offerHere();
  if (!offer) {
    setStatus("Walk onto a plot. Till it, plant a seed, then water it.");
    paint();
    return;
  }
  if (offer.action.disabled) {
    setStatus(offer.action.detail);
    paint();
    return;
  }
  if (offer.action.id === "monsango") {
    openMonsango();
    return;
  }
  if (offer.action.id === "hq") {
    openHq();
    return;
  }
  if (offer.action.id === "shop") {
    openShop();
    return;
  }
  if (offer.action.id === "market") {
    openMarket("tab");
    return;
  }
  if (offer.action.id === "exchange") {
    openMarket("exchange");
    return;
  }
  if (offer.action.id === "unlock-stock") {
    unlockStock();
    return;
  }
  if (offer.action.id === "fill") {
    state.water = CAN_MAX;
    setStatus("Filled the watering can. That's enough for 6 plots.");
    save();
    paint();
    return;
  }
  startChore(offer.action.id, offer.x, offer.y);
}

function walkGoal(tx, ty, event) {
  const margin = 16;
  if (walkable(tx, ty)) {
    let localX = (tx + 0.5) * TILE;
    let localY = (ty + 0.62) * TILE;
    if (event) {
      const rect = $("farm-grid").getBoundingClientRect();
      localX = ((event.clientX - rect.left) / rect.width) * MAP_COLS * TILE;
      localY = ((event.clientY - rect.top) / rect.height) * MAP_ROWS * TILE;
    }
    return {
      x: Math.min((tx + 1) * TILE - margin, Math.max(tx * TILE + margin, localX)),
      y: Math.min((ty + 1) * TILE - margin, Math.max(ty * TILE + margin, localY)),
    };
  }
  const spot = feet();
  let best = null;
  let bestD = Infinity;
  for (let y = ty - 1; y <= ty + 1; y += 1) {
    for (let x = tx - 1; x <= tx + 1; x += 1) {
      if (!walkable(x, y)) continue;
      const gx = (x + 0.5) * TILE;
      const gy = (y + 0.62) * TILE;
      const distance = (gx - spot.x) ** 2 + (gy - spot.y) ** 2;
      if (distance < bestD) {
        bestD = distance;
        best = { x: gx, y: gy };
      }
    }
  }
  return best;
}

function paintBuild() {
  tiles.forEach((tile) => {
    const x = Number(tile.dataset.x);
    const y = Number(tile.dataset.y);
    let picked = false;
    if (buildMode && buildPick && state.place !== "city") {
      if (buildPick.kind === "well") picked = roleAt(x, y) === "well";
      if (buildPick.kind === "plot") {
        const plot = state.plots[buildPick.index];
        picked = Boolean(plot) && plot.x === x && plot.y === y;
      }
    }
    tile.classList.toggle("picked", picked);
  });
}

function relocateJobs(moves) {
  [acting, ...handJobs].forEach((job) => {
    if (!job) return;
    const move = moves.find((item) => item.fromX === job.x && item.fromY === job.y);
    if (!move) return;
    job.x = move.toX;
    job.y = move.toY;
  });
}

function feetOn(x, y) {
  const tile = tileAtPixel(feet().x, feet().y);
  return tile.x === x && tile.y === y;
}

function handOn(x, y) {
  return state.hands.some((hand) => {
    const tile = tileAtPixel(hand.px + BODY.ox, hand.py + BODY.oy);
    return tile.x === x && tile.y === y;
  });
}

function canDrop(x, y) {
  return inBounds(x, y) && roleAt(x, y) === "grass";
}

function movableAt(x, y) {
  const plot = plotAt(x, y);
  if (plot && plot.owned) return { kind: "plot", index: state.plots.indexOf(plot) };
  if (roleAt(x, y) === "well") return { kind: "well" };
  return null;
}

function finishMove() {
  buildPick = null;
  save();
  paintPlace();
  paint();
}

function handleBuildClick(x, y) {
  const hit = movableAt(x, y);
  if (!buildPick) {
    if (hit) buildPick = hit;
    paint();
    return;
  }
  if (buildPick.kind === "plot") {
    const plot = state.plots[buildPick.index];
    if (!plot) {
      buildPick = null;
      paint();
      return;
    }
    if (plot.x === x && plot.y === y) {
      buildPick = null;
      paint();
      return;
    }
    const other = plotAt(x, y);
    if (other && other !== plot) {
      const ax = plot.x;
      const ay = plot.y;
      relocateJobs([
        { fromX: ax, fromY: ay, toX: other.x, toY: other.y },
        { fromX: other.x, fromY: other.y, toX: ax, toY: ay },
      ]);
      plot.x = other.x;
      plot.y = other.y;
      other.x = ax;
      other.y = ay;
      finishMove();
      return;
    }
    if (hit) {
      buildPick = hit;
      paint();
      return;
    }
    if (canDrop(x, y)) {
      relocateJobs([{ fromX: plot.x, fromY: plot.y, toX: x, toY: y }]);
      plot.x = x;
      plot.y = y;
      finishMove();
    }
    return;
  }
  if (state.well.x === x && state.well.y === y) {
    buildPick = null;
    paint();
    return;
  }
  if (hit) {
    buildPick = hit;
    paint();
    return;
  }
  const occupant = plotAt(x, y);
  if (occupant && !occupant.owned && !feetOn(x, y) && !handOn(x, y)) {
    occupant.x = state.well.x;
    occupant.y = state.well.y;
    state.well = { x, y };
    finishMove();
    return;
  }
  if (canDrop(x, y) && !feetOn(x, y) && !handOn(x, y)) {
    state.well = { x, y };
    finishMove();
  }
}

function toggleBuild() {
  if (!state.hammer || acting || state.place === "city") return;
  buildMode = !buildMode;
  buildPick = null;
  walkTarget = null;
  held.clear();
  paint();
}

function buyHammer() {
  if (state.hammer) return;
  if (state.gold < HAMMER_PRICE) {
    setStatus(`A hammer costs ${HAMMER_PRICE}g.`);
    save();
    paint();
    return;
  }
  state.gold -= HAMMER_PRICE;
  state.hammer = true;
  log(`Bought a hammer for ${HAMMER_PRICE}g.`);
  setStatus("The hammer is in the top bar. Click it, then a plot or the well, then the new spot.");
  save();
  paint();
}

function clickTile(x, y, event) {
  if (buildMode) {
    if (!acting && state.place !== "city") handleBuildClick(x, y);
    return;
  }
  if (acting) return;
  if (state.place === "city") {
    const offer = offerHere();
    if (offer && !offer.action.disabled && roleAt(x, y) === offer.kind) {
      doOffer();
      return;
    }
    const goal = walkGoal(x, y, event);
    if (!goal) return;
    walkTarget = goal;
    return;
  }
  const offer = offerHere();
  const role = roleAt(x, y);
  if (offer && !offer.action.disabled) {
    const hit = (offer.kind === "plot" && offer.x === x && offer.y === y)
      || (offer.kind === "shop" && role === "shop");
    if (hit) {
      doOffer();
      return;
    }
  }
  const goal = walkGoal(x, y, event);
  if (!goal) {
    setStatus("You can't walk there.");
    paint();
    return;
  }
  walkTarget = goal;
}

function updateMovement(dt, now) {
  if (acting || shopOpen || monsangoOpen || hqOpen || marketOpen || menuOpen) {
    if (walking) {
      walking = false;
      save();
      return true;
    }
    return false;
  }
  let dx = 0;
  let dy = 0;
  if (held.has("up")) dy -= 1;
  if (held.has("down")) dy += 1;
  if (held.has("left")) dx -= 1;
  if (held.has("right")) dx += 1;
  if (dx || dy) {
    walkTarget = null;
    const length = Math.hypot(dx, dy);
    moveBy((dx / length) * WALK_SPEED * dt, (dy / length) * WALK_SPEED * dt);
    faceFromDelta(dx, dy);
    walking = true;
    if (now - moveSaveAt > 500) {
      save();
      moveSaveAt = now;
    }
    return true;
  }
  if (walkTarget) {
    const spot = feet();
    const vx = walkTarget.x - spot.x;
    const vy = walkTarget.y - spot.y;
    const length = Math.hypot(vx, vy);
    if (length < 4) {
      walkTarget = null;
      walking = false;
      save();
      return true;
    }
    const step = Math.min(length, WALK_SPEED * dt);
    const before = state.player.px + state.player.py;
    moveBy((vx / length) * step, (vy / length) * step);
    faceFromDelta(vx, vy);
    walking = true;
    if (before === state.player.px + state.player.py) {
      walkTarget = null;
      walking = false;
      setStatus("Something is in the way.");
      save();
      paint();
    } else if (now - moveSaveAt > 500) {
      save();
      moveSaveAt = now;
    }
    return true;
  }
  if (walking) {
    walking = false;
    save();
    return true;
  }
  return false;
}

function openShop() {
  if (monsangoOpen) closeMonsango();
  if (hqOpen) closeHq();
  shopOpen = true;
  held.clear();
  walkTarget = null;
  walking = false;
  $("shop").hidden = false;
  paint();
}

function closeShop() {
  if (!shopOpen) return;
  shopOpen = false;
  $("shop").hidden = true;
}

function openMonsango() {
  if (shopOpen) closeShop();
  if (marketOpen) closeMarket();
  if (hqOpen) closeHq();
  monsangoOpen = true;
  held.clear();
  walkTarget = null;
  walking = false;
  $("monsango").hidden = false;
  paint();
}

function closeMonsango() {
  if (!monsangoOpen) return;
  monsangoOpen = false;
  $("monsango").hidden = true;
}

function openHq() {
  if (shopOpen) closeShop();
  if (monsangoOpen) closeMonsango();
  if (marketOpen) closeMarket();
  hqOpen = true;
  held.clear();
  walkTarget = null;
  walking = false;
  $("hq").hidden = false;
  paint();
}

function closeHq() {
  if (!hqOpen) return;
  hqOpen = false;
  hqView = "active";
  $("hq").hidden = true;
}

function unlockStock() {
  if (state.stockMarket) {
    openMarket("exchange");
    return;
  }
  if (state.gold < STOCK_PRICE) return;
  state.gold -= STOCK_PRICE;
  state.stockMarket = true;
  log(`Unlocked the stock market for ${STOCK_PRICE}g.`);
  save();
  openMarket("exchange");
}

function openMarket(desk) {
  if (shopOpen) closeShop();
  if (monsangoOpen) closeMonsango();
  if (hqOpen) closeHq();
  marketDesk = desk === "exchange" ? "exchange" : "tab";
  marketOpen = true;
  held.clear();
  walkTarget = null;
  walking = false;
  hoverX = null;
  const market = $("market");
  market.hidden = false;
  market.dataset.desk = marketDesk;
  paint();
  requestAnimationFrame(() => drawChart());
}

function closeMarket() {
  if (!marketOpen) return;
  marketOpen = false;
  marketDesk = "tab";
  marketView = "prices";
  hoverX = null;
  const market = $("market");
  market.hidden = true;
  market.dataset.desk = "tab";
  $("chart-tip").hidden = true;
}

function toggleMarket() {
  if (marketOpen) closeMarket();
  else openMarket("tab");
}

function cycleMarketCrop(step) {
  const index = ORDER.indexOf(state.marketCrop);
  const next = (index + step + ORDER.length) % ORDER.length;
  state.marketCrop = ORDER[next];
  save();
  paint();
}

function ownedCount() {
  return state.plots.reduce((count, plot) => count + (plot.owned ? 1 : 0), 0);
}

function nextPlotToBuy() {
  let best = null;
  for (let row = 0; row < FIELD.h; row += 1) {
    for (let col = 0; col < FIELD.w; col += 1) {
      const index = row * FIELD.w + col;
      if (state.plots[index].owned) continue;
      const touches = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
        const nextCol = col + dx;
        const nextRow = row + dy;
        return nextCol >= 0 && nextRow >= 0 && nextCol < FIELD.w && nextRow < FIELD.h
          && state.plots[nextRow * FIELD.w + nextCol].owned;
      });
      if (!touches) continue;
      const score = row * 100 + col;
      if (!best || score < best.score) best = { index, score };
    }
  }
  return best;
}

function buyPlot() {
  const next = nextPlotToBuy();
  if (!next) return;
  if (state.gold < PLOT_PRICE) {
    setStatus(`Another plot costs ${PLOT_PRICE}g. Sell a harvest when you are short.`);
    save();
    paint();
    return;
  }
  state.gold -= PLOT_PRICE;
  state.plots[next.index].owned = true;
  log(`Bought a plot of land for ${PLOT_PRICE}g.`);
  setStatus("The fence moved out. Hoe the new soil before you plant.");
  save();
  paint();
}

function buySprinkler() {
  if (state.gold < SPRINKLER_PRICE) {
    setStatus(`A sprinkler costs ${SPRINKLER_PRICE}g.`);
    save();
    paint();
    return;
  }
  state.gold -= SPRINKLER_PRICE;
  state.sprinklers += 1;
  log(`Bought a sprinkler for ${SPRINKLER_PRICE}g.`);
  setStatus(`Sprinkler set. It waters ${SPRINKLER_PLOTS} plots each hour.`);
  save();
  paint();
}

function nextHandCost() {
  return FARMHAND_PRICE * (state.hands.length + 1);
}

function hireFarmhand() {
  if (state.hands.length > 0) {
    setStatus("More farmhands are hired at Farmer's HQ in town.");
    paint();
    return;
  }
  const cost = addFarmhand();
  if (!cost) {
    paint();
    return;
  }
  log(`Hired a farmhand for ${cost}g.`);
  setStatus("Farmhand hired. He walks the field and works one chore at a time.");
  save();
  paint();
}

function addFarmhand() {
  if (state.hands.length >= MAX_HANDS) {
    setStatus(`The crew is full at ${MAX_HANDS} farmhands.`);
    return 0;
  }
  const cost = nextHandCost();
  if (state.gold < cost) {
    setStatus(`The next farmhand costs ${cost}g, then ${FARMHAND_WAGE}g each morning.`);
    return 0;
  }
  state.gold -= cost;
  state.hands.push(spawnHand(state.hands.length));
  state.handPaid = true;
  syncCrew();
  return cost;
}

function dismissFarmhand(index) {
  if (!state.hands[index]) return;
  hideHandFx(index);
  state.hands.splice(index, 1);
  handJobs.splice(index, 1);
  syncCrew();
  hideHandFx();
  log(state.hands.length ? "A farmhand headed home." : "The farmhand headed out.");
  setStatus(state.hands.length
    ? `${state.hands.length} farmhand${state.hands.length === 1 ? "" : "s"} still on the crew.`
    : "Farmhand dismissed. The morning wage stops.");
  save();
  paint();
}

function selectSeed(id) {
  if (!CROPS[id]) return;
  state.selectedSeed = id;
  state.marketCrop = id;
  state.tool = "seed";
}

function useToolKey(code) {
  const pick = TOOL_KEYS[code];
  if (!pick) return false;
  if (pick.tool === "seed") {
    selectSeed(pick.seed);
    setStatus(`Next planting is ${CROPS[pick.seed].name}.`);
  } else {
    state.tool = pick.tool;
    setStatus(pick.tool === "hoe" ? "Hoe selected." : "Watering can selected.");
  }
  save();
  paint();
  return true;
}

function buySeed(id, qty = 1) {
  const crop = CROPS[id];
  const count = Math.max(1, qty | 0);
  const cost = crop.seedPrice * count;
  if (state.gold < cost) {
    log(`${count} ${crop.singular} seed${count === 1 ? "" : "s"} cost ${cost}g.`);
    save();
    paint();
    return;
  }
  state.gold -= cost;
  state.seeds[id] += count;
  selectSeed(id);
  log(`Bought ${count} ${crop.singular} seed${count === 1 ? "" : "s"} for ${cost}g.`);
  setStatus(`Bought ${count} ${crop.singular} seed${count === 1 ? "" : "s"}. Walk onto tilled soil to plant.`);
  save();
  paint();
}

function emptyBasis() {
  const basis = {};
  ORDER.forEach((id) => {
    basis[id] = { qty: 0, cost: 0 };
  });
  return basis;
}

function replayBasis(trades, saved, goods) {
  const fresh = !saved || typeof saved !== "object";
  const basis = emptyBasis();
  if (fresh) {
    [...trades].reverse().forEach((trade) => {
      const book = basis[trade.crop];
      if (!book) return;
      if (trade.side === "buy") {
        book.qty += trade.qty;
        book.cost += trade.gold;
      } else if (book.qty > 0) {
        const take = Math.min(trade.qty, book.qty);
        const avg = book.cost / book.qty;
        book.qty -= take;
        book.cost -= avg * take;
      }
    });
  } else {
    ORDER.forEach((id) => {
      const book = saved[id] || {};
      basis[id].qty = Math.max(0, Math.round(book.qty) || 0);
      basis[id].cost = Math.max(0, Math.round(book.cost) || 0);
    });
  }
  ORDER.forEach((id) => {
    const book = basis[id];
    const held = Math.max(0, goods[id] | 0);
    if (book.qty > held) {
      const avg = book.qty ? book.cost / book.qty : 0;
      book.qty = held;
      book.cost = avg * held;
    }
    book.qty = Math.max(0, Math.round(book.qty));
    book.cost = book.qty ? Math.max(0, Math.round(book.cost)) : 0;
  });
  return basis;
}

function addBasis(id, qty, cost) {
  const book = state.basis[id];
  book.qty += qty;
  book.cost += cost;
}

function releaseBasis(id, qty) {
  const book = state.basis[id];
  const take = Math.min(qty, book.qty);
  if (take <= 0) return;
  const avg = book.cost / book.qty;
  book.qty -= take;
  book.cost = Math.max(0, Math.round(book.cost - avg * take));
  if (book.qty === 0) book.cost = 0;
}

function recordTrade(side, id, qty, gold) {
  if (!Array.isArray(state.trades)) state.trades = [];
  state.trades.unshift({
    side,
    crop: id,
    qty,
    gold,
    day: state.day,
    hour: state.hour,
  });
  state.trades.length = Math.min(state.trades.length, 40);
}

function paintTrades() {
  const list = $("trade-list");
  const empty = $("trade-empty");
  const trades = Array.isArray(state.trades) ? state.trades : [];
  let bought = 0;
  let sold = 0;
  trades.forEach((trade) => {
    if (trade.side === "buy") bought += trade.gold;
    else sold += trade.gold;
  });
  const net = sold - bought;
  $("trade-bought").textContent = formatGold(bought);
  $("trade-sold").textContent = formatGold(sold);
  const netNode = $("trade-net");
  netNode.textContent = `${net > 0 ? "+" : ""}${formatGold(net)}`;
  netNode.className = net > 0 ? "up" : net < 0 ? "down" : "";
  empty.hidden = trades.length > 0;
  list.innerHTML = trades.map((trade) => {
    const crop = CROPS[trade.crop];
    const name = trade.qty === 1 ? crop.singular : crop.plural;
    const spent = trade.side === "buy";
    return `<div class="trade-row"><div><strong>${spent ? "Bought" : "Sold"} ${trade.qty} ${name}</strong><span>Day ${trade.day} · ${formatHour(trade.hour)}</span></div><b class="${spent ? "down" : "up"}">${spent ? "−" : "+"}${formatGold(trade.gold)}</b></div>`;
  }).join("");
}

function buyGoods() {
  if (marketDesk !== "exchange" || !state.stockMarket) return;
  const id = state.marketCrop;
  const crop = CROPS[id];
  const qty = readQty();
  const cost = Math.round(qty * state.prices[id]);
  if (state.gold < cost) {
    log(`Not enough gold for ${qty} ${noun(crop, qty)}.`);
    save();
    paint();
    return;
  }
  state.gold -= cost;
  state.goods[id] += qty;
  addBasis(id, qty, cost);
  recordTrade("buy", id, qty, cost);
  log(`Bought ${qty} ${noun(crop, qty)} for ${cost}g.`);
  save();
  paint();
}

function sellGoods(all) {
  const id = state.marketCrop;
  const crop = CROPS[id];
  const owned = state.goods[id];
  const qty = all ? owned : readQty();
  if (owned < 1 || qty < 1) {
    log(`No ${crop.plural} to sell.`);
    save();
    paint();
    return;
  }
  if (!all && qty > owned) {
    log(`You only have ${owned} ${noun(crop, owned)}.`);
    save();
    paint();
    return;
  }
  const payout = Math.round(qty * state.prices[id]);
  releaseBasis(id, qty);
  state.goods[id] -= qty;
  state.gold += payout;
  if (marketDesk === "exchange") recordTrade("sell", id, qty, payout);
  log(`Sold ${qty} ${noun(crop, qty)} for ${payout}g.`);
  save();
  paint();
}

function drawChart() {
  const canvas = $("chart");
  const cropId = state.marketCrop;
  const crop = CROPS[cropId];
  const series = state.history[cropId];
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (width < 20 || height < 20 || !marketOpen) return;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const pad = { l: 46, r: 14, t: 16, b: 28 };
  const showUsual = marketDesk === "exchange";
  let lo = Math.min(...series);
  let hi = Math.max(...series);
  if (showUsual) {
    lo = Math.min(lo, crop.mean);
    hi = Math.max(hi, crop.mean);
  }
  const gutter = Math.max((hi - lo) * 0.18, crop.mean * 0.06);
  lo -= gutter;
  hi += gutter;

  ctx.fillStyle = "#fffaf0";
  ctx.fillRect(0, 0, width, height);
  ctx.font = "12px Segoe UI, sans-serif";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 1;

  const yAt = (value) => pad.t + (1 - (value - lo) / (hi - lo)) * (height - pad.t - pad.b);
  const xAt = (index) => {
    if (series.length === 1) return pad.l;
    return pad.l + (index / (series.length - 1)) * (width - pad.l - pad.r);
  };

  for (let i = 0; i <= 4; i += 1) {
    const value = lo + ((hi - lo) * i) / 4;
    const y = yAt(value);
    ctx.strokeStyle = "rgba(90, 70, 45, 0.12)";
    ctx.beginPath();
    ctx.moveTo(pad.l, y);
    ctx.lineTo(width - pad.r, y);
    ctx.stroke();
    ctx.fillStyle = "#7a6a55";
    ctx.textAlign = "right";
    ctx.fillText(value.toFixed(0), pad.l - 8, y);
  }

  const meanY = yAt(crop.mean);
  if (showUsual) {
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = "rgba(120, 90, 40, 0.75)";
    ctx.beginPath();
    ctx.moveTo(pad.l, meanY);
    ctx.lineTo(width - pad.r, meanY);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = "#7a5a32";
    ctx.textAlign = "right";
    ctx.fillText("Fair Value", width - pad.r, Math.max(pad.t + 8, meanY - 8));
  }

  ctx.beginPath();
  series.forEach((value, index) => {
    const x = xAt(index);
    const y = yAt(value);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.lineTo(xAt(series.length - 1), height - pad.b);
  ctx.lineTo(xAt(0), height - pad.b);
  ctx.closePath();
  ctx.globalAlpha = 0.14;
  ctx.fillStyle = crop.color;
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.beginPath();
  series.forEach((value, index) => {
    const x = xAt(index);
    const y = yAt(value);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = crop.color;
  ctx.lineWidth = 2.25;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();

  const lastX = xAt(series.length - 1);
  const lastY = yAt(series[series.length - 1]);
  ctx.beginPath();
  ctx.arc(lastX, lastY, 4.5, 0, Math.PI * 2);
  ctx.fillStyle = crop.color;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#fffaf0";
  ctx.stroke();

  ctx.fillStyle = "#7a6a55";
  ctx.font = "12px Segoe UI, sans-serif";
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillText("7 days ago", pad.l, height - 8);
  ctx.textAlign = "right";
  ctx.fillText("now", width - pad.r, height - 8);

  chartGeom = { pad, width, height, lo, hi, series };
  canvas.setAttribute(
    "aria-label",
    showUsual
      ? `${crop.name} over the last 7 days. Now ${Math.round(series[series.length - 1])} gold. Fair Value ${crop.mean} gold.`
      : `${crop.name} over the last 7 days. Now ${Math.round(series[series.length - 1])} gold.`
  );
  positionTip();
}

function positionTip() {
  const tip = $("chart-tip");
  if (hoverX === null || !chartGeom || !marketOpen) {
    tip.hidden = true;
    return;
  }
  const { pad, width, height, lo, hi, series } = chartGeom;
  const inner = width - pad.l - pad.r;
  const t = (hoverX - pad.l) / inner;
  if (t < 0 || t > 1) {
    tip.hidden = true;
    return;
  }
  const index = Math.round(t * (series.length - 1));
  const value = series[index];
  const hoursAgo = series.length - 1 - index;
  tip.hidden = false;
  tip.textContent = `${hoursAgo === 0 ? "Now" : `${hoursAgo}h ago`} · ${Math.round(value)}g`;
  const y = pad.t + (1 - (value - lo) / (hi - lo)) * (height - pad.t - pad.b);
  tip.style.left = `${Math.min(width - 120, Math.max(8, hoverX + 12))}px`;
  tip.style.top = `${Math.max(8, y - 28)}px`;
}

function fieldClass(x, y, plot) {
  if (!plot.owned) {
    const n = (x * 3 + y * 5) % 4;
    return `tile field unowned yard n${n}`;
  }
  const parts = ["tile", "field"];
  const ownedAt = (tx, ty) => roleAt(tx, ty) === "field" && plotAt(tx, ty).owned;
  if (!ownedAt(x, y - 1)) parts.push("edge-n");
  if (!ownedAt(x, y + 1)) parts.push("edge-s");
  if (!ownedAt(x - 1, y)) parts.push("edge-w");
  if (!ownedAt(x + 1, y)) parts.push("edge-e");
  if (plot.tilled) parts.push("tilled");
  if (plot.watered) parts.push("watered");
  if (isReady(plot)) parts.push("ready");
  if (acting && acting.x === x && acting.y === y) parts.push(acting.id);
  const offer = offerHere();
  if (offer && offer.kind === "plot" && offer.x === x && offer.y === y) parts.push("near");
  return parts.join(" ");
}

function paintMap() {
  tiles.forEach((tile) => {
    const x = Number(tile.dataset.x);
    const y = Number(tile.dataset.y);
    if (roleAt(x, y) !== "field") return;
    const plot = plotAt(x, y);
    const nextClass = fieldClass(x, y, plot);
    if (tile.className !== nextClass) tile.className = nextClass;
    const icon = tile.querySelector(".crop-icon");
    const label = tile.querySelector(".plot-label");
    if (!plot.owned) {
      label.textContent = "";
      tile.setAttribute("aria-label", "Open ground. Buy the next plot at Trailer Supply.");
      if (icon.dataset.kind !== "none") {
        icon.dataset.kind = "none";
        icon.innerHTML = "";
      }
      return;
    }
    let kind = "none";
    let html = "";
    if (!plot.crop) {
      label.textContent = "";
      tile.setAttribute("aria-label", plot.tilled ? "Tilled plot" : "Empty garden plot");
    } else {
      const crop = CROPS[plot.crop];
      const ready = isReady(plot);
      const ratio = plot.progress / growthGoal(crop);
      kind = ready ? `${plot.crop}Ready` : ratio >= 0.45 ? plot.crop : "sprout";
      html = READY_ART[kind]
        ? `<img class="crop-art" src="${READY_ART[kind]}" alt="">`
        : (PLANTS[kind] || SPROUT);
      if (READY_ART[kind]) kind = `${kind}-png`;
      const hours = hoursLeft(plot);
      label.textContent = "";
      tile.setAttribute(
        "aria-label",
        ready ? `${crop.name} ready to harvest` : `${crop.name}, ${hours} hour${hours === 1 ? "" : "s"} left`
      );
    }
    if (icon.dataset.kind !== kind) {
      icon.dataset.kind = kind;
      icon.innerHTML = html;
    }
  });
  paintPlayer();
}

function paintPlayer() {
  const player = $("player");
  if (!player.querySelector("img")) player.innerHTML = FARMER;
  player.dataset.facing = state.player.facing;
  player.classList.toggle("walking", walking && !acting);
  player.classList.toggle("acting", Boolean(acting));
  if (acting) player.dataset.chore = acting.id;
  else delete player.dataset.chore;
  player.style.transform = `translate(${state.player.px}px, ${state.player.py}px)`;
  paintOffer();
  paintHand();
}

function paintOffer() {
  const button = $("plot-action");
  if (!button) return;
  if (acting) {
    button.hidden = false;
    button.classList.add("waiting");
    if (button.textContent !== acting.label) button.textContent = acting.label;
    button.style.transform = `translate(${acting.x * TILE + TILE / 2}px, ${acting.y * TILE}px) translate(-50%, -115%)`;
    return;
  }
  if (shopOpen || marketOpen || monsangoOpen || hqOpen) {
    button.hidden = true;
    return;
  }
  const offer = offerHere();
  document.querySelectorAll(".tile.near").forEach((tile) => {
    const same = offer && offer.kind === "plot" && Number(tile.dataset.x) === offer.x && Number(tile.dataset.y) === offer.y;
    if (!same) tile.classList.remove("near");
  });
  if (offer && offer.kind === "plot") {
    const tile = document.querySelector(`.tile[data-x="${offer.x}"][data-y="${offer.y}"]`);
    if (tile) tile.classList.add("near");
  }
  if (!offer || marketOpen) {
    button.hidden = true;
    return;
  }
  button.hidden = false;
  button.classList.toggle("waiting", Boolean(offer.action.disabled));
  const label = offer.action.disabled ? offer.action.label : `${offer.action.label} · Space`;
  if (button.textContent !== label) button.textContent = label;
  button.style.transform = `translate(${offer.x * TILE + TILE / 2}px, ${offer.y * TILE}px) translate(-50%, -115%)`;
}

function paintMenu() {
  const button = $("menu-continue");
  button.disabled = !hasSave;
  button.textContent = hasSave ? `Continue · Day ${state.day}` : "Continue";
}

function openMenu() {
  menuOpen = true;
  held.clear();
  walkTarget = null;
  walking = false;
  if (shopOpen) closeShop();
  if (monsangoOpen) closeMonsango();
  if (hqOpen) closeHq();
  if (marketOpen) closeMarket();
  if (hasSave) save();
  $("menu").hidden = false;
  paintMenu();
}

function closeMenu() {
  menuOpen = false;
  $("menu").hidden = true;
}

function startNewGame() {
  if (hasSave && !window.confirm("Start over? This save on this computer will be replaced.")) return;
  if (choreTimer) window.clearTimeout(choreTimer);
  choreTimer = 0;
  acting = null;
  handJobs = [];
  hideChoreFx();
  hideHandFx();
  state = createNewState();
  hasSave = true;
  buildMode = false;
  buildPick = null;
  bindWorld(state);
  if (shopOpen) closeShop();
  if (monsangoOpen) closeMonsango();
  if (hqOpen) closeHq();
  if (marketOpen) closeMarket();
  statusText = "Walk onto a plot. Space does whatever that soil needs next.";
  accumulator = 0;
  hoverX = null;
  save();
  closeMenu();
  paintPlace();
  paint();
}

function fieldSnapshot() {
  const rows = {};
  ORDER.forEach((id) => {
    rows[id] = { growing: 0, ready: 0 };
  });
  const tally = { owned: 0, ready: 0, growing: 0, dry: 0, tilled: 0, rows };
  state.plots.forEach((plot) => {
    if (!plot.owned) return;
    tally.owned += 1;
    if (plot.crop && isReady(plot)) {
      tally.ready += 1;
      rows[plot.crop].ready += 1;
    } else if (plot.crop) {
      tally.growing += 1;
      rows[plot.crop].growing += 1;
      if (!plot.watered) tally.dry += 1;
    } else if (plot.tilled) {
      tally.tilled += 1;
    }
  });
  return tally;
}

function paintHq() {
  const board = $("hq-field");
  const live = $("hq-live");
  const yieldBox = $("hq-yield");
  const hire = $("hq-hire");
  const fire = $("hq-fire");
  if (!board || !live || !yieldBox || !hire || !fire) return;
  const showHistory = hqView === "history";
  $("hq-active").hidden = showHistory;
  $("hq-history").hidden = !showHistory;
  $("hq-tab-active").classList.toggle("active", !showHistory);
  $("hq-tab-history").classList.toggle("active", showHistory);
  const tally = fieldSnapshot();
  const nextLand = nextPlotToBuy();
  const buyLabel = nextLand ? `Buy ${PLOT_PRICE}g` : "Full";
  const lines = [
    ["Ready to harvest", tally.ready],
    ["Growing", tally.dry ? `${tally.growing} (${tally.dry} still dry)` : tally.growing],
    ["Tilled and empty", tally.tilled],
  ];
  board.innerHTML = `<div class="hq-row"><span>Owned plots</span><span class="hq-plot-buy"><b>${tally.owned} of ${PLOT_COUNT}</b><button type="button" id="hq-buy-plot"${nextLand && state.gold >= PLOT_PRICE ? "" : " disabled"}>${buyLabel}</button></span></div>`
    + lines.map(([label, value]) => `<div class="hq-row"><span>${label}</span><b>${value}</b></div>`).join("");
  live.innerHTML = ORDER.map((id) => {
    const crop = CROPS[id];
    const row = tally.rows[id];
    return `<div class="hq-row"><span>${crop.name}</span><b>${row.growing} growing · ${row.ready} ready · ${state.goods[id]} stored</b></div>`;
  }).join("");
  const harvested = ORDER.map((id) => ({ id, qty: state.harvested[id] || 0 }));
  const total = harvested.reduce((sum, row) => sum + row.qty, 0);
  $("hq-history-empty").hidden = total > 0;
  yieldBox.innerHTML = harvested.map((row) => (
    `<div class="hq-row"><span>${CROPS[row.id].name}</span><b>${row.qty} harvested</b></div>`
  )).join("") + `<div class="hq-row"><span>Total</span><b>${total} harvested</b></div>`;
  const crew = state.hands.length;
  const wage = crew * FARMHAND_WAGE;
  const nextCost = nextHandCost();
  $("hq-count").textContent = `${crew} farmhand${crew === 1 ? "" : "s"}`;
  const meta = $("hq-hire-meta");
  if (crew === 0) {
    meta.textContent = `${nextCost}g to hire, then ${FARMHAND_WAGE}g each morning. Each hire costs ${FARMHAND_PRICE}g more, up to ${MAX_HANDS}.`;
  } else if (state.handPaid) {
    meta.textContent = crew >= MAX_HANDS
      ? `Working. Morning wages ${wage}g.`
      : `Working. Morning wages ${wage}g. Next hire is ${nextCost}g.`;
  } else {
    meta.textContent = `Idle until morning. Wages are ${wage}g.`;
  }
  hire.textContent = crew >= MAX_HANDS ? "Full" : `Hire ${nextCost}g`;
  hire.disabled = crew >= MAX_HANDS || state.gold < nextCost;
  fire.disabled = crew < 1;
}

function paint() {
  const night = state.hour < 6 || state.hour >= 20;
  document.body.classList.toggle("night", night);
  $("when").textContent = `Day ${state.day} · ${formatHour(state.hour)}`;
  $("phase").textContent = night ? "Evening" : "Daylight";
  $("gold").textContent = formatGold(state.gold);
  const can = $("can-pill");
  can.dataset.water = String(state.water);
  can.setAttribute("aria-label", `Watering can, ${state.water} of ${CAN_MAX} plots`);
  $("can-count").textContent = String(state.water);
  can.querySelectorAll(".can-drop").forEach((drop, index) => {
    drop.classList.toggle("full", index < state.water);
  });
  $("net").textContent = `Net worth ${formatGold(netWorth())}`;
  const toolBar = $("tool-bar");
  toolBar.hidden = state.place === "city";
  toolBar.querySelectorAll("[data-tool]").forEach((button) => {
    const tool = button.dataset.tool;
    const on = tool === "seed"
      ? state.tool === "seed" && button.dataset.seed === state.selectedSeed
      : state.tool === tool;
    button.classList.toggle("selected", on);
    button.setAttribute("aria-pressed", on ? "true" : "false");
  });
  toolBar.querySelectorAll("[data-seed-count]").forEach((node) => {
    node.textContent = String(state.seeds[node.dataset.seedCount] || 0);
  });
  const landMeta = $("land-meta");
  const buyLand = $("buy-plot");
  const plotsOwned = ownedCount();
  const nextLand = nextPlotToBuy();
  landMeta.textContent = nextLand
    ? `${plotsOwned} of ${PLOT_COUNT} plots`
    : `All ${PLOT_COUNT} plots are yours`;
  buyLand.textContent = nextLand ? `${PLOT_PRICE}g` : "Full";
  buyLand.disabled = !nextLand || state.gold < PLOT_PRICE;
  buyLand.setAttribute("aria-label", nextLand ? `Buy a plot of land for ${PLOT_PRICE} gold` : "The acre is fully yours");

  const sprinklerMeta = $("sprinkler-meta");
  const buySprinklerBtn = $("buy-sprinkler");
  sprinklerMeta.textContent = state.sprinklers
    ? `${state.sprinklers} running. Each waters ${SPRINKLER_PLOTS} plots an hour.`
    : `Waters ${SPRINKLER_PLOTS} dry crops an hour, and does not use your can.`;
  buySprinklerBtn.textContent = `${SPRINKLER_PRICE}g`;
  buySprinklerBtn.disabled = state.gold < SPRINKLER_PRICE;

  const farmhandMeta = $("farmhand-meta");
  const hireBtn = $("hire-farmhand");
  const crew = state.hands.length;
  if (crew > 0) {
    const wage = crew * FARMHAND_WAGE;
    farmhandMeta.textContent = state.handPaid
      ? `${crew} on the crew. ${wage}g each morning. More hands are at Farmer's HQ.`
      : `Idle until morning. The crew needs ${wage}g to get back to work.`;
    hireBtn.textContent = "Hired";
    hireBtn.disabled = true;
  } else {
    const cost = nextHandCost();
    farmhandMeta.textContent = `Walks the rows tilling, planting, watering, and harvesting. ${FARMHAND_WAGE}g each morning after the ${cost}g hire.`;
    hireBtn.textContent = `${cost}g`;
    hireBtn.disabled = state.gold < cost;
  }
  paintHq();

  const hammerMeta = $("hammer-meta");
  const buyHammerBtn = $("buy-hammer");
  const hammer = $("hammer");
  if (state.hammer) {
    hammerMeta.textContent = "Yours. Click the hammer up top, then a plot or the well, then the new spot.";
    buyHammerBtn.textContent = "Owned";
    buyHammerBtn.disabled = true;
  } else {
    hammerMeta.textContent = "Move owned plots and the well, including onto unbought field tiles.";
    buyHammerBtn.textContent = `${HAMMER_PRICE}g`;
    buyHammerBtn.disabled = state.gold < HAMMER_PRICE;
  }
  hammer.hidden = !state.hammer;
  hammer.classList.toggle("active", buildMode);
  hammer.setAttribute("aria-pressed", buildMode ? "true" : "false");
  document.body.classList.toggle("building", buildMode);
  const callout = $("build-callout");
  callout.hidden = !buildMode;
  if (buildMode) {
    const picked = buildPick
      ? (buildPick.kind === "well" ? "the well" : "that plot")
      : "";
    callout.textContent = picked
      ? `Build mode · click where ${picked} should go`
      : "Build mode · click a plot or the well";
  }

  ORDER.forEach((id) => {
    const crop = CROPS[id];
    document.querySelectorAll(`.seed-card[data-seed="${id}"]`).forEach((card) => {
      const bulk = Boolean(card.closest("#monsango-seeds"));
      const count = bulk ? seedQty : 1;
      const cost = crop.seedPrice * count;
      card.classList.toggle("selected", state.selectedSeed === id);
      card.title = crop.note;
      const seedWord = state.seeds[id] === 1 ? "seed" : "seeds";
      card.querySelector("[data-seed-meta]").textContent = `${state.seeds[id]} ${seedWord} · ${crop.seedPrice}g · ${crop.growHours}h watered`;
      const buy = card.querySelector("[data-buy-seed]");
      buy.textContent = `${cost}g`;
      buy.disabled = state.gold < cost;
      buy.setAttribute("aria-label", `Buy ${count} ${crop.singular} seed${count === 1 ? "" : "s"} for ${cost} gold`);
    });

    const tick = document.querySelector(`.tick[data-crop="${id}"]`);
    tick.classList.toggle("active", state.marketCrop === id);
    tick.querySelector("[data-px]").textContent = `${state.prices[id]}g`;
    tick.querySelector("[data-tick-seeds]").textContent = String(state.seeds[id]);
    tick.querySelector("[data-tick-goods]").textContent = String(state.goods[id]);
  });

  paintMap();
  paintBuild();

  const cropId = state.marketCrop;
  const crop = CROPS[cropId];
  const qty = readQty();
  const cost = Math.round(qty * state.prices[cropId]);
  const owned = state.goods[cropId];
  const allPayout = Math.round(owned * state.prices[cropId]);
  const stock = marketDesk === "exchange";
  $("market-title").textContent = stock ? "Stock Market" : "Market";
  $("market-blurb").hidden = stock;
  if (!stock) $("market-blurb").textContent = "Tab closes this. Q and E switch crops.";
  $("trade-name").textContent = crop.name;
  const priceNode = $("trade-price");
  priceNode.textContent = `${state.prices[cropId]}g`;
  priceNode.className = `trade-price ${directionOf(cropId)}`;
  $("trade-meta").textContent = stock
    ? `${versus(cropId)} · seed ${crop.seedPrice}g · you hold ${owned}`
    : `Seed ${crop.seedPrice}g · you hold ${owned}`;
  const pnl = $("trade-pnl");
  pnl.hidden = !stock;
  if (stock) {
    const book = state.basis[cropId];
    if (!book || book.qty < 1) {
      pnl.innerHTML = `<span>Avg cost —</span><b>No open buys</b>`;
    } else {
      const avg = Math.round(book.cost / book.qty);
      const open = Math.round(state.prices[cropId] * book.qty - book.cost);
      pnl.innerHTML = `<span>Avg cost ${avg}g · ${book.qty} bought</span><b class="${open > 0 ? "up" : open < 0 ? "down" : ""}">${open > 0 ? "+" : ""}${formatGold(open)}</b>`;
    }
  }
  $("legend-usual").hidden = !stock;
  const showBook = stock && marketView === "trades";
  $("market-tabs").hidden = !stock;
  $("market-prices").hidden = showBook;
  $("market-trades").hidden = !showBook;
  $("market-tab-prices").classList.toggle("active", !showBook);
  $("market-tab-trades").classList.toggle("active", showBook);
  paintTrades();
  document.querySelectorAll("#qty-picks button").forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.qty) === readQty());
  });
  document.querySelectorAll("#seed-qty button").forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.qty) === seedQty);
  });
  $("legend").style.setProperty("--crop", crop.color);

  const buy = $("buy");
  const sell = $("sell");
  const sellAll = $("sell-all");
  buy.hidden = !stock;
  buy.textContent = `Buy ${formatGold(cost)}`;
  buy.disabled = !stock || state.gold < cost;
  sell.textContent = `Sell ${formatGold(cost)}`;
  sell.disabled = owned < qty;
  sellAll.textContent = owned > 0 ? `Sell all ${owned} · ${formatGold(allPayout)}` : "Sell all";
  sellAll.disabled = owned < 1;

  if (marketOpen && !showBook) {
    requestAnimationFrame(() => {
      if (marketOpen && marketView !== "trades") drawChart();
    });
  }
}

function fillTile(tile, x, y) {
  const role = roleAt(x, y);
  tile.className = `tile ${role}`;
  tile.dataset.n = String((x * 3 + y * 5) % 4);
  tile.innerHTML = "";
  tile.removeAttribute("aria-label");
  if (state.place === "city") {
    const building = cityBuilding(x, y);
    if (building && x === building.x && y === building.y + building.h - 1) {
      const art = CITY_ART[building.id] || HOUSE;
      tile.innerHTML = `<span class="prop city-prop" style="--bw:${building.w};--bh:${building.h}">${art}</span>`;
    }
    if (CITY_LAMPS.some(([lx, ly]) => lx === x && ly === y)) {
      tile.insertAdjacentHTML("beforeend", `<span class="prop lamp-prop">${LAMP}</span>`);
    }
    if (building) tile.setAttribute("aria-label", building.name);
    return;
  }
  if (role === "field") {
    const edges = [];
    if (y === FIELD.y) edges.push("edge-n");
    if (y === FIELD.y + FIELD.h - 1) edges.push("edge-s");
    if (x === FIELD.x) edges.push("edge-w");
    if (x === FIELD.x + FIELD.w - 1) edges.push("edge-e");
    tile.className = `tile field ${edges.join(" ")}`;
    tile.innerHTML = `<span class="crop-icon"></span><span class="plot-label"></span>`;
  } else if (role === "shop" && y === 6) {
    tile.innerHTML = `<span class="prop shop-prop"><img src="art/stall.png?v=1" alt=""></span>`;
    tile.setAttribute("aria-label", "Trailer Supply");
  } else if (role === "shop") {
    tile.setAttribute("aria-label", "Trailer Supply");
  } else if (role === "bed") {
    tile.innerHTML = `<span class="prop house-prop"><img src="art/house.png?v=1" alt=""></span>`;
    tile.setAttribute("aria-label", "Cottage door");
  } else if (role === "house") {
    tile.setAttribute("aria-label", "Cottage");
  } else if (role === "tree") {
    tile.innerHTML = `<span class="prop tree-prop"><img src="art/tree.png?v=1" alt=""></span>`;
    tile.setAttribute("aria-label", "Tree");
  } else if (role === "well") {
    tile.innerHTML = `<span class="prop well-prop"><img src="art/well.png?v=1" alt=""></span>`;
    tile.setAttribute("aria-label", "Well");
  } else if (role === "grass") {
    const edge = y === 0 || y === MAP_ROWS - 1 || x === 0 || x === MAP_COLS - 1;
    tile.classList.add(edge ? "meadow" : "yard");
  } else if (role === "path") {
    tile.classList.add("worn");
  }
}

function paintPlace() {
  const scene = $("farm-scene");
  if (scene) scene.dataset.place = state.place === "city" ? "city" : "farm";
  tiles.forEach((tile) => fillTile(tile, Number(tile.dataset.x), Number(tile.dataset.y)));
}

function buildWorld() {
  const grid = $("farm-grid");
  const scene = $("farm-scene");
  scene.style.setProperty("--cols", String(MAP_COLS));
  scene.style.setProperty("--rows", String(MAP_ROWS));
  scene.style.transform = "";
  scene.dataset.place = state.place === "city" ? "city" : "farm";
  for (let y = 0; y < MAP_ROWS; y += 1) {
    for (let x = 0; x < MAP_COLS; x += 1) {
      const tile = document.createElement("div");
      tile.dataset.x = String(x);
      tile.dataset.y = String(y);
      fillTile(tile, x, y);
      grid.append(tile);
      tiles.push(tile);
    }
  }

  const player = document.createElement("div");
  player.id = "player";
  player.className = "player";
  player.innerHTML = FARMER;
  scene.append(player);

  const hand = document.createElement("div");
  hand.id = "hand";
  hand.className = "player hand";
  hand.hidden = true;
  hand.innerHTML = HELPER;
  scene.append(hand);

  const action = document.createElement("button");
  action.id = "plot-action";
  action.type = "button";
  action.className = "plot-action";
  action.hidden = true;
  scene.append(action);

  const fx = document.createElement("div");
  fx.id = "chore-fx";
  fx.className = "chore-fx";
  fx.hidden = true;
  scene.append(fx);

  const handFx = document.createElement("div");
  handFx.id = "hand-fx";
  handFx.className = "chore-fx";
  handFx.hidden = true;
  scene.append(handFx);

  const seeds = $("seeds");
  const bulkSeeds = $("monsango-seeds");
  const ticker = $("ticker");
  ORDER.forEach((id) => {
    const crop = CROPS[id];
    [seeds, bulkSeeds].forEach((list) => {
      const card = document.createElement("div");
      card.className = "seed-card";
      card.dataset.seed = id;
      card.innerHTML = `
      <button type="button" class="seed-pick" data-pick="${id}">
        <span class="seed-ico">${ICONS[id]}</span>
        <span class="seed-copy">
          <strong>${crop.name}</strong>
          <span class="seed-meta" data-seed-meta="${id}"></span>
        </span>
      </button>
      <button type="button" class="buy-seed" data-buy-seed="${id}">Buy</button>`;
      list.append(card);
    });

    const tick = document.createElement("button");
    tick.type = "button";
    tick.className = "tick";
    tick.dataset.crop = id;
    tick.innerHTML = `
      <span class="tick-top"><span>${crop.name}</span></span>
      <span class="tick-px" data-px="${id}"></span>
      <span class="tick-hold">
        <span><em>Seed</em> <b data-tick-seeds="${id}">0</b></span>
        <span><em>Crop</em> <b data-tick-goods="${id}">0</b></span>
      </span>`;
    ticker.append(tick);
  });
}

function onSeedListClick(event, qty) {
  const buy = event.target.closest("[data-buy-seed]");
  if (buy) {
    buySeed(buy.dataset.buySeed, qty);
    return;
  }
  const pick = event.target.closest("[data-pick]");
  if (!pick) return;
  selectSeed(pick.dataset.pick);
  setStatus(`Next planting is ${CROPS[state.selectedSeed].name}.`);
  save();
  paint();
}

function bind() {
  $("buy").addEventListener("click", buyGoods);
  $("sell").addEventListener("click", () => sellGoods(false));
  $("sell-all").addEventListener("click", () => sellGoods(true));
  $("market-tab-prices").addEventListener("click", () => {
    marketView = "prices";
    paint();
  });
  $("market-tab-trades").addEventListener("click", () => {
    marketView = "trades";
    paint();
  });
  $("qty-picks").addEventListener("click", (event) => {
    const button = event.target.closest("[data-qty]");
    if (!button) return;
    const qty = Number(button.dataset.qty);
    if (!QTY_STEPS.includes(qty)) return;
    tradeQty = qty;
    paint();
  });
  $("open-menu").addEventListener("click", openMenu);
  $("menu-continue").addEventListener("click", () => {
    if (!hasSave) return;
    closeMenu();
  });
  $("menu-new").addEventListener("click", startNewGame);

  $("tool-bar").addEventListener("click", (event) => {
    const button = event.target.closest("[data-tool]");
    if (!button) return;
    if (button.dataset.tool === "seed") selectSeed(button.dataset.seed);
    else state.tool = button.dataset.tool;
    save();
    paint();
  });
  $("farm-grid").addEventListener("click", (event) => {
    const tile = event.target.closest(".tile");
    if (!tile) return;
    clickTile(Number(tile.dataset.x), Number(tile.dataset.y), event);
  });
  $("plot-action").addEventListener("click", (event) => {
    event.stopPropagation();
    doOffer();
  });
  $("buy-plot").addEventListener("click", buyPlot);
  $("buy-sprinkler").addEventListener("click", buySprinkler);
  $("buy-hammer").addEventListener("click", buyHammer);
  $("hammer").addEventListener("click", toggleBuild);
  $("hire-farmhand").addEventListener("click", hireFarmhand);
  $("seeds").addEventListener("click", (event) => onSeedListClick(event, 1));
  $("monsango-seeds").addEventListener("click", (event) => onSeedListClick(event, seedQty));
  $("seed-qty").addEventListener("click", (event) => {
    const button = event.target.closest("[data-qty]");
    if (!button) return;
    const qty = Number(button.dataset.qty);
    if (!SEED_QTY.includes(qty)) return;
    seedQty = qty;
    paint();
  });
  $("shop").addEventListener("click", (event) => {
    if (event.target.id === "shop") closeShop();
  });
  $("shop-close").addEventListener("click", closeShop);
  $("monsango").addEventListener("click", (event) => {
    if (event.target.id === "monsango") closeMonsango();
  });
  $("monsango-close").addEventListener("click", closeMonsango);
  $("hq").addEventListener("click", (event) => {
    if (event.target.id === "hq") closeHq();
  });
  $("hq-close").addEventListener("click", closeHq);
  $("hq-tab-active").addEventListener("click", () => {
    hqView = "active";
    paint();
  });
  $("hq-tab-history").addEventListener("click", () => {
    hqView = "history";
    paint();
  });
  $("hq-field").addEventListener("click", (event) => {
    if (!event.target.closest("#hq-buy-plot")) return;
    buyPlot();
  });
  $("hq-hire").addEventListener("click", () => {
    const cost = addFarmhand();
    if (!cost) {
      paint();
      return;
    }
    log(`Hired a farmhand for ${cost}g.`);
    setStatus(`${state.hands.length} farmhand${state.hands.length === 1 ? "" : "s"} on the crew.`);
    save();
    paint();
  });
  $("hq-fire").addEventListener("click", () => {
    if (!state.hands.length) return;
    dismissFarmhand(state.hands.length - 1);
  });
  $("market").addEventListener("click", (event) => {
    if (event.target.id === "market") closeMarket();
  });
  $("market-close").addEventListener("click", closeMarket);
  $("ticker").addEventListener("click", (event) => {
    const button = event.target.closest(".tick");
    if (!button) return;
    state.marketCrop = button.dataset.crop;
    save();
    paint();
  });

  const chart = $("chart");
  chart.addEventListener("mousemove", (event) => {
    const rect = chart.getBoundingClientRect();
    hoverX = event.clientX - rect.left;
    positionTip();
  });
  chart.addEventListener("mouseleave", () => {
    hoverX = null;
    $("chart-tip").hidden = true;
  });
  window.addEventListener("resize", () => {
    if (marketOpen) drawChart();
  });
  window.addEventListener("keydown", (event) => {
    if (menuOpen) return;
    const target = event.target;
    if (target && target.closest && target.closest("input, textarea")) return;
    if (event.code === "Tab") {
      event.preventDefault();
      if (!acting) toggleMarket();
      return;
    }
    if (event.code === "Escape" && buildMode && !shopOpen && !monsangoOpen && !hqOpen && !marketOpen) {
      event.preventDefault();
      if (buildPick) buildPick = null;
      else buildMode = false;
      paint();
      return;
    }
    if (shopOpen || monsangoOpen || hqOpen) {
      if (event.code === "Escape") {
        event.preventDefault();
        if (shopOpen) closeShop();
        if (monsangoOpen) closeMonsango();
        if (hqOpen) closeHq();
      }
      if (useToolKey(event.code)) return;
      return;
    }
    if (marketOpen) {
      if (event.code === "Escape") {
        event.preventDefault();
        closeMarket();
      } else if (event.code === "KeyQ") {
        event.preventDefault();
        cycleMarketCrop(-1);
      } else if (event.code === "KeyE") {
        event.preventDefault();
        cycleMarketCrop(1);
      }
      return;
    }
    const dir = DIR_FROM_CODE[event.code];
    if (dir) {
      event.preventDefault();
      held.add(dir);
      return;
    }
    if (event.code === "Space" || event.code === "KeyE") {
      event.preventDefault();
      if (buildMode) return;
      if (target && target.id === "plot-action") return;
      doOffer();
      return;
    }
    if (useToolKey(event.code)) return;
  });
  window.addEventListener("keyup", (event) => {
    const dir = DIR_FROM_CODE[event.code];
    if (dir) held.delete(dir);
  });
  window.addEventListener("blur", () => held.clear());
}

function loop(now) {
  const dt = Math.min(1000, Math.max(0, now - lastNow));
  lastNow = now;
  const seconds = Math.min(dt, 50) / 1000;
  if (updateMovement(seconds, now)) paintPlayer();
  updateHand(seconds);
  paintHand();
  if (!document.hidden && !menuOpen) {
    accumulator += dt;
    let steps = 0;
    while (accumulator >= HOUR_MS && steps < 2) {
      tickHour();
      accumulator -= HOUR_MS;
      steps += 1;
    }
  } else {
    accumulator = 0;
  }
  requestAnimationFrame(loop);
}

buildWorld();
bind();
paint();
paintMenu();
if (state._fitted) save();
lastNow = performance.now();
requestAnimationFrame(loop);

window.farmersMarket = {
  stepHours(count) {
    const steps = Math.max(0, Math.min(48, count | 0));
    for (let i = 0; i < steps; i += 1) tickHour();
  },
};
