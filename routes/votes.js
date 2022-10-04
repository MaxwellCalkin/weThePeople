const express = require("express");
const router = express.Router();
const upload = require("../middleware/multer");
const postsController = require("../controllers/posts");
const votesController = require("../controllers/votes");
const { ensureAuth, ensureGuest } = require("../middleware/auth");

//Post Routes - simplified for now
router.get("/", ensureAuth, votesController.getVotes);

router.get("/search", votesController.getSearch);

router.get("/details/:bill_slug/:congress", ensureAuth, votesController.getDetails);

router.post("/vote/:bill_slug/:congress", votesController.yayOrNay);

module.exports = router;