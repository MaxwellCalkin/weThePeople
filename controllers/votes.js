const cloudinary = require("../middleware/cloudinary");
const Post = require("../models/Post");
const Comment = require("../models/Comment");
const Bill = require("../models/Bill");
const User = require("../models/User");
const fetch = require("node-fetch");

const CONGRESS_API = "https://api.congress.gov/v3";

// Helper: get current congress number
function getCurrentCongress() {
  const year = new Date().getFullYear();
  return Math.floor((year - 1789) / 2) + 1;
}

// Helper: parse a ProPublica-style bill_slug (e.g. "hr1234-117") into congress.gov parts
// bill_slug format from our app: "hr1234" or stored as bill_id "hr1234-117"
function parseBillSlug(billSlug) {
  // Match type prefix and number, e.g. "hr1234", "s456", "hjres78"
  const match = billSlug.match(/^([a-z]+)(\d+)$/i);
  if (!match) return null;
  return { type: match[1].toLowerCase(), number: match[2] };
}

// Helper: fetch bill details from Congress.gov and normalize to ProPublica-like fields
async function fetchBillDetails(congress, billSlug) {
  const parsed = parseBillSlug(billSlug);
  if (!parsed) return null;

  const url = `${CONGRESS_API}/bill/${congress}/${parsed.type}/${parsed.number}?api_key=${process.env.CONGRESS_KEY}&format=json`;
  const resp = await fetch(url);
  const data = await resp.json();
  const b = data.bill;
  if (!b) return null;

  // Fetch summary if available
  let summary = "";
  try {
    const sumResp = await fetch(
      `${CONGRESS_API}/bill/${congress}/${parsed.type}/${parsed.number}/summaries?api_key=${process.env.CONGRESS_KEY}&format=json`
    );
    const sumData = await sumResp.json();
    if (sumData.summaries && sumData.summaries.length > 0) {
      summary = sumData.summaries[sumData.summaries.length - 1].text || "";
      // Strip HTML tags from summary
      summary = summary.replace(/<[^>]*>/g, "");
    }
  } catch (e) {
    console.log("Could not fetch bill summary:", e.message);
  }

  // Normalize to match EJS template field names
  return {
    short_title: b.title || "",
    title: b.title || "",
    bill_id: `${parsed.type}${parsed.number}-${congress}`,
    bill_slug: `${parsed.type}${parsed.number}`,
    bill_type: parsed.type,
    congress: congress.toString(),
    summary: summary,
    image: "/imgs/wtp.png",
    introduced_date: b.introducedDate || "",
    latest_major_action: b.latestAction ? b.latestAction.text : "",
    latest_major_action_date: b.latestAction ? b.latestAction.actionDate : "",
    sponsor: b.sponsors && b.sponsors.length > 0 ? b.sponsors[0].fullName : "",
  };
}

// Helper: search bills from Congress.gov
async function searchBills(query) {
  const congress = getCurrentCongress();
  // Congress.gov doesn't have a text search param, so we use the list endpoint
  // and filter client-side, or use the congress.gov search URL
  // Actually the API does support a search via the /bill endpoint with query params
  // Let's try using the LOC search API
  let url;
  if (query) {
    // Search within current congress
    url = `${CONGRESS_API}/bill/${congress}?query=${encodeURIComponent(query)}&limit=20&sort=updateDate+desc&api_key=${process.env.CONGRESS_KEY}&format=json`;
  } else {
    // Latest bills from current congress
    url = `${CONGRESS_API}/bill/${congress}?limit=20&sort=updateDate+desc&api_key=${process.env.CONGRESS_KEY}&format=json`;
  }

  const resp = await fetch(url);
  const data = await resp.json();
  const bills = data.bills || [];

  // Normalize to match EJS template field names
  return bills.map((b) => {
    const type = (b.type || "hr").toLowerCase();
    const number = b.number || "";
    return {
      short_title: b.title || "",
      title: b.title || "",
      bill_id: `${type}${number}-${b.congress || congress}`,
      bill_slug: `${type}${number}`,
      bill_type: type,
      congress: (b.congress || congress).toString(),
      latest_major_action: b.latestAction ? b.latestAction.text : "",
      latest_major_action_date: b.latestAction
        ? b.latestAction.actionDate
        : "",
    };
  });
}

