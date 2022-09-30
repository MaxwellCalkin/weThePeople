const cloudinary = require("../middleware/cloudinary");
const Post = require("../models/Post");
const Comment = require("../models/Comment");
const Vote = require("../models/Vote")


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
     console.log('this is data ' + data)
     const billsArray = data.results[0].bills
     if(billsArray[0].title){
      res.render("voteSearch.ejs", { billsArray: billsArray })
     }else {
       res.redirect('feed.ejs')
     }
    } catch (err) {
      console.log(err);
    }
  },
  getDetails: async (req, res) => {
    console.log('user: ' + req.user.userName)
    console.log('bill_slug ' + req.params.bill_slug)
    console.log('congress: ' + req.params.congress)
    try {
      const resp = await fetch(`https://api.propublica.org/congress/v1/${req.params.congress}/bills/${req.params.bill_slug}.json`, {
        headers: {
          "X-API-KEY": `${process.env.CONGRESS_KEY}`,
        }
     })

      const data = await resp.json()

      const bill = data.results[0]

      const billExists = await Vote.exists({ bill_id: data.results[0].bill_id})

      const votes = 0

      await Vote.findOne({ bill_id: data.results[0].bill_id}, function(err,vote){
        if(err){
          console.log(err)
        }else if(vote){
          votes = vote.yays + vote.nays
        }
      })

      // if(billExists){
      //   const votes = await Vote.findOne( { bill_id: data.results[0].bill_id} )
      // }else{
      //   const votes = 0
      // }

      // await users.findOne({}, function(err,pro){
      //   user=pro;
      // });

      res.render("voteDetails.ejs", { bill: bill, votes: votes })

    } catch (err) {
      console.log(err);
    }
  },
};
