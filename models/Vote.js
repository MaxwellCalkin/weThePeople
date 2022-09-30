const mongoose = require("mongoose");

const VoteSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
  },
  bill_id: {
    type: String,
    require: true,
  },
  image: {
    type: String,
    require: true,
  },
  cloudinaryId: {
    type: String,
    require: true,
  },
  givenSummary: {
    type: String,
    required: true,
  },
  userSummary:{
      type: String,
      required: false
  },
  yays: {
    type: Number,
    required: true,
  },
  nays: {
    type: Number,
    required: true,
  },
  createdAt: {
    type: String,
    required: true,
  },
});

module.exports = mongoose.model("Vote", VoteSchema);
