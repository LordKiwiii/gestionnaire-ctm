const { REST, Routes } = require("discord.js");
require("dotenv").config();

const commands = [
  {
    name: "roll",
    description: "Lancer la récolte de ressources"
  },
  {
    name: "build",
    description: "Construire un bâtiment",
    options: [
      {
        name: "batiment",
        description: "Bâtiment à construire",
        type: 3, // STRING
        required: true,
        choices: [
          { name: "Scierie", value: "scierie" },
          { name: "Ferme", value: "ferme" },
          { name: "Carrière de pierre", value: "carriere_pierre" },
          { name: "Atelier de tanneur", value: "atelier_tanneur" },
          { name: "Pâturage", value: "paturage" },
          { name: "Carrière d'argile", value: "carriere_argile" },
          { name: "Mine de fer", value: "mine_fer" },
          { name: "Mine de sel", value: "mine_sel" },
          { name: "Atelier de poterie", value: "atelier_poterie" }
        ]
      }
    ]
  }
];

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log("🔁 Enregistrement des slash commands...");

    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );

    console.log("✅ Slash commands enregistrées avec succès !");
  } catch (error) {
    console.error("❌ Erreur :", error);
  }
})();
