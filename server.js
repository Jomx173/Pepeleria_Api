const sequelize = require("./src/config/database");
require("./src/models/Category");
require("./src/models/Product");
require("./src/models/Movement");
const app = require("./src/app");

const PORT = process.env.PORT || 4000;

(async () => {
  try {
    await sequelize.authenticate();
    console.log("Conexión a MySQL establecida correctamente");
    if (process.env.VERCEL !== "1") {
      app.listen(PORT, () => {
        console.log(`Servidor corriendo en http://localhost:${PORT}`);
      });
    }
  } catch (err) {
    console.error("No se pudo conectar a MySQL:", err.message);
    if (process.env.VERCEL !== "1") {
      process.exit(1);
    }
  }
})();