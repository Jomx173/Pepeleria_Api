const { Sequelize } = require("sequelize");
require("dotenv").config();

const trueValue = (v) =>
  ["1", "true", "yes"].includes(String(v || "").toLowerCase());

const sslEnabled = process.env.VERCEL === "1" || trueValue(process.env.DB_SSL);

const dialectOptions = {};
if (sslEnabled) {
  const ssl = {
    minVersion: "TLSv1.2",
    rejectUnauthorized: !["0", "false", "no"].includes(
      String(process.env.DB_SSL_VERIFY || "").toLowerCase()
    ),
  };
  if (process.env.DB_CA_CERT) {
    ssl.ca = [String(process.env.DB_CA_CERT).replace(/\\n/g, "\n")];
  }
  dialectOptions.ssl = ssl;
}

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    dialect: "mysql",
    logging: false,
    dialectOptions,
  }
);

module.exports = sequelize;