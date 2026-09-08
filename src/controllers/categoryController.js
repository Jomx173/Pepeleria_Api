const sequelize = require("../config/database");
const Category = require("../models/Category");
const Product = require("../models/Product");

const TOTAL_PRODUCTOS_LITERAL = sequelize.literal(
  "(SELECT COUNT(*) FROM products WHERE products.categoria_id = Category.id)"
);

const withTotalProductos = {
  attributes: {
    include: [[TOTAL_PRODUCTOS_LITERAL, "totalProductos"]],
  },
};

const getCategories = async (req, res) => {
  try {
    const categories = await Category.findAll({
      ...withTotalProductos,
      order: [["nombre", "ASC"]],
    });
    res.status(200).json(categories.map((c) => c.toJSON()));
  } catch (err) {
    res.status(500).json({ message: "Error al obtener las categorías", error: err.message });
  }
};

const getCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const category = await Category.findByPk(id, withTotalProductos);
    if (!category) {
      return res.status(404).json({ message: "Categoría no encontrada" });
    }
    res.status(200).json(category.toJSON());
  } catch (err) {
    res.status(500).json({ message: "Error al obtener la categoría", error: err.message });
  }
};

const getCategoriesSummary = async (req, res) => {
  try {
    const [totalCategorias, totalProductos, categoriasConProductos] = await Promise.all([
      Category.count(),
      Product.count(),
      Category.count({
        distinct: true,
        include: [{ model: Product, required: true }],
      }),
    ]);
    res.status(200).json({ totalCategorias, totalProductos, categoriasConProductos });
  } catch (err) {
    res.status(500).json({ message: "Error al obtener el resumen de categorías", error: err.message });
  }
};

const createCategory = async (req, res) => {
  try {
    const { nombre } = req.body;
    if (!nombre || nombre.trim() === "") {
      return res.status(400).json({ message: "El campo 'nombre' es obligatorio" });
    }
    const category = await Category.create({ nombre: nombre.trim() });
    res.status(201).json(category.toJSON());
  } catch (err) {
    if (err.name === "SequelizeUniqueConstraintError") {
      return res.status(400).json({ message: "Ya existe una categoría con ese nombre" });
    }
    res.status(500).json({ message: "Error al crear la categoría", error: err.message });
  }
};

const updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre } = req.body;
    if (!nombre || nombre.trim() === "") {
      return res.status(400).json({ message: "El campo 'nombre' es obligatorio" });
    }
    const [affectedRows] = await Category.update({ nombre: nombre.trim() }, { where: { id } });
    if (affectedRows === 0) {
      return res.status(404).json({ message: "Categoría no encontrada" });
    }
    const category = await Category.findByPk(id);
    res.status(200).json(category.toJSON());
  } catch (err) {
    if (err.name === "SequelizeUniqueConstraintError") {
      return res.status(400).json({ message: "Ya existe una categoría con ese nombre" });
    }
    res.status(500).json({ message: "Error al actualizar la categoría", error: err.message });
  }
};

const productosAsociadosMsg = (total) => {
  const detalle =
    total > 0
      ? `${total} producto(s) asociado(s)`
      : "producto(s) asociado(s)";
  return `No se puede eliminar: la categoría tiene ${detalle}. Reasigna o elimina esos productos primero.`;
};

const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const category = await Category.findByPk(id);
    if (!category) {
      return res.status(404).json({ message: "Categoría no encontrada" });
    }
    const totalProductos = await Product.count({ where: { categoria_id: id } });
    if (totalProductos > 0) {
      return res.status(400).json({ error: productosAsociadosMsg(totalProductos) });
    }
    await Category.destroy({ where: { id } });
    res.status(200).json({ message: "Categoría eliminada" });
  } catch (err) {
    if (err.name === "SequelizeForeignKeyConstraintError") {
      const total = await Product.count({ where: { categoria_id: req.params.id } });
      return res.status(400).json({ error: productosAsociadosMsg(total) });
    }
    res.status(500).json({ message: "Error al eliminar la categoría", error: err.message });
  }
};

module.exports = {
  getCategories,
  getCategory,
  getCategoriesSummary,
  createCategory,
  updateCategory,
  deleteCategory,
};