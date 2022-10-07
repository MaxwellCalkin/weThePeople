const cloudinary = require("../middleware/cloudinary");
const Post = require("../models/Post");
const Comment = require("../models/Comment");
const Bill = require("../models/Bill");
const User = require("../models/User");
const { findOneAndUpdate } = require("../models/Post");


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
    console.log("Searched: " + req.query.search)
    try {
      const resp = await fetch(`https://api.propublica.org/congress/v1/bills/search.json?query=${req.query.search}`, {
        headers: {
          "X-API-KEY": `${process.env.CONGRESS_KEY}`,
        }
     })
     
     const data = await resp.json()
     console.log('this is data ' + data)
     const billsArray = data.results[0].bills
     const user = req.user
     if(billsArray[0].title){
      res.render("voteSearch.ejs", { billsArray: billsArray, user: user })
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

      // commented out for cleanliness
      // console.log(data)

      const bill = data.results[0]

      const billExists = await Bill.exists({ billSlug: data.results[0].bill_id})

      let votes = 0

      await Bill.findOne({ billSlug: data.results[0].bill_slug}, function(err,bill){
        if(err){
          console.log(err)
        }else if(bill){
          votes = bill.yeas + bill.nays
        }
      })

      res.render("voteDetails.ejs", { bill: bill, votes: votes })

    } catch (err) {
      console.log(err);
    }
  },
  getDetailsVoted: async (req, res) => {
    try {
      const resp = await fetch(`https://api.propublica.org/congress/v1/${req.params.congress}/bills/${req.params.bill_slug}.json`, {
        headers: {
          "X-API-KEY": `${process.env.CONGRESS_KEY}`,
        }
     })

      const data = await resp.json()

      // commented out for cleanliness
      // console.log(data)

      const bill = data.results[0]

      const user = req.user

      const billExists = await Bill.exists({ billSlug: data.results[0].bill_id})

      let votes = 0

      await Bill.findOne({ billSlug: data.results[0].bill_slug}, function(err,bill){
        if(err){
          console.log(err)
        }else if(bill){
          votes = bill.yeas + bill.nays
        }
      })

      const response = await fetch(`https://api.propublica.org/congress/v1/members/${bill.bill_type === 'hr' ? 'house' : 'senate'}/${req.user.state.toUpperCase()}/current.json`, {
        headers: {
          "X-API-KEY": `${process.env.CONGRESS_KEY}`,
        }
      })

      const repData = await response.json()

      const repsArray = repData.results

      res.render("voteDetailsVoted.ejs", { bill: bill, votes: votes, user: user, repsArray: repsArray })

    } catch (err) {
      console.log(err);
    }
  },
  createYea: async (req, res) => {
    // Here We Go!
    console.log('XHGDSHJAGDHSIKJANHUISJKNHXUIJKSHXSUIAJKXHSUIXKJSAHMXJKSAHXMSUKAJXHMSUNK')
    console.log(req.body)
    console.log(req.user)
    try {

      // If user hasn't voted on this bill yet, add it to their array. This won't be truly needed.
      if(!req.user.yeaBillSlugs.includes(req.body.billSlug) || req.user.nayBillSlugs.includes(req.body.billSlug)){
        await User.findOneAndUpdate( 
          {_id: req.user._id},
          {
            $set: {yeaBillSlugs: [...req.user.yeaBillSlugs, req.body.billSlug]}
          } )
      }
      
      // If the bill doesn't exist, create the bill
      const billExists = await Bill.exists({ billSlug: req.body.billSlug })
      
      if(!billExists){
        await Bill.create({
          title: req.body.title,
          billSlug: req.body.billSlug,
          congress: req.body.congress,
          image: '/imgs/wtp.png',
          cloudinaryId: '',
          givenSummary: req.body.summary,
          nays: 0,
          yeas: 1,
        })
      // Else, update either the yay or nay number
      }else{
          await Bill.findOneAndUpdate(
            { billSlug: req.body.billSlug },
            {
              $inc: { yeas: 1 },
            }
          )
      }
      // Set the user's yayBillIds or nayBillIds array to include an object with {bill_slug: {yay: true, nay: false}}
      // await User.findOneAndUpdate()
      res.redirect(`detailsVoted/${req.body.billSlug}/${req.body.congress}`)
    } catch (err) {
      console.log(err);
    }
  },
  createNay: async (req, res) => {
    // Here We Go!
    console.log('XHGDSHJAGDHSIKJANHUISJKNHXUIJKSHXSUIAJKXHSUIXKJSAHMXJKSAHXMSUKAJXHMSUNK')
    console.log(req.user)
    console.log(await Bill.exists({ billSlug: req.body.billSlug }))
    try {

      // Add bill to the user's array of bills
      if(!req.user.yeaBillSlugs.includes(req.body.billSlug) || req.user.nayBillSlugs.includes(req.body.billSlug)){
        await User.findOneAndUpdate( 
          {_id: req.user._id},
          {nayBillSlugs: [...req.user.nayBillSlugs, req.body.billSlug]})
      }
      

      
      // If the bill doesn't exist, create the bill
      const billExists = await Bill.exists({ billSlug: req.body.billSlug })
      
      if(!billExists){
        await Bill.create({
          title: req.body.title,
          billSlug: req.body.billSlug,
          congress: req.body.congress,
          image: '/imgs/wtp.png',
          cloudinaryId: '',
          givenSummary: req.body.summary,
          nays: 1,
          yays: 0,
        })
        console.log('bill created')
      // Else, update either the yay or nay number
      }else{
          await Bill.findOneAndUpdate(
            { billSlug: req.body.billSlug },
            {
              $inc: { nays: 1 },
            }
          )
        console.log('bill updated')
      }
      // Set the user's yayBillIds or nayBillIds array to include an object with {bill_slug: {yay: true, nay: false}}
      // await User.findOneAndUpdate()
      await res.redirect(`detailsVoted/${req.body.billSlug}/${req.body.congress}`)
    } catch (err) {
      console.log(err);
    }
  },
};
