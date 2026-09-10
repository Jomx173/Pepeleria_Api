const { Op, Sequelize } = require("sequelize");
const sequelize = require("../config/database");
const Product = require("../models/Product");
const Category = require("../models/Category");
const Movement = require("../models/Movement");
const generateProductCode = require("../utils/generateProductCode");

const getEstado = (cantidad, stockMinimo) => {
  if (cantidad === 0) return "agotado";
  if (cantidad <= stockMinimo) return "stock_bajo";
  return "en_stock";
};

const serializeProduct = (product) => {
  const p = product.toJSON();
  const estado = getEstado(p.cantidad, p.stock_minimo);
  return {
    id: p.id,
    nombre: p.nombre,
    cantidad: p.cantidad,
    stock_minimo: p.stock_minimo,
    estado,
    stockBajo: estado !== "en_stock",
    precio: p.precio,
    categoria_id: p.categoria_id,
    created_at: p.created_at,
    updated_at: p.updated_at,
    categoria: p.category ? p.category.nombre : null,
    stockBajo: estado !== "en_stock",
  };
};

const withCategory = {
  model: Category,
  as: "category",
};

const getProducts = async (req, res) => {
  try {
    const products = await Product.findAll({ include: withCategory, order: [["nombre", "ASC"]] });
    res.status(200).json(products.map(serializeProduct));
  } catch (err) {
    res.status(500).json({ message: "Error al obtener los productos", error: err.message });
  }
};

const getProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findByPk(id, { include: withCategory });
    if (!product) {
      return res.status(404).json({ message: "Producto no encontrado" });
    }
    res.status(200).json(serializeProduct(product));
  } catch (err) {
    res.status(500).json({ message: "Error al obtener el producto", error: err.message });
  }
};

const getLowStockProducts = async (req, res) => {
  try {
    const products = await Product.findAll({
      where: {
        [Op.or]: [{ cantidad: { [Op.lt]: Sequelize.col("stock_minimo") } }, { cantidad: 0 }],
      },
      include: withCategory,
      order: [["cantidad", "ASC"]],
    });
    res.status(200).json(products.map(serializeProduct));
  } catch (err) {
    res.status(500).json({ message: "Error al obtener los productos con stock bajo", error: err.message });
  }
};

const validateProductData = (body) => {
  const { nombre, cantidad, precio, categoria_id, stock_minimo } = body;

  if (!nombre || typeof nombre !== "string" || nombre.trim() === "") {
    return { error: "El campo 'nombre' es obligatorio" };
  }
  if (cantidad === undefined || cantidad === null || typeof cantidad !== "number" || !Number.isInteger(cantidad) || cantidad < 0) {
    return { error: "El campo 'cantidad' debe ser un número entero no negativo" };
  }
  if (precio === undefined || precio === null || typeof precio !== "number" || isNaN(precio) || precio <= 0) {
    return { error: "El campo 'precio' debe ser un número mayor a 0" };
  }
  if (
    categoria_id === undefined ||
    categoria_id === null ||
    typeof categoria_id !== "number" ||
    !Number.isInteger(categoria_id)
  ) {
    return { error: "El campo 'categoria_id' es obligatorio" };
  }
  if (
    stock_minimo !== undefined &&
    stock_minimo !== null &&
    (typeof stock_minimo !== "number" || !Number.isInteger(stock_minimo) || stock_minimo < 0)
  ) {
    return { error: "El campo 'stock_minimo' debe ser un número entero no negativo" };
  }

  return {
    data: {
      nombre: nombre.trim(),
      cantidad,
      precio,
      categoria_id,
      stock_minimo: stock_minimo === undefined || stock_minimo === null ? 5 : stock_minimo,
    },
  };
};

const createProduct = async (req, res) => {
  let t;
  try {
    const { error, data } = validateProductData(req.body);
    if (error) {
      return res.status(400).json({ message: error });
    }
    const codigo = await generateProductCode(data.categoria_id);
    t = await sequelize.transaction();
    const product = await Product.create({ ...data, codigo }, { transaction: t });
    if (data.cantidad > 0) {
      await Movement.create(
        {
          producto_id: product.id,
          tipo: "entrada",
          cantidad: data.cantidad,
          stock_anterior: 0,
          stock_actual: data.cantidad,
          motivo: "Inventario inicial",
        },
        { transaction: t }
      );
    }
    await t.commit();
    const estado = getEstado(data.cantidad, data.stock_minimo);
    res.status(201).json({
      id: product.id,
      nombre: data.nombre,
      cantidad: data.cantidad,
      stock_minimo: data.stock_minimo,
      estado,
      stockBajo: estado !== "en_stock",
      precio: data.precio,
      categoria_id: data.categoria_id,
    });
  } catch (err) {
    if (t) await t.rollback().catch(() => {});
    if (err.name === "SequelizeForeignKeyConstraintError") {
      return res.status(400).json({ message: "La categoría indicada no existe" });
    }
    res.status(500).json({ message: "Error al crear el producto", error: err.message });
  }
};

