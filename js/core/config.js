/* ═══════════ CONFIG ═══════════ */
const SUBJECTS = [
  { key:"Tarih",       ikon:"📜", renk:"gold",   aciklama:"Osmanlı'dan Cumhuriyet'e" },
  { key:"Coğrafya",    ikon:"🗺️", renk:"blue",   aciklama:"Türkiye ve dünya coğrafyası" },
  { key:"Vatandaşlık", ikon:"⚖️", renk:"purple", aciklama:"Anayasa ve temel hukuk" },
  { key:"Türkçe",      ikon:"✍️", renk:"green",  aciklama:"Dil bilgisi ve paragraf" },
  { key:"Matematik",   ikon:"🔢", renk:"red",    aciklama:"Temel matematik" },
  { key:"Güncel",      ikon:"🌐", renk:"orange", aciklama:"Güncel bilgiler" }
];

const ADMIN_API_BASE = window.location.origin;

const GITHUB = {
  user: "vetatlas",
  repo: "kpss-tarih-sorubankasi",
  branch: "main",
  dataFolder: "data"
};

const SORULAR_FILE = "sorular.json";
const PACKS_INDEX_FILE = "index.json";     // data/dersler/index.json
const PACKS_FOLDER = "dersler";            // data/dersler/

const LETTERS = ["A","B","C","D","E"];

/* Global state */
let PACKS_INDEX = [];
let PACKS_LOADED = false;
let ALL_QUESTIONS = [];
let currentSubject = null;
