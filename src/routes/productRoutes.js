const express = require("express");
const router = express.Router();
const productController = require("../controllers/productController");

router.get("/", productController.getProducts);
router.get("/alertas", productController.getLowStockProducts);
router.get("/:id", productController.getProduct);
router.post("/", productController.createProduct);
router.post("/adjust-stock", productController.adjustProductsStock);
router.put("/:id", productController.updateProduct);
router.delete("/:id", productController.deleteProduct);

module.exports = router;