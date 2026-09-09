require("dotenv").config();
require("mysql2");
const express = require("express");
const cors = require("cors");
const categoryRoutes = require("./routes/categoryRoutes");
const productRoutes = require("./routes/productRoutes");
const movementRoutes = require("./routes/movementRoutes");
const reportRoutes = require("./routes/reportRoutes");
const backupRoutes = require("./routes/backupRoutes");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/", (req, res) => {
  res.json({ service: "pepeleria-api", status: "ok", endpoints: ["/api/health", "/api/categories", "/api/products", "/api/movements", "/api/reports", "/api/backup"] });
});

app.use("/api/categories", categoryRoutes);
app.use("/api/products", productRoutes);
app.use("/api/movements", movementRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/backup", express.json({ limit: "10mb" }), backupRoutes);

module.exports = app;
