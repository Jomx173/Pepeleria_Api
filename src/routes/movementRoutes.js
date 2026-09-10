const express = require("express");
const router = express.Router();
const movementController = require("../controllers/movementController");

router.get("/", movementController.getMovements);
router.post("/", movementController.createMovement);
router.put("/:id", movementController.updateMovement);
router.delete("/:id", movementController.deleteMovement);

module.exports = router;