const cloudinary = require("../middleware/cloudinary");
const Post = require("../models/Post");
const Comment = require("../models/Comment");
const Bill = require("../models/Bill")


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
    try {
      const resp = await fetch(`https://api.propublica.org/congress/v1/${req.params.congress}/bills/${req.params.bill_slug}.json`, {
        headers: {
          "X-API-KEY": `${process.env.CONGRESS_KEY}`,
        }
     })

      const data = await resp.json()

      const bill = data.results[0]

      const billExists = await Bill.exists({ bill_id: data.results[0].bill_id})

      const votes = 0

      await Bill.findOne({ bill_id: data.results[0].bill_slug}, function(err,bill){
        if(err){
          console.log(err)
        }else if(bill){
          votes = bill.yays + bill.nays
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
  yayOrNay: async (req, res) => {
    // Here We Go!
    console.log('XHGDSHJAGDHSIKJANHUISJKNHXUIJKSHXSUIAJKXHSUIXKJSAHMXJKSAHXMSUKAJXHMSUNK')
    try {
      // If the bill doesn't exist, create the bill
      if(!Bill.exists({ billSlug: req.body.bill_slug })){
        await Bill.create({
          title: req.body.title,
          billSlug: req.body.billSlug,
          congress: req.body.congress,
          image: '/imgs/wtp.png',
          cloudinaryId: '',
          givenSummary: req.body.summary,
          nays: req.body.yay ? 1 : 0,
          yays: req.body.nay ? 1 : 0,
        })
      // Else, update either the yay or nay number
      }else{
        if(req.body.yay){
          await Bill.findOneAndUpdate(
            { billSlug: req.body.bill_slug },
            {
              $inc: { yay: 1 },
            }
          )
        }else{
          await Bill.findOneAndUpdate(
            { billSlug: req.body.bill_slug },
            {
              $inc: { nay: 1 },
            }
          )
        }
        
      }
      // Set the user's yayBillIds or nayBillIds array to include an object with {bill_slug: {yay: true, nay: false}}
      // await User.findOneAndUpdate()
      res.redirect(`vote/details/${req.body.bill_slug}/${req.body.congress}`)
    } catch (err) {
      console.log(err);
    }
  },
};
