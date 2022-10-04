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
};
