const express = require("express");
const router = express.Router();
const reportController = require("../controllers/reportController");

router.get("/summary", reportController.getSummary);
router.get("/movements", reportController.getMovementsSummary);
router.get("/top-products", reportController.getTopProducts);
router.get("/by-category", reportController.getByCategory);
router.get("/monthly-movements", reportController.getMonthlyMovements);

module.exports = router;