const cloudinary = require("../middleware/cloudinary");
const Post = require("../models/Post");
const Comment = require("../models/Comment");


module.exports = {
  getVotes: async (req, res) => {
    try {
      const votes = await fetch 
      res.render("vote.ejs", { votes: votes });
    } catch (err) {
      console.log(err);
    }
  },
  getSearch: async (req, res) => {
    console.log(req.query.search)
    try {
      const resp = await fetch(`https://api.propublica.org/congress/v1/bills/search.json?query=${req.query.search}`, {
        headers: {
          "X-API-KEY": `${process.env.CONGRESS_KEY}`,
        }
     })
     
     const data = await resp.json()
     console.log('this is data', data)
     const billsArray = data.results[0].bills
     res.render("voteSearch.ejs", { billsArray: billsArray })
    } catch (err) {
      console.log(err);
    }
  },
};
