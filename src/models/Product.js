const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");
const Category = require("./Category");

const Product = sequelize.define(
  "Product",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    nombre: {
      type: DataTypes.STRING(150),
      allowNull: false,
    },
    codigo: {
      type: DataTypes.STRING(10),
      allowNull: false,
      unique: true,
    },
    cantidad: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    stock_minimo: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 5,
    },
    precio: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    categoria_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: Category,
        key: "id",
      },
    },
  },
  {
    tableName: "products",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

Product.belongsTo(Category, { foreignKey: "categoria_id", as: "category" });
Category.hasMany(Product, { foreignKey: "categoria_id" });

module.exports = Product;