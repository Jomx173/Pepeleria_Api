const { Sequelize } = require("sequelize");
require("dotenv").config();

const sslEnabled =
  process.env.VERCEL === "1" ||
  ["1", "true", "yes"].includes(String(process.env.DB_SSL || "").toLowerCase());

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    dialect: "mysql",
    logging: false,
    dialectOptions: sslEnabled
      ? { ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true } }
      : {},
  }
);

module.exports = sequelize;