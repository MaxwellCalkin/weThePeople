const cloudinary = require("../middleware/cloudinary");
const Post = require("../models/Post");
const Comment = require("../models/Comment");
const Bill = require("../models/Bill");
const fetch = require("node-fetch");

// Helper: get current congress number (119th for 2025-2026)
function getCurrentCongress() {
  const year = new Date().getFullYear();
  return Math.floor((year - 1789) / 2) + 1;
}

// Helper: fetch members from Congress.gov API by state (and optionally district)
async function fetchMembers(state, district) {
  const base = "https://api.congress.gov/v3/member";
  let url;
  if (district) {
    url = `${base}/${state.toUpperCase()}/${district}?currentMember=true&api_key=${process.env.CONGRESS_KEY}&format=json`;
  } else {
    url = `${base}/${state.toUpperCase()}?currentMember=true&api_key=${process.env.CONGRESS_KEY}&format=json`;
  }
  const resp = await fetch(url);
  const data = await resp.json();
  const members = data.members || [];
  // Normalize to match the field names the EJS templates expect
  return members.map((m) => ({
    id: m.bioguideId,
    name: m.name || `${m.firstName || ""} ${m.lastName || ""}`.trim(),
    party: m.partyName || m.party || "",
    state: m.state,
    district: m.district,
    url: m.officialUrl || m.url || "",
  }));
}

module.exports = {
  getProfile: async (req, res) => {
    try {
      // Get user's House representatives
      const repsArray = await fetchMembers(req.user.state, req.user.cd);

      // Get user's Senators (no district filter = returns all members for state, filter to senate)
      const allStateMembers = await fetchMembers(req.user.state);
      // Senators have no district field
      const senateArray = allStateMembers.filter(
        (m) => !m.district || m.district === 0
      );

      // Get an array of all user's posts
      const posts = await Post.find({ user: req.user.id });

      // Get an array of all the bills this user has voted on
      let votes = [];
      for (let i = 0; i < req.user.yeaBillSlugs.length; i++) {
        const bill = await Bill.findOne({
          billSlug: req.user.yeaBillSlugs[i],
        });
        votes.push({ bill: bill, position: "Yea" });
      }
      for (let i = 0; i < req.user.nayBillSlugs.length; i++) {
        const bill = await Bill.findOne({
          billSlug: req.user.nayBillSlugs[i],
        });
        votes.push({ bill: bill, position: "Nay" });
      }

      res.render("profile.ejs", {
        posts: posts,
        votes: votes,
        numOfYeasInUserArray: req.user.yeaBillSlugs.length,
        numOfNaysInUserArray: req.user.nayBillSlugs.length,
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
      // Upload image to cloudinary from memory buffer
      const b64 = Buffer.from(req.file.buffer).toString("base64");
      const dataURI = "data:" + req.file.mimetype + ";base64," + b64;
      const result = await cloudinary.uploader.upload(dataURI);

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
      await Post.deleteOne({ _id: req.params.id });
      console.log("Deleted Post");
      res.redirect("/profile");
    } catch (err) {
      res.redirect("/profile");
    }
  },
};
