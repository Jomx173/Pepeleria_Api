const { Op, Sequelize } = require("sequelize");
const sequelize = require("../config/database");
const Product = require("../models/Product");
const Category = require("../models/Category");
const Movement = require("../models/Movement");
const generateProductCode = require("../utils/generateProductCode");

const getEstado = (cantidad, stockMinimo) => {
  if (cantidad === 0) return "agotado";
  if (cantidad < stockMinimo) return "stock_bajo";
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
    stockBajo: p.cantidad < 5,
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
  try {
    const { id } = req.params;
    const affectedRows = await Product.destroy({ where: { id } });
    if (affectedRows === 0) {
      return res.status(404).json({ message: "Producto no encontrado" });
    }
    res.status(200).json({ message: "Producto eliminado" });
  } catch (err) {
    res.status(500).json({ message: "Error al eliminar el producto", error: err.message });
  }
};

module.exports = {
  getProducts,
  getProduct,
  getLowStockProducts,
  createProduct,
  updateProduct,
  deleteProduct,
};