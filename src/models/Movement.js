const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");
const Product = require("./Product");

const Movement = sequelize.define(
  "Movement",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    producto_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: Product,
        key: "id",
      },
    },
    tipo: {
      type: DataTypes.ENUM("entrada", "salida"),
      allowNull: false,
    },
    cantidad: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    motivo: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    tableName: "movements",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: false,
  }
);

Movement.belongsTo(Product, { foreignKey: "producto_id", as: "product" });
Product.hasMany(Movement, { foreignKey: "producto_id" });

module.exports = Movement;