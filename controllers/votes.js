const cloudinary = require("../middleware/cloudinary");
const Post = require("../models/Post");
const Comment = require("../models/Comment");
const Bill = require("../models/Bill");
const User = require("../models/User");
const { findOneAndUpdate } = require("../models/Post");
const fetch = require("node-fetch")


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
  getNewBills: async (req, res) => {
    try {
      const resp = await fetch(`https://api.propublica.org/congress/v1/bills/search.json`, {
        headers: {
          "X-API-KEY": `${process.env.CONGRESS_KEY}`,
        }
     })
     
     const data = await resp.json()
     console.log('this is data ' + data)
     const billsArray = data.results[0].bills
     const user = req.user
     if(billsArray[0].title){
      res.render("newBills.ejs", { billsArray: billsArray, user: user })
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

      res.render("voteDetails.ejs", { bill: bill, votes: votes, user: req.user })

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

      // Get representatives by state and district
      const response = await fetch(`https://api.propublica.org/congress/v1/members/${bill.bill_type === 'hr' ? 'house' : 'senate'}/${req.user.state.toUpperCase()}/${bill.bill_type === 'hr' ? req.user.cd + '/' : ''}current.json`, {
        headers: {
          "X-API-KEY": `${process.env.CONGRESS_KEY}`,
        }
      })

      const repData = await response.json()

      const repsArray = repData.results

      console.log("THIS IS REPS ARRAY", repsArray)
      

      // Use repsArray to do a fetch to get their specific vote on this bill
      async function findVotesIndex(repVotesData){
        const voteIndex = await repVotesData.results[0].votes.forEach((vote, index) => {
          if(vote.bill.bill_id === bill.bill_id){
            return index
          }
        })
        return voteIndex
      }

      const firstRepVotesResponse = await fetch(`https://api.propublica.org/congress/v1/members/${repsArray[0].id}/votes.json`, {
        headers: {
          "X-API-KEY": `${process.env.CONGRESS_KEY}`,
        }
      })

      const firstRepVotesData = await firstRepVotesResponse.json()

      // Set data equal to ONLY the data on the current bill
      const firstRepVotesDataOnThisBill = firstRepVotesData.results[0].votes.filter(x => x.bill.bill_id === bill.bill_id)

      const firstRepsVote = firstRepVotesDataOnThisBill.length > 0 ? firstRepVotesDataOnThisBill[0].position : 'Has Not Voted On This Bill'

      console.log(firstRepsVote, 'This Is firstRepsVote')
      
      // If it's a senate vote, get the second senator's position
      let secondRepsVote = undefined
      console.log(repsArray[1], 'repsArray[1]')
      if(repsArray.length > 1){
        const secondRepVotesResponse = await fetch(`https://api.propublica.org/congress/v1/members/${repsArray[1].id}/votes.json`, {
          headers: {
            "X-API-KEY": `${process.env.CONGRESS_KEY}`,
          }
        })

        const secondRepVotesData = await secondRepVotesResponse.json()

        const secondRepVotesDataOnThisBill = secondRepVotesData.results[0].votes.filter(x => x.bill.bill_id === bill.bill_id)

        secondRepsVote = secondRepVotesDataOnThisBill.length > 0 ? secondRepVotesDataOnThisBill[0].position : 'Has Not Voted On This Bill'

        console.log(secondRepsVote, ': This Is secondRepsVote')
      }
      


      const yeasArray = await User.find( { yeaBillSlugs: bill.bill_slug })

      const yeasByDistrictArray = await User.find( { yeaBillSlugs: bill.bill_slug, state: req.user.state, cd: req.user.cd })
      
      const yeas = yeasArray.length

      const yeasByDistrict = yeasByDistrictArray.length
      
      console.log(yeas, 'this is yeas', yeas, "this is yeas")

      const naysArray = await User.find( { nayBillSlugs: bill.bill_slug})

      const naysByDistrictArray = await User.find( { nayBillSlugs: bill.bill_slug, state: req.user.state, cd: req.user.cd })

      const nays = naysArray.length

      const naysByDistrict = naysByDistrictArray.length

      // Does the user have a post for this bill already?
      const postExists = await Post.exists( { user: user.id, billSlug: bill.bill_slug } )
      // If User has a post for this bill, get the post data to send to ejs
      let post = {}
      if(postExists){
        post = await Post.findOne( { user: user.id, billSlug: bill.bill_slug })
        console.log("THIS IS POSTS---------------------------------------------------", post)
      }

      res.render("voteDetailsVoted.ejs", { bill: bill, votes: votes, user: user, repsArray: repsArray, yeas: yeas, nays: nays, yeasByDistrict: yeasByDistrict, naysByDistrict: naysByDistrict, firstRepsVote: firstRepsVote, secondRepsVote: secondRepsVote, postExists: postExists, post: post })

    } catch (err) {
      console.log(err);
    }
  },
  createYea: async (req, res) => {
    // Here We Go!
    console.log('Console.logs for createYea')
    console.log("The User is: ", req.user)
    console.log("Bill exists?: ", await Bill.exists({ billSlug: req.body.billSlug }))
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
      }else if(!req.user.yeaBillSlugs.includes(req.body.billSlug)){
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
    console.log('Console.logs for createNay')
    console.log("The User is: ", req.user)
    console.log("Bill exists?: ", await Bill.exists({ billSlug: req.body.billSlug }))
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
      }else if(!req.user.nayBillSlugs.includes(req.body.billSlug)){
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
