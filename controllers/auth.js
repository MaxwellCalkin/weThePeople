const passport = require("passport");
const validator = require("validator");
const User = require("../models/User");
const fetch = require("node-fetch");

exports.getLogin = (req, res) => {
  if (req.user) {
    return res.redirect("/profile");
  }
  res.render("login", { title: "Login" });
};

exports.postLogin = (req, res, next) => {
  const validationErrors = [];
  if (!validator.isEmail(req.body.email))
    validationErrors.push({ msg: "Please enter a valid email address." });
  if (validator.isEmpty(req.body.password))
    validationErrors.push({ msg: "Password cannot be blank." });

  if (validationErrors.length) {
    req.flash("errors", validationErrors);
    return res.redirect("/login");
  }

  req.body.email = validator.normalizeEmail(req.body.email, {
    gmail_remove_dots: false,
  });

  passport.authenticate("local", (err, user, info) => {
    if (err) return next(err);
    if (!user) {
      req.flash("errors", info);
      return res.redirect("/login");
    }
    req.logIn(user, (err) => {
      if (err) return next(err);
      req.flash("success", { msg: "Success! You are logged in." });
      res.redirect(req.session.returnTo || "/profile");
    });
  })(req, res, next);
};

exports.logout = (req, res) => {
  req.logout(() => {
    console.log("User has logged out.");
  });
  req.session.destroy((err) => {
    if (err)
      console.log("Error: Failed to destroy the session during logout.", err);
    req.user = null;
    res.redirect("/");
  });
};

exports.getSignup = (req, res) => {
  if (req.user) {
    return res.redirect("/profile");
  }
  res.render("signup", { title: "Create Account" });
};

exports.postSignup = async (req, res, next) => {
  try {
    // Validate inputs first (before making API calls)
    const validationErrors = [];
    if (!req.body.userName || validator.isEmpty(req.body.userName.trim()))
      validationErrors.push({ msg: "Username is required." });
    if (!validator.isEmail(req.body.email))
      validationErrors.push({ msg: "Please enter a valid email address." });
    if (!validator.isLength(req.body.password, { min: 8 }))
      validationErrors.push({
        msg: "Password must be at least 8 characters long",
      });
    if (req.body.password !== req.body.confirmPassword)
      validationErrors.push({ msg: "Passwords do not match" });
    if (!req.body.address || validator.isEmpty(req.body.address.trim()))
      validationErrors.push({ msg: "Address is required to find your representatives." });

    if (validationErrors.length) {
      req.flash("errors", validationErrors);
      return res.redirect("/signup");
    }

    // Look up congressional district via Google Civic divisionsByAddress API
    const resp = await fetch(
      `https://civicinfo.googleapis.com/civicinfo/v2/divisionsByAddress?address=${encodeURIComponent(
        req.body.address
      )}&key=${process.env.GOOGLE_KEY}`,
      { method: "GET" }
    );
    const data = await resp.json();

    if (!data.divisions) {
      req.flash("errors", [
        {
          msg: "Could not find your congressional district. Try a more specific address (include city, state, and zip).",
        },
      ]);
      return res.redirect("/signup");
    }

    // Parse OCD-IDs to find state and congressional district
    const divisionIds = Object.keys(data.divisions);
    let state = "";
    let cd = "1"; // Default to at-large

    // Find the state from any division ID containing "state:"
    for (const id of divisionIds) {
      const stateMatch = id.match(/state:([a-z]{2})/);
      if (stateMatch) {
        state = stateMatch[1];
        break;
      }
    }

    // Find the congressional district (cd:XX)
    for (const id of divisionIds) {
      const cdMatch = id.match(/\/cd:(\d+)/);
      if (cdMatch) {
        cd = cdMatch[1];
        break;
      }
    }

    if (!state) {
      req.flash("errors", [
        { msg: "Could not determine your state. Please try a different address." },
      ]);
      return res.redirect("/signup");
    }

    // Normalize email
    const normalizedEmail = validator.normalizeEmail(req.body.email, {
      gmail_remove_dots: false,
    });

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email: normalizedEmail }, { userName: req.body.userName }],
    });

    if (existingUser) {
      req.flash("errors", [
        { msg: "Account with that email address or username already exists." },
      ]);
      return res.redirect("/signup");
    }

    // Create and save new user
    const user = new User({
      userName: req.body.userName,
      email: normalizedEmail,
      password: req.body.password,
      state: state,
      cd: cd,
    });

    await user.save();

    // Auto-login after signup
    req.logIn(user, (err) => {
      if (err) return next(err);
      res.redirect("/profile");
    });
  } catch (err) {
    console.error("Signup error:", err);
    req.flash("errors", [
      { msg: "Something went wrong during signup. Please try again." },
    ]);
    return res.redirect("/signup");
  }
};
