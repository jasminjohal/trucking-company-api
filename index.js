const router = (module.exports = require("express").Router());

router.use("/loads", require("./loads"));
router.use("/trucks", require("./trucks"));
router.use("/", require("./login"));
