module.exports = {
  ensureAuth: function (req, res, next) {
    if (req.isAuthenticated()) {
      return next();
    } else {
      res.redirect("/");
      alert('Please Login')
    }
  },
  ensureGuest: function (req, res, next) {
    if (!req.isAuthenticated()) {
      return next();
    } else {
      res.redirect("/dashboard");
    }
  },
  // ensureCD: async function (req, res, next) {
  //   const resp = await fetch(`https://civicinfo.googleapis.com/civicinfo/v2/representatives?address=${req.body.address}&levels=country&roles=legislatorLowerBody&key=${process.env.GOOGLE_KEY}`
  // }
  ensureNotVoted: function (req,res,next) {
    console.log('THIS IS REQ BODY FROM ENSURE NOT VOTED', req.params)
    const voted = req.user.yeaBillSlugs.includes(req.params.bill_slug) || req.user.nayBillSlugs.includes(req.params.bill_slug)
    if(voted){
      res.redirect(`/vote/details/${req.body.billSlug}/${req.body.congress}`)
    } else {
      return next()
    }
  }
};