// Helper: fetch members from Congress.gov API
async function fetchMembers(state, district) {
  const base = `${CONGRESS_API}/member`;
  let url;
  if (district) {
    url = `${base}/${state.toUpperCase()}/${district}?currentMember=true&api_key=${process.env.CONGRESS_KEY}&format=json`;
  } else {
    url = `${base}/${state.toUpperCase()}?currentMember=true&api_key=${process.env.CONGRESS_KEY}&format=json`;
  }
  const resp = await fetch(url);
  const data = await resp.json();
  const members = data.members || [];
  return members.map((m) => ({
    id: m.bioguideId,
    name: m.name || `${m.firstName || ""} ${m.lastName || ""}`.trim(),
    party: m.partyName || m.party || "",
    state: m.state,
    district: m.district,
  }));
}

// Helper: look up a member's vote on a specific bill using Congress.gov actions endpoint
// Returns "Yea", "Nay", "Passed by Unanimous Consent", "Passed by Voice Vote", or "Has Not Voted On This Bill"
async function getMemberVoteOnBill(memberId, congress, billType, billNumber, chamber) {
  try {
    // Step 1: Get bill actions to find roll call vote numbers
    const actionsUrl = `${CONGRESS_API}/bill/${congress}/${billType}/${billNumber}/actions?api_key=${process.env.CONGRESS_KEY}&format=json&limit=50`;
    const actionsResp = await fetch(actionsUrl);
    const actionsData = await actionsResp.json();
    const actions = actionsData.actions || [];

    // Find actions that have recorded votes
    let rollCallVotes = [];
    let passedByUC = false;
    let passedByVoice = false;
    for (const action of actions) {
      if (action.recordedVotes && action.recordedVotes.length > 0) {
        rollCallVotes.push(...action.recordedVotes);
      }
      // Detect unanimous consent or voice vote passages
      const text = (action.text || "").toLowerCase();
      if (text.includes("passed") || text.includes("agreed to")) {
        if (text.includes("unanimous consent") || text.includes("without objection") || text.includes("without amendment")) {
          passedByUC = true;
        }
        if (text.includes("voice vote")) {
          passedByVoice = true;
        }
      }
    }

    if (rollCallVotes.length === 0) {
      // No recorded roll call vote — check if it passed another way
      if (passedByUC) return "Passed by Unanimous Consent";
      if (passedByVoice) return "Passed by Voice Vote";

      // Companion bill check: e.g. Senate bill S.2557 may have no Senate action,
      // but H.R.4405 (same number) was passed by the Senate via UC.
      const companionType = billType === "s" ? "hr" : billType === "hr" ? "s" : null;
      if (companionType) {
        try {
          const companionUrl = `${CONGRESS_API}/bill/${congress}/${companionType}/${billNumber}/actions?api_key=${process.env.CONGRESS_KEY}&format=json&limit=50`;
          const companionResp = await fetch(companionUrl);
          if (companionResp.ok) {
            const companionData = await companionResp.json();
            const companionActions = companionData.actions || [];
            for (const ca of companionActions) {
              const caText = (ca.text || "").toLowerCase();
              const targetChamber = chamber.toLowerCase();
              const passedInTarget =
                (targetChamber === "senate" && (caText.includes("passed/agreed to in senate") || (caText.includes("senate") && (caText.includes("passed") || caText.includes("agreed to"))))) ||
                (targetChamber === "house" && (caText.includes("passed/agreed to in house") || (caText.includes("house") && (caText.includes("passed") || caText.includes("agreed to")))));
              if (passedInTarget) {
                if (caText.includes("unanimous consent") || caText.includes("without objection")) {
                  return "Passed by Unanimous Consent";
                }
                if (caText.includes("voice vote")) {
                  return "Passed by Voice Vote";
                }
                if (ca.recordedVotes && ca.recordedVotes.length > 0) {
                  rollCallVotes.push(...ca.recordedVotes);
                  break;
                }
              }
            }
          }
        } catch (e) {
          console.log("Error checking companion bill:", e.message);
        }
      }

      if (rollCallVotes.length === 0) {
        return "Has Not Voted On This Bill";
      }
    }

    // Step 2: For each roll call vote, check the member's position
    for (const rv of rollCallVotes) {
      const voteUrl = rv.url;
      if (!voteUrl) continue;

      // Senate votes come from senate.gov XML
      if (voteUrl.includes("senate.gov")) {
        try {
          const xmlResp = await fetch(voteUrl);
          const xmlText = await xmlResp.text();
          // Parse XML to find member's vote by bioguide ID
          const memberPattern = new RegExp(
            `<member>[\\s\\S]*?<lis_member_id>[\\s\\S]*?</lis_member_id>[\\s\\S]*?<bioguide_id>${memberId}</bioguide_id>[\\s\\S]*?<vote_cast>([^<]+)</vote_cast>[\\s\\S]*?</member>`,
            "i"
          );
          const match = xmlText.match(memberPattern);
          if (match) {
            return match[1]; // "Yea", "Nay", "Not Voting", etc.
          }
        } catch (e) {
          console.log("Error fetching Senate vote XML:", e.message);
        }
      }
      // House votes from clerk.house.gov XML
      else if (voteUrl.includes("clerk.house.gov")) {
        try {
          const xmlResp = await fetch(voteUrl);
          const xmlText = await xmlResp.text();
          // House XML uses name-id (which is the bioguide ID) and <vote>Aye/No/etc.</vote>
          const memberPattern = new RegExp(
            `name-id="${memberId}"[^>]*>.*?<vote>([^<]+)</vote>`,
            "i"
          );
          const match = xmlText.match(memberPattern);
          if (match) {
            // Normalize House terminology: Aye→Yea, No→Nay
            const vote = match[1];
            if (vote === "Aye") return "Yea";
            if (vote === "No") return "Nay";
            return vote; // "Not Voting", "Present", etc.
          }
        } catch (e) {
          console.log("Error fetching House vote XML:", e.message);
        }
      }
    }

    return "Has Not Voted On This Bill";
  } catch (err) {
    console.log("Error in getMemberVoteOnBill:", err.message);
    return "Has Not Voted On This Bill";
  }
}

