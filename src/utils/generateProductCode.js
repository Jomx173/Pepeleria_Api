const { Op } = require("sequelize");
const Product = require("../models/Product");
const Category = require("../models/Category");

const sanitizePrefix = (name) => {
  const clean = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase();
  if (clean.length === 0) return "GEN";
  if (clean.length < 3) return (clean + clean[clean.length - 1].repeat(3 - clean.length)).slice(0, 3);
  return clean.slice(0, 3);
};

const generateProductCode = async (categoria_id) => {
  let prefix = "GEN";
  if (categoria_id) {
    const category = await Category.findByPk(categoria_id);
    if (category) prefix = sanitizePrefix(category.nombre);
  }

  const products = await Product.findAll({
    where: { codigo: { [Op.like]: `${prefix}%` } },
    attributes: ["codigo"],
  });

  const regex = new RegExp(`^${prefix}(\\d{3})$`);
  let max = 0;
  for (const product of products) {
    const match = regex.exec(product.codigo);
    if (match) max = Math.max(max, parseInt(match[1], 10));
  }

  const next = max + 1;
  return `${prefix}${String(next).padStart(3, "0")}`;
};

module.exports = generateProductCode;