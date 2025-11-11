// =============================
// BOT CTM – Multi-villes & Google Sheets (CommonJS) + correctif niveaux & cumul ressources
// =============================

const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");
const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
require("dotenv").config();

// Vérifie que le fichier JSON existe avant de lancer
const authPath = path.join(process.cwd(), "gestion-ctm-bc86da201e15.json");
if (!fs.existsSync(authPath)) {
  console.error("❌ Le fichier 'gestion-ctm-bc86da201e15.json' est introuvable !");
  process.exit(1);
}
const authData = require(authPath);

// ⚙️ CONFIGURATION
const SHEET_ID = "147GKy0bMGftEbbTKxd3x_XVEnq-HANMdRWfGVcvrR0g";
const SHEET_NAME = "Rapport";
const PLAYER_NAME_COL = "O";

// 🧾 Colonnes ressources
const COLS = {
  poterie: "C",
  fer: "D",
  sel: "E",
  argile: "F",
  laine: "G",
  fourrure: "H",
  pierre: "I",
  nourriture: "J",
  bois: "K",
  argent: "N"
};

// 🏗️ Colonnes bâtiments (ajout niveau 3 pour argile et pâturage)
const BUILDING_COLS = {
  scierie: { 1: "X", 2: "AF", 3: "AP", 4: "BC", 5: "BT" },
  ferme: { 1: "Y", 2: "AG", 3: "AQ", 4: "BD", 5: "BU" },
  carriere_pierre: { 1: "AH", 2: "AR", 3: "BE", 4: "BV" },
  atelier_tanneur: { 1: "AI", 2: "AS", 3: "BF", 4: "BW" },
  paturage: { 1: "AT", 2: "BG", 3: "BY" },          // ← ajouté BY
  carriere_argile: { 1: "AU", 2: "BH", 3: "BX" },    // ← ajouté BX
  mine_sel: { 1: "BI", 2: "BZ" },
  mine_fer: { 1: "BJ", 2: "CA" },
  atelier_poterie: { 1: "BK", 2: "CB" }
};

// 🎲 Table des gains
const LEVEL_CONFIG = {
  1: { dice: 5, mult: 100 },
  2: { dice: 6, mult: 150 },
  3: { dice: 7, mult: 200 },
  4: { dice: 8, mult: 250 },
  5: { dice: 9, mult: 300 }
};

// 🔗 Bâtiment → ressource produite
const BUILD_RESOURCE = {
  scierie: "bois",
  ferme: "nourriture",
  carriere_pierre: "pierre",
  atelier_tanneur: "fourrure",
  paturage: "laine",
  carriere_argile: "argile",
  mine_sel: "sel",
  mine_fer: "fer",
  atelier_poterie: "poterie"
};

// 🧩 Emojis ressources
const RESOURCE_EMOJIS = {
  bois: "🪵",
  pierre: "🪨",
  nourriture: "🍖",
  fer: "⛓️",
  sel: "🧂",
  argile: "🏺",
  laine: "🐑",
  fourrure: "🦊",
  poterie: "⚱️",
  argent: "💰"
};

// ========== UTILITAIRES ==========

function letterToIndex(letter) {
  let index = 0;
  for (let i = 0; i < letter.length; i++) {
    index *= 26;
    index += letter.charCodeAt(i) - 64;
  }
  return index - 1;
}

function rollDice(dice, mult) {
  const roll = Math.floor(Math.random() * dice) + 1;
  return roll * mult;
}

function gainForBuilding(lvl) {
  const config = LEVEL_CONFIG[lvl] || LEVEL_CONFIG[1];
  return rollDice(config.dice, config.mult);
}

async function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: authData,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });
  return google.sheets({ version: "v4", auth });
}

async function readSheet(sheets) {
  const range = `${SHEET_NAME}!A11:CH`;
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range });
  return res.data.values || [];
}

function getPlayerCities(rows, playerName) {
  const cities = [];
  let found = false;
  for (let i = 0; i < rows.length; i++) {
    const cell = rows[i][letterToIndex(PLAYER_NAME_COL)];
    if (cell && cell.trim() === playerName.trim()) {
      found = true;
      cities.push({ index: i, data: rows[i] });
      continue;
    }
    if (found) {
      const nextPlayer = cell && cell.trim() !== "";
      if (nextPlayer) break;
      cities.push({ index: i, data: rows[i] });
    }
  }
  return cities;
}

