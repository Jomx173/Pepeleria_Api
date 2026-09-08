const sequelize = require("../config/database");
const Category = require("../models/Category");
const Product = require("../models/Product");
const Movement = require("../models/Movement");

const exportBackup = async (req, res) => {
  try {
    const [categorias, productos, movimientos] = await Promise.all([
      Category.findAll({ raw: true }),
      Product.findAll({ raw: true }),
      Movement.findAll({ raw: true }),
    ]);

    const fecha = new Date().toISOString();
    const data = { version: 1, fecha, categorias, productos, movimientos };

    const hoy = new Date();
    const y = hoy.getFullYear();
    const m = String(hoy.getMonth() + 1).padStart(2, "0");
    const d = String(hoy.getDate()).padStart(2, "0");
    const nombreArchivo = `respaldo-papeleria-${y}-${m}-${d}.json`;

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="${nombreArchivo}"`);
    res.status(200).send(JSON.stringify(data, null, 2));
  } catch (err) {
    res.status(500).json({ message: "Error al exportar el respaldo", error: err.message });
  }
};

const restoreBackup = async (req, res) => {
  const body = req.body;

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return res.status(400).json({
      message:
        "El respaldo debe ser un objeto JSON con las propiedades 'categorias', 'productos' y 'movimientos'",
    });
  }

  const { categorias, productos, movimientos } = body;

  if (
    !Array.isArray(categorias) ||
    !Array.isArray(productos) ||
    !Array.isArray(movimientos)
  ) {
    return res.status(400).json({
      message:
        "Estructura inválida: se esperaban los arreglos 'categorias', 'productos' y 'movimientos'",
    });
  }

  const t = await sequelize.transaction();

  try {
    await Movement.destroy({ where: {}, transaction: t });
    await Product.destroy({ where: {}, transaction: t });
    await Category.destroy({ where: {}, transaction: t });

    if (categorias.length > 0) {
      await Category.bulkCreate(categorias, { transaction: t });
    }
    if (productos.length > 0) {
      await Product.bulkCreate(productos, { transaction: t });
    }
    if (movimientos.length > 0) {
      await Movement.bulkCreate(movimientos, { transaction: t });
    }

    await t.commit();

    res.status(200).json({
      categorias: categorias.length,
      productos: productos.length,
      movimientos: movimientos.length,
    });
  } catch (err) {
    await t.rollback();
    res.status(500).json({ message: "Error al restaurar el respaldo", error: err.message });
  }
};

module.exports = {
  exportBackup,
  restoreBackup,
};