module.exports = {
  getVotes: async (req, res) => {
    try {
      res.render("vote.ejs", { votes: [] });
    } catch (err) {
      console.log(err);
    }
  },
  getSearch: async (req, res) => {
    console.log("Searched: " + req.query.search);
    try {
      const billsArray = await searchBills(req.query.search);
      const user = req.user;
      if (billsArray.length > 0 && billsArray[0].title) {
        res.render("voteSearch.ejs", { billsArray: billsArray, user: user });
      } else {
        res.redirect("feed.ejs");
      }
    } catch (err) {
      console.log(err);
    }
  },
  getNewBills: async (req, res) => {
    try {
      const billsArray = await searchBills(null);
      const user = req.user;
      if (billsArray.length > 0 && billsArray[0].title) {
        res.render("newBills.ejs", { billsArray: billsArray, user: user });
      } else {
        res.redirect("feed.ejs");
      }
    } catch (err) {
      console.log(err);
    }
  },
  getDetails: async (req, res) => {
    try {
      const bill = await fetchBillDetails(req.params.congress, req.params.bill_slug);

      if (!bill) {
        return res.redirect("/feed");
      }

      let votes = 0;
      const existingBill = await Bill.findOne({ billSlug: bill.bill_slug });
      if (existingBill) {
        votes = existingBill.yeas + existingBill.nays;
      }

      res.render("voteDetails.ejs", {
        bill: bill,
        votes: votes,
        user: req.user,
      });
    } catch (err) {
      console.log(err);
    }
  },
  getDetailsVoted: async (req, res) => {
    try {
      const bill = await fetchBillDetails(req.params.congress, req.params.bill_slug);

      if (!bill) {
        return res.redirect("/feed");
      }

      const user = req.user;

      let votes = 0;
      const existingBill = await Bill.findOne({ billSlug: bill.bill_slug });
      if (existingBill) {
        votes = existingBill.yeas + existingBill.nays;
      }

      // Determine which chamber this bill belongs to
      const parsed = parseBillSlug(bill.bill_slug);
      const houseBillTypes = ["hr", "hres", "hjres", "hconres"];
      const isHouseBill = houseBillTypes.includes(bill.bill_type || "");

      let repsArray = [];
      let firstRepsVote = "Has Not Voted On This Bill";
      let secondRepsVote = undefined;

      if (isHouseBill) {
        // House bill — only show House representative
        repsArray = await fetchMembers(req.user.state, req.user.cd);
        if (repsArray.length > 0 && parsed) {
          firstRepsVote = await getMemberVoteOnBill(
            repsArray[0].id,
            req.params.congress,
            parsed.type,
            parsed.number,
            "house"
          );
        }
      } else {
        // Senate bill — only show Senators
        const allStateMembers = await fetchMembers(req.user.state);
        repsArray = allStateMembers.filter((m) => !m.district || m.district === 0);
        if (repsArray.length > 0 && parsed) {
          firstRepsVote = await getMemberVoteOnBill(
            repsArray[0].id,
            req.params.congress,
            parsed.type,
            parsed.number,
            "senate"
          );
        }
        if (repsArray.length > 1 && parsed) {
          secondRepsVote = await getMemberVoteOnBill(
            repsArray[1].id,
            req.params.congress,
            parsed.type,
            parsed.number,
            "senate"
          );
        }
      }

      const yeasArray = await User.find({ yeaBillSlugs: bill.bill_slug });
      const yeasByDistrictArray = await User.find({
        yeaBillSlugs: bill.bill_slug,
        state: req.user.state,
        cd: req.user.cd,
      });
      const yeas = yeasArray.length;
      const yeasByDistrict = yeasByDistrictArray.length;

      const naysArray = await User.find({ nayBillSlugs: bill.bill_slug });
      const naysByDistrictArray = await User.find({
        nayBillSlugs: bill.bill_slug,
        state: req.user.state,
        cd: req.user.cd,
      });
      const nays = naysArray.length;
      const naysByDistrict = naysByDistrictArray.length;

      // Does the user have a post for this bill already?
      const postExists = await Post.exists({
        user: user.id,
        billSlug: bill.bill_slug,
      });
      let post = {};
      if (postExists) {
        post = await Post.findOne({
          user: user.id,
          billSlug: bill.bill_slug,
        });
      }

      res.render("voteDetailsVoted.ejs", {
        bill: bill,
        votes: votes,
        user: user,
        repsArray: repsArray,
        yeas: yeas,
        nays: nays,
        yeasByDistrict: yeasByDistrict,
        naysByDistrict: naysByDistrict,
        firstRepsVote: firstRepsVote,
        secondRepsVote: secondRepsVote,
        postExists: postExists,
        post: post,
      });
    } catch (err) {
      console.log(err);
    }
  },
  createYea: async (req, res) => {
    console.log("Console.logs for createYea");
    try {
      if (
        !req.user.yeaBillSlugs.includes(req.body.billSlug) ||
        req.user.nayBillSlugs.includes(req.body.billSlug)
      ) {
        await User.findOneAndUpdate(
          { _id: req.user._id },
          {
            $set: {
              yeaBillSlugs: [...req.user.yeaBillSlugs, req.body.billSlug],
            },
          }
        );
      }

      const billExists = await Bill.exists({ billSlug: req.body.billSlug });

      if (!billExists) {
        await Bill.create({
          title: req.body.title,
          billSlug: req.body.billSlug,
          congress: req.body.congress,
          image: "/imgs/wtp.png",
          cloudinaryId: "",
          givenSummary: req.body.summary,
          nays: 0,
          yeas: 1,
        });
      } else if (!req.user.yeaBillSlugs.includes(req.body.billSlug)) {
        await Bill.findOneAndUpdate(
          { billSlug: req.body.billSlug },
          { $inc: { yeas: 1 } }
        );
      }
      res.redirect(`detailsVoted/${req.body.billSlug}/${req.body.congress}`);
    } catch (err) {
      console.log(err);
    }
  },
  createNay: async (req, res) => {
    console.log("Console.logs for createNay");
    try {
      if (
        !req.user.yeaBillSlugs.includes(req.body.billSlug) ||
        req.user.nayBillSlugs.includes(req.body.billSlug)
      ) {
        await User.findOneAndUpdate(
          { _id: req.user._id },
          { nayBillSlugs: [...req.user.nayBillSlugs, req.body.billSlug] }
        );
      }

      const billExists = await Bill.exists({ billSlug: req.body.billSlug });

      if (!billExists) {
        await Bill.create({
          title: req.body.title,
          billSlug: req.body.billSlug,
          congress: req.body.congress,
          image: "/imgs/wtp.png",
          cloudinaryId: "",
          givenSummary: req.body.summary,
          nays: 1,
          yeas: 0,
        });
      } else if (!req.user.nayBillSlugs.includes(req.body.billSlug)) {
        await Bill.findOneAndUpdate(
          { billSlug: req.body.billSlug },
          { $inc: { nays: 1 } }
        );
      }
      await res.redirect(
        `detailsVoted/${req.body.billSlug}/${req.body.congress}`
      );
    } catch (err) {
      console.log(err);
    }
  },
};