function detectBuildingLevels(row) {
  const levels = {};
  for (const [bat, lvlCols] of Object.entries(BUILDING_COLS)) {
    let maxLvl = 0;
    for (const [lvl, col] of Object.entries(lvlCols)) {
      const val = row[letterToIndex(col)];
      if (val && typeof val === "string" && val.toLowerCase().includes("terminé")) {
        maxLvl = Math.max(maxLvl, parseInt(lvl));
      }
    }
    levels[bat] = maxLvl;
  }
  return levels;
}

function calcTotalGains(cities) {
  const totals = {};
  for (const city of cities) {
    const lvls = detectBuildingLevels(city.data);

    console.log(`🏙️ Ville (ligne ${city.index + 11})`);
    Object.entries(lvls).forEach(([bat, lvl]) => {
      const emoji = lvl > 0 ? "✅" : "❌";
      console.log(`   ${emoji} ${bat.padEnd(20)} → niveau ${lvl}`);
    });

    for (const [bat, lvl] of Object.entries(lvls)) {
      if (lvl > 0) {
        const ressource = BUILD_RESOURCE[bat];
        const gain = gainForBuilding(lvl);
        totals[ressource] = (totals[ressource] || 0) + gain;
      }
    }
  }
  console.log("────────────────────────────────────────────");
  return totals;
}

// ✅ Mise à jour des ressources globales du joueur (cumul avec valeur existante)
async function updatePlayerResources(sheets, baseRowIndex, updates) {
  const rowNumber = 11 + baseRowIndex;
  const fullRange = `${SHEET_NAME}!A${rowNumber}:N${rowNumber}`;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: fullRange
  });

  const row = res.data.values ? res.data.values[0] : [];

  for (const [key, delta] of Object.entries(updates)) {
    if (!COLS[key]) continue;
    const idx = letterToIndex(COLS[key]);

    const currentRaw = row[idx] || "0";
    const current = parseInt(currentRaw.replace(/\D/g, "")) || 0;
    const newVal = current + (parseInt(delta) || 0);

    console.log(`🧮 ${key} : ${current} + ${delta} = ${newVal}`);
    row[idx] = String(newVal);
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: fullRange,
    valueInputOption: "USER_ENTERED",
    resource: { values: [row] }
  });
}

async function handleRoll(interaction) {
  const playerName = interaction.user.username;
  await interaction.deferReply();

  try {
    const sheets = await getSheetsClient();
    const rows = await readSheet(sheets);
    const playerCities = getPlayerCities(rows, playerName);

    if (!playerCities.length) {
      await interaction.editReply(`👋 Aucun enregistrement trouvé pour **${playerName}** dans le Sheets.`);
      return;
    }

    console.log(`\n============================`);
    console.log(`🎲 Roll de ${playerName} (${playerCities.length} villes)`);
    console.log(`============================`);

    const totalGains = calcTotalGains(playerCities);
    console.log("💰 Total des gains :", totalGains);
    console.log("============================\n");

    await updatePlayerResources(sheets, playerCities[0].index, totalGains);

    const fields = Object.entries(totalGains).map(([res, val]) => ({
      name: `${RESOURCE_EMOJIS[res] || ""} ${res.charAt(0).toUpperCase() + res.slice(1)}`,
      value: `**+${val.toLocaleString()}**`,
      inline: true
    }));

    const embed = new EmbedBuilder()
      .setTitle(`🎲 Récolte journalière`)
      .setDescription(`**${playerName}** a récolté les ressources de toutes ses villes :`)
      .addFields(fields)
      .setColor(0x00cc66)
      .setFooter({ text: `Total des villes : ${playerCities.length}` });

    await interaction.editReply({ embeds: [embed] });

  } catch (err) {
    console.error(err);
    await interaction.editReply(`⚠️ Erreur : ${err.message}`);
  }
}

// 🚀 Lancement du bot Discord
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

client.once("ready", () => {
  console.log(`✅ Connecté en tant que ${client.user.tag}`);
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isCommand()) return;
  if (interaction.commandName === "roll") {
    await handleRoll(interaction);
  }
});

client.login(process.env.DISCORD_TOKEN);
