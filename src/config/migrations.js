const sequelize = require("./database");

let running = null;

const isDuplicateColumnError = (message = "") =>
  /Duplicate column/i.test(message) || /already exists/i.test(message);

function ensureMovementSchema() {
  if (!running) {
    running = (async () => {
      const [rows] = await sequelize.query(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'movements'
           AND COLUMN_NAME IN ('stock_anterior', 'stock_actual', 'tipo')`
      );
      const columns = new Map(rows.map((r) => [r.COLUMN_NAME, r.COLUMN_TYPE]));
      const additions = [];
      if (!columns.has("stock_anterior")) additions.push("ADD COLUMN stock_anterior INT NULL");
      if (!columns.has("stock_actual")) additions.push("ADD COLUMN stock_actual INT NULL");
      if (additions.length > 0) {
        await sequelize.query(`ALTER TABLE movements ${additions.join(", ")}`);
      }
      if (columns.has("tipo") && !String(columns.get("tipo")).includes("'ajuste'")) {
        await sequelize.query(
          `ALTER TABLE movements MODIFY COLUMN tipo ENUM('entrada','salida','ajuste') NOT NULL`
        );
      }
    })().catch((err) => {
      if (!isDuplicateColumnError(err.message)) {
        console.error("movement-stock migration:", err.message);
      }
    });
  }
  return running;
}

module.exports = { ensureMovementSchema };