const mongoose = require("mongoose");

const BillSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
  },
  billSlug: {
    type: String,
    require: true,
  },
  congress: {
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
  yeas: {
    type: Number,
    required: true,
  },
  nays: {
    type: Number,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Bill", BillSchema);
