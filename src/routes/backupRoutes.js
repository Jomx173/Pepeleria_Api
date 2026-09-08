const express = require("express");
const router = express.Router();
const backupController = require("../controllers/backupController");

router.get("/export", backupController.exportBackup);
router.post("/restore", backupController.restoreBackup);

module.exports = router;