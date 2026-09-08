const express = require("express");
const router = express.Router();
const categoryController = require("../controllers/categoryController");

router.get("/", categoryController.getCategories);
router.get("/summary", categoryController.getCategoriesSummary);
router.get("/:id", categoryController.getCategory);
router.post("/", categoryController.createCategory);
router.put("/:id", categoryController.updateCategory);
router.delete("/:id", categoryController.deleteCategory);

module.exports = router;