const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { error, data } = validateProductData(req.body);
    if (error) {
      return res.status(400).json({ message: error });
    }
    const [affectedRows] = await Product.update(data, { where: { id } });
    if (affectedRows === 0) {
      return res.status(404).json({ message: "Producto no encontrado" });
    }
    const product = await Product.findByPk(id, { include: withCategory });
    res.status(200).json(serializeProduct(product));
  } catch (err) {
    if (err.name === "SequelizeForeignKeyConstraintError") {
      return res.status(400).json({ message: "La categoría indicada no existe" });
    }
    res.status(500).json({ message: "Error al actualizar el producto", error: err.message });
  }
};

const deleteProduct = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;
    const product = await Product.findByPk(id, { transaction: t });
    if (!product) {
      await t.rollback();
      return res.status(404).json({ message: "Producto no encontrado" });
    }
    await Movement.destroy({ where: { producto_id: id }, transaction: t });
    await product.destroy({ transaction: t });
    await t.commit();
    res.status(200).json({ message: "Producto eliminado" });
  } catch (err) {
    await t.rollback();
    res.status(500).json({ message: "Error al eliminar el producto", error: err.message });
  }
};

const adjustProductsStock = async (req, res) => {
  const { items, motivo } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: "Debes indicar al menos un producto para ajustar" });
  }
  if (motivo !== undefined && motivo !== null && typeof motivo !== "string") {
    return res.status(400).json({ message: "El campo 'motivo' debe ser un texto" });
  }

  const validTipos = ["aumentar", "disminuir", "establecer"];
  for (const item of items) {
    if (
      item.producto_id === undefined ||
      item.producto_id === null ||
      typeof item.producto_id !== "number" ||
      !Number.isInteger(item.producto_id) ||
      item.producto_id <= 0
    ) {
      return res.status(400).json({ message: "Cada producto debe incluir un 'producto_id' válido" });
    }
    if (!validTipos.includes(item.tipo)) {
      return res.status(400).json({ message: "El campo 'tipo' debe ser 'aumentar', 'disminuir' o 'establecer'" });
    }
    if (
      item.cantidad === undefined ||
      item.cantidad === null ||
      typeof item.cantidad !== "number" ||
      !Number.isInteger(item.cantidad) ||
      item.cantidad < 0 ||
      (item.tipo !== "establecer" && item.cantidad <= 0)
    ) {
      return res.status(400).json({
        message:
          item.tipo === "establecer"
            ? "La cantidad a establecer debe ser un número entero no negativo"
            : "La cantidad debe ser un número entero mayor a 0",
      });
    }
  }

  const t = await sequelize.transaction();
  try {
    const ajustados = [];
    for (const item of items) {
      const product = await Product.findByPk(item.producto_id, {
        transaction: t,
        lock: t.LOCK.UPDATE,
        include: [withCategory],
      });
      if (!product) {
        await t.rollback();
        return res.status(400).json({ message: "Alguno de los productos seleccionados no existe" });
      }

      const stockAnterior = product.cantidad;
      let cantidad = 0;
      if (item.tipo === "aumentar") {
        cantidad = item.cantidad;
      } else if (item.tipo === "disminuir") {
        cantidad = -item.cantidad;
      } else {
        cantidad = item.cantidad - stockAnterior;
      }

      const nuevoStock = stockAnterior + cantidad;
      if (nuevoStock < 0) {
        await t.rollback();
        return res.status(400).json({
          message: "No se puede disminuir esa cantidad porque el stock resultaría negativo.",
        });
      }

      const movement = await Movement.create(
        {
          producto_id: product.id,
          tipo: "ajuste",
          cantidad,
          stock_anterior: stockAnterior,
          stock_actual: nuevoStock,
          motivo: motivo ?? "Ajuste de inventario",
        },
        { transaction: t }
      );

      product.cantidad = nuevoStock;
      await product.save({ transaction: t });

      ajustados.push({ producto: serializeProduct(product), movimiento: movement.toJSON() });
    }

    await t.commit();
    res.status(200).json({
      message: `Stock ajustado correctamente en ${ajustados.length} producto${ajustados.length === 1 ? "" : "s"}`,
      productos: ajustados.map((a) => a.producto),
      ajustes: ajustados.map((a) => ({
        producto_id: a.producto.id,
        cantidad: a.movimiento.cantidad,
        stock_anterior: a.movimiento.stock_anterior,
        stock_actual: a.movimiento.stock_actual,
        estado: a.producto.estado,
      })),
    });
  } catch (err) {
    await t.rollback();
    res.status(500).json({ message: "Error al ajustar el stock", error: err.message });
  }
};

module.exports = {
  getProducts,
  getProduct,
  getLowStockProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  adjustProductsStock,
};