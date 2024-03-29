const cloudinary = require("../middleware/cloudinary");
const Post = require("../models/Post");
const Comment = require("../models/Comment");
const Bill = require("../models/Bill");
const fetch = require("node-fetch");

module.exports = {
  getProfile: async (req, res) => {
    try {
      // Get user's representatives
      console.log("this is req.user", req.user);
      const houseResponse = await fetch(
        `https://api.propublica.org/congress/v1/members/house/${req.user.state.toUpperCase()}/${
          req.user.cd
        }/current.json`,
        {
          headers: {
            "X-API-KEY": `${process.env.CONGRESS_KEY}`,
          },
        }
      );

      const repData = await houseResponse.json();

      const repsArray = repData.results;

      // Get user's representatives
      const senateResponse = await fetch(
        `https://api.propublica.org/congress/v1/members/senate/${req.user.state.toUpperCase()}/current.json`,
        {
          headers: {
            "X-API-KEY": `${process.env.CONGRESS_KEY}`,
          },
        }
      );

      const senateData = await senateResponse.json();

      const senateArray = senateData.results;

      // Get an array of all user's posts
      const posts = await Post.find({ user: req.user.id });

      //Get an array of all the bills this user has voted on
      let votes = [];
      let numOfYeasInUsersArray = req.user.yeaBillSlugs.length;
      let numOfNaysInUsersArray = req.user.nayBillSlugs.length;
      //this loop goes through all the bills this user has voted on and adds them to the votes array
      for (let i = 0; i < req.user.yeaBillSlugs.length; i++) {
        const bill = await Bill.findOne({ billSlug: req.user.yeaBillSlugs[i] });
        votes.push({ bill: bill, position: "Yea" });
        console.log(votes);
      }
      for (let i = 0; i < req.user.nayBillSlugs.length; i++) {
        const bill = await Bill.findOne({ billSlug: req.user.nayBillSlugs[i] });
        votes.push({ bill: bill, position: "Nay" });
      }

      res.render("profile.ejs", {
        posts: posts,
        votes: votes,
        numOfYeasInUserArray: numOfYeasInUsersArray,
        numOfNaysInUserArray: numOfNaysInUsersArray,
        user: req.user,
        repsArray: repsArray,
        senateArray: senateArray,
      });
    } catch (err) {
      console.log(err);
    }
  },
  getFeed: async (req, res) => {
    try {
      const posts = await Post.find().sort({ createdAt: "desc" }).lean();
      res.render("feed.ejs", { posts: posts, user: req.user });
    } catch (err) {
      console.log(err);
    }
  },
  getPost: async (req, res) => {
    try {
      const post = await Post.findById(req.params.id);
      const comments = await Comment.find({ post: req.params.id })
        .sort({ createdAt: "desc" })
        .lean();
      const bill = await Bill.findOne({ billSlug: post.billSlug });

      res.render("post.ejs", {
        post: post,
        comments: comments,
        bill: bill,
        user: req.user,
      });
    } catch (err) {
      console.log(err);
    }
  },
  createPost: async (req, res) => {
    try {
      // Upload image to cloudinary
      const result = await cloudinary.uploader.upload(req.file.path);

      await Post.create({
        title: req.body.title,
        image: result.secure_url,
        billSlug: req.body.billSlug,
        billCongress: req.body.billCongress,
        cloudinaryId: result.public_id,
        caption: req.body.caption,
        likes: 0,
        user: req.user.id,
      });
      console.log("Post has been added!");

      console.log(req.body);
      res.redirect(
        `/vote/detailsVoted/${req.body.billSlug}/${req.body.billCongress}`
      );
    } catch (err) {
      console.log(err);
    }
  },
  likePost: async (req, res) => {
    try {
      await Post.findOneAndUpdate(
        { _id: req.params.id },
        {
          $inc: { likes: 1 },
        }
      );
      console.log("Likes +1");
      res.redirect(`/post/${req.params.id}`);
    } catch (err) {
      console.log(err);
    }
  },
  deletePost: async (req, res) => {
    try {
      // Find post by id
      let post = await Post.findById({ _id: req.params.id });
      // Delete image from cloudinary
      await cloudinary.uploader.destroy(post.cloudinaryId);
      // Delete post from db
      await Post.remove({ _id: req.params.id });
      console.log("Deleted Post");
      res.redirect("/profile");
    } catch (err) {
      res.redirect("/profile");
    }
  },
};
