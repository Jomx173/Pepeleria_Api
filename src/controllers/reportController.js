const { Op } = require("sequelize");
const sequelize = require("../config/database");
const Product = require("../models/Product");
const Category = require("../models/Category");
const Movement = require("../models/Movement");

const toDateString = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const getSummary = async (req, res) => {
  try {
    const [totalProductos, totalCategorias, stockBajo, valorRows] = await Promise.all([
      Product.count(),
      Category.count(),
      Product.count({
        where: {
          [Op.or]: [{ cantidad: { [Op.lt]: sequelize.col("stock_minimo") } }, { cantidad: 0 }],
        },
      }),
      Product.findAll({
        attributes: [[sequelize.fn("SUM", sequelize.literal("cantidad * precio")), "total"]],
        raw: true,
      }),
    ]);

    res.status(200).json({
      totalProductos,
      totalCategorias,
      stockBajo,
      valorInventario: valorRows[0].total ? Number(valorRows[0].total) : 0,
    });
  } catch (err) {
    res.status(500).json({ message: "Error al obtener el resumen", error: err.message });
  }
};

const getMovementsSummary = async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (desde !== undefined && !dateRegex.test(desde)) {
      return res.status(400).json({ message: "El parámetro 'desde' debe tener formato YYYY-MM-DD" });
    }
    if (hasta !== undefined && !dateRegex.test(hasta)) {
      return res.status(400).json({ message: "El parámetro 'hasta' debe tener formato YYYY-MM-DD" });
    }

    const desdeFinal = desde ?? toDateString(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
    const hastaFinal = hasta ?? toDateString(new Date());

    const range = {
      [Op.between]: [`${desdeFinal} 00:00:00`, `${hastaFinal} 23:59:59`],
    };

    const where = { created_at: range };

    const [totalEntradas, totalSalidas, rows] = await Promise.all([
      Movement.sum("cantidad", { where: { ...where, tipo: "entrada" } }),
      Movement.sum("cantidad", { where: { ...where, tipo: "salida" } }),
      Movement.findAll({
        attributes: ["tipo", "cantidad", "created_at"],
        where,
      }),
    ]);

    const daily = {};
    rows.forEach((m) => {
      const local = new Date(m.created_at);
      const key = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(
        local.getDate()
      ).padStart(2, "0")}`;
      if (!daily[key]) {
        daily[key] = { fecha: key, entradas: 0, salidas: 0 };
      }
      if (m.tipo === "entrada") {
        daily[key].entradas += m.cantidad;
      } else {
        daily[key].salidas += m.cantidad;
      }
    });

    res.status(200).json({
      totalEntradas: Number(totalEntradas) || 0,
      totalSalidas: Number(totalSalidas) || 0,
      movimientosPorDia: Object.values(daily).sort((a, b) => a.fecha.localeCompare(b.fecha)),
    });
  } catch (err) {
    res.status(500).json({ message: "Error al obtener el resumen de movimientos", error: err.message });
  }
};

const getTopProducts = async (req, res) => {
  try {
    const tipo = req.query.tipo ?? "salida";
    if (tipo !== "entrada" && tipo !== "salida") {
      return res.status(400).json({ message: "El parámetro 'tipo' debe ser 'entrada' o 'salida'" });
    }

    let limite = 5;
    if (req.query.limite !== undefined) {
      limite = Number(req.query.limite);
      if (!Number.isInteger(limite) || limite < 1) {
        return res.status(400).json({ message: "El parámetro 'limite' debe ser un número entero mayor a 0" });
      }
    }

    const rows = await Movement.findAll({
      attributes: [
        "producto_id",
        [sequelize.fn("SUM", sequelize.col("cantidad")), "totalCantidad"],
      ],
      where: { tipo },
      group: ["producto_id"],
      order: [[sequelize.fn("SUM", sequelize.col("cantidad")), "DESC"]],
      limit: limite,
      raw: true,
    });

    const ids = rows.map((r) => r.producto_id);
    const products = ids.length
      ? await Product.findAll({ where: { id: { [Op.in]: ids } }, attributes: ["id", "nombre"], raw: true })
      : [];
    const names = {};
    products.forEach((p) => {
      names[p.id] = p.nombre;
    });

    res.status(200).json(
      rows.map((r) => ({
        producto_id: r.producto_id,
        nombre: names[r.producto_id] ?? null,
        totalCantidad: Number(r.totalCantidad) || 0,
      }))
    );
  } catch (err) {
    res.status(500).json({ message: "Error al obtener los productos más movilizados", error: err.message });
  }
};

const getByCategory = async (req, res) => {
  try {
    const [categories, rows] = await Promise.all([
      Category.findAll({ attributes: ["id", "nombre"], raw: true }),
      Product.findAll({
        attributes: [
          "categoria_id",
          [sequelize.fn("COUNT", sequelize.col("id")), "totalProductos"],
          [sequelize.fn("SUM", sequelize.literal("cantidad * precio")), "valorInventario"],
        ],
        group: ["categoria_id"],
        raw: true,
      }),
    ]);

    const byId = new Map(
      categories.map((c) => [c.id, { categoria_id: c.id, nombre: c.nombre, totalProductos: 0, valorInventario: 0 }])
    );
    let sinCategoria = { categoria_id: null, nombre: "Sin categoría", totalProductos: 0, valorInventario: 0 };

    rows.forEach((r) => {
      const entry = r.categoria_id !== undefined && r.categoria_id !== null ? byId.get(r.categoria_id) : null;
      if (entry) {
        entry.totalProductos = Number(r.totalProductos) || 0;
        entry.valorInventario = Number(r.valorInventario) || 0;
      } else {
        sinCategoria.totalProductos = Number(r.totalProductos) || 0;
        sinCategoria.valorInventario = Number(r.valorInventario) || 0;
      }
    });

    const result = [...byId.values()];
    if (sinCategoria.totalProductos > 0) result.push(sinCategoria);
    result.sort((a, b) => a.nombre.localeCompare(b.nombre));

    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ message: "Error al obtener los productos por categoría", error: err.message });
  }
};

const getMonthlyMovements = async (req, res) => {
  try {
    let meses = 9;
    if (req.query.meses !== undefined) {
      meses = Number(req.query.meses);
      if (!Number.isInteger(meses) || meses < 1 || meses > 60) {
        return res.status(400).json({ message: "El parámetro 'meses' debe ser un número entero entre 1 y 60" });
      }
    }

    const rows = await Movement.findAll({
      attributes: ["tipo", "cantidad", "created_at"],
    });

    const byMonth = {};
    rows.forEach((m) => {
      const local = new Date(m.created_at);
      const key = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}`;
      if (!byMonth[key]) {
        byMonth[key] = { mes: key, entradas: 0, salidas: 0 };
      }
      if (m.tipo === "entrada") {
        byMonth[key].entradas += m.cantidad;
      } else {
        byMonth[key].salidas += m.cantidad;
      }
    });

    const now = new Date();
    const result = [];
    for (let i = meses - 1; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      result.push(byMonth[key] ?? { mes: key, entradas: 0, salidas: 0 });
    }

    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ message: "Error al obtener los movimientos mensuales", error: err.message });
  }
};

module.exports = {
  getSummary,
  getMovementsSummary,
  getTopProducts,
  getByCategory,
  getMonthlyMovements,
};