const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET);

const port = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.qcldgif.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();

    const db = client.db("blood_connect_db");
    const usersCollection = db.collection("users");
    const requestsCollection = db.collection("requests");
    const fundsCollection = db.collection("fundings");

    // common routes - All role

    // User registration -all role
    app.post("/users/register", async (req, res) => {
      const { name, email, avatar, bloodGroup, district, upazila, password } =
        req.body;

      try {
        const existingUser = await usersCollection.findOne({ email });
        if (existingUser) {
          return res.status(400).json({ message: "User already exists" });
        }

        const newUser = {
          name,
          email,
          avatar,
          bloodGroup,
          district,
          upazila,
          password,
          role: "donor",
          status: "active",
          createdAt: new Date(),
        };

        const result = await usersCollection.insertOne(newUser);

        res.status(201).json({
          message: "User registered successfully",
          userId: result.insertedId,
        });
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error" });
      }
    });

    // get User by email for all roles
    app.get("/users/:email", async (req, res) => {
      try {
        const email = decodeURIComponent(req.params.email.toLowerCase());
        const user = await usersCollection.findOne({ email });

        if (!user) {
          return res.status(404).json({ message: "User not found" });
        }

        res.json(user);
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error fetching user data" });
      }
    });

    // get user role by email
    app.get("/users/role/:email", async (req, res) => {
      try {
        const email = decodeURIComponent(req.params.email.toLowerCase());
        const user = await usersCollection.findOne({ email });

        if (!user) {
          return res.status(404).json({ message: "User not found" });
        }

        res.json({ role: user.role });
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error fetching role" });
      }
    });

    // update User Profile
    app.patch("/users/:email", async (req, res) => {
      try {
        const email = decodeURIComponent(req.params.email.toLowerCase());
        const { name, avatar, bloodGroup, district, upazila } = req.body;

        const result = await usersCollection.updateOne(
          { email },
          { $set: { name, avatar, bloodGroup, district, upazila } }
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({ message: "User not found" });
        }

        res.json({ message: "User updated successfully" });
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error updating user data" });
      }
    });

    // donor - route

    // create Blood Donation Request
    app.post("/requests", async (req, res) => {
      const requestData = req.body;

      const requesterEmail = requestData.requesterEmail;
      const user = await usersCollection.findOne({ email: requesterEmail });

      if (!user || user.status === "blocked") {
        return res.status(403).json({
          success: false,
          message: "Blocked users cannot create donation requests",
        });
      }

      const {
        patientName,
        bloodGroup,
        neededDate,
        district,
        upazila,
        reason,
        phone,
      } = requestData;

      if (
        !patientName ||
        !bloodGroup ||
        !neededDate ||
        !district ||
        !upazila ||
        !reason ||
        !phone
      ) {
        return res.status(400).json({ error: "All fields are required" });
      }

      try {
        const result = await requestsCollection.insertOne({
          ...requestData,
          createdAt: new Date(),
        });

        res.status(201).json({
          success: true,
          message: "Blood request submitted successfully",
          requestId: result.insertedId,
        });
      } catch (error) {
        console.error(error);
        res.status(500).json({
          error: "Something went wrong. Please try again later.",
        });
      }
    });

    // recent requests for donor
    app.get("/requests/recent", async (req, res) => {
      try {
        const email = req.query.email;

        if (!email) {
          return res
            .status(400)
            .json({ message: "Email query parameter is required" });
        }

        const donorRequests = await requestsCollection
          .find({ requesterEmail: email })
          .sort({ createdAt: -1 })
          .limit(3)
          .toArray();

        const formatted = await Promise.all(
          donorRequests.map(async (req) => {
            let donorName = null;
            let donorEmail = null;

            if (req.status === "inprogress" && req.donorEmail) {
              const donor = await usersCollection.findOne({
                email: req.donorEmail,
              });
              donorName = donor?.name || req.donorName || null;
              donorEmail = donor?.email || req.donorEmail || null;
            }

            return {
              _id: req._id,
              recipientName: req.patientName || "Not Provided",
              recipientLocation:
                `${req.district || ""}, ${req.upazila || ""}`.replace(
                  /, $/,
                  ""
                ) || "Not Provided",
              donationDate: req.neededDate || "Not Provided",
              donationTime: req.neededTime || "Not Provided",
              bloodGroup: req.bloodGroup || "Not Provided",
              donationStatus: req.status || "pending",
              donorName: donorName || req.requesterName,
              donorEmail: donorEmail || req.requesterEmail,
              createdAt: req.createdAt,
            };
          })
        );

        res.json(formatted);
      } catch (error) {
        res.status(500).json({ message: "Error fetching recent requests" });
      }
    });

    // All requests for donor with pagination
    app.get("/requests/all", async (req, res) => {
      try {
        const email = req.query.email;

        if (!email) {
          return res
            .status(400)
            .json({ message: "Email query parameter is required" });
        }

        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 10;
        const status = req.query.status;

        const filter = { requesterEmail: email };

        if (status) {
          filter.status = status;
        }

        const total = await requestsCollection.countDocuments(filter);

        const donorRequests = await requestsCollection
          .find(filter)
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .toArray();

        const formatted = await Promise.all(
          donorRequests.map(async (req) => {
            let donorName = null;
            let donorEmail = null;

            if (req.status === "inprogress" && req.donorEmail) {
              const donor = await usersCollection.findOne({
                email: req.donorEmail,
              });
              donorName = donor?.name || req.donorName || null;
              donorEmail = donor?.email || req.donorEmail || null;
            }

            return {
              _id: req._id,
              recipientName: req.patientName || "Not Provided",
              recipientLocation:
                `${req.district || ""}, ${req.upazila || ""}`.replace(
                  /, $/,
                  ""
                ) || "Not Provided",
              donationDate: req.neededDate || "Not Provided",
              donationTime: req.neededTime || "Not Provided",
              bloodGroup: req.bloodGroup || "Not Provided",
              donationStatus: req.status || "pending",
              donorName: donorName || req.requesterName,
              donorEmail: donorEmail || req.requesterEmail,
              createdAt: req.createdAt,
            };
          })
        );

        res.json({ data: formatted, total });
      } catch (error) {
        console.error("Error in /requests/all:", error);
        res.status(500).json({ message: "Error fetching requests" });
      }
    });

    // Single Request by ID
    app.get("/requests/:id", async (req, res) => {
      const id = req.params.id;
      const request = await requestsCollection.findOne({
        _id: new ObjectId(id),
      });

      res.json(request);
    });

    // update request- donor
    app.put("/requests/:id", async (req, res) => {
      const id = req.params.id;
      const body = req.body;

      const updated = await requestsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: body }
      );

      res.json(updated);
    });

    // update request status - donor
    app.patch("/requests/status/:id", async (req, res) => {
      const id = req.params.id;
      const { status, donorEmail } = req.body;

      const updateData = { status };

      if (status === "inprogress" && donorEmail) {
        updateData.donorEmail = donorEmail;
      }

      await requestsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updateData }
      );

      res.json({ message: "Status updated" });
    });

    // delete request of donor
    app.delete("/requests/:id", async (req, res) => {
      const id = req.params.id;

      const result = await requestsCollection.deleteOne({
        _id: new ObjectId(id),
      });

      res.json(result);
    });

    // search donors
    app.get("/donors/search", async (req, res) => {
      const { bloodGroup, district, upazila } = req.query;

      const filter = {
        role: "donor",
        status: "active",
      };

      if (bloodGroup) filter.bloodGroup = bloodGroup;
      if (district) filter.district = district;
      if (upazila) filter.upazila = upazila;

      try {
        const donors = await usersCollection
          .find(filter)
          .project({ password: 0 })
          .toArray();

        res.send(donors);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Search failed" });
      }
    });

    // Volunteer route

    // Volunteer dashboard statistics
    app.get("/volunteer/dashboard-stats", async (req, res) => {
      try {
        const totalUsers = await usersCollection.countDocuments({});
        const totalRequests = await requestsCollection.countDocuments({});
        const totalFundingAgg = await fundsCollection
          .aggregate([{ $group: { _id: null, total: { $sum: "$amount" } } }])
          .toArray();
        const totalFunding = totalFundingAgg[0]?.total || 0;

        res.json({
          totalUsers,
          totalRequests,
          totalFunding,
        });
      } catch (error) {
        console.error("Error fetching volunteer stats:", error);
        res
          .status(500)
          .json({ message: "Error fetching volunteer statistics" });
      }
    });

    // Admin route

    // admin dashboard statistics
    app.get("/admin/dashboard-stats", async (req, res) => {
      try {
        const totalUsers = await usersCollection.countDocuments({});
        const totalRequests = await requestsCollection.countDocuments({});
        const totalFundsAgg = await fundsCollection
          .aggregate([{ $group: { _id: null, total: { $sum: "$amount" } } }])
          .toArray();

        res.json({
          totalUsers,
          totalRequests,
          totalFunding: totalFundsAgg[0]?.total || 0,
        });
      } catch (error) {
        console.error("Error fetching admin stats:", error);
        res.status(500).json({ message: "Error fetching admin statistics" });
      }
    });

    // all requests for admin with pagination
    app.get("/admin/requests/all", async (req, res) => {
      try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 10;
        const status = req.query.status;

        const filter = {};

        if (status) {
          filter.status = status;
        }

        const total = await requestsCollection.countDocuments(filter);

        const allRequests = await requestsCollection
          .find(filter)
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .toArray();

        const formatted = allRequests.map((req) => ({
          _id: req._id,
          recipientName: req.patientName || "Not Provided",
          recipientLocation:
            `${req.district || ""}, ${req.upazila || ""}`.replace(/, $/, "") ||
            "Not Provided",
          donationDate: req.neededDate || "Not Provided",
          donationTime: req.neededTime || "Not Provided",
          bloodGroup: req.bloodGroup || "Not Provided",
          donationStatus: req.status || "pending",
          requesterEmail: req.requesterEmail,
          createdAt: req.createdAt,
        }));

        res.json({ data: formatted, total });
      } catch (error) {
        res.status(500).json({ message: "Error fetching admin requests" });
      }
    });

    // admin users list with pagination
    app.get("/admin/users", async (req, res) => {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 5;
      const status = req.query.status;

      const filter = {};
      if (status) filter.status = status;

      const total = await usersCollection.countDocuments(filter);

      const users = await usersCollection
        .find(filter)
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray();

      res.json({ users, total });
    });

    // Update User Status
    app.patch("/admin/users/status/:email", async (req, res) => {
      const email = req.params.email;
      const { status } = req.body;

      await usersCollection.updateOne({ email }, { $set: { status } });

      res.json({ success: true });
    });

    // update user role
    app.patch("/admin/users/role/:email", async (req, res) => {
      const email = req.params.email;
      const { role } = req.body;

      await usersCollection.updateOne({ email }, { $set: { role } });

      res.json({ success: true });
    });

    // admin donation statistics chart
    app.get("/admin/donation-stats", async (req, res) => {
      try {
        const now = new Date();

        const startOfToday = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate()
        );

        const startOfWeek = new Date(startOfToday);
        startOfWeek.setDate(startOfToday.getDate() - startOfToday.getDay());

        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        const daily = await requestsCollection.countDocuments({
          createdAt: { $gte: startOfToday },
        });

        const weekly = await requestsCollection.countDocuments({
          createdAt: { $gte: startOfWeek },
        });

        const monthly = await requestsCollection.countDocuments({
          createdAt: { $gte: startOfMonth },
        });

        res.json({ daily, weekly, monthly });
      } catch (error) {
        console.error("Error fetching donation stats:", error);
        res.status(500).json({ message: "Error fetching stats" });
      }
    });

    // Stripe payment route

    // create stripe checkout session
    app.post("/create-checkout-session", async (req, res) => {
      try {
        const { amount, email, name } = req.body;

        if (!amount || !email || !name) {
          return res.status(400).send({ message: "Missing required fields" });
        }

        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          line_items: [
            {
              price_data: {
                currency: "USD",
                unit_amount: parseInt(amount) * 100,
                product_data: {
                  name: "Organization Funding",
                },
              },
              quantity: 1,
            },
          ],
          customer_email: email,
          mode: "payment",
          success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?amount=${amount}&name=${name}&email=${email}&session_id={CHECKOUT_SESSION_ID}`,

          cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancelled`,
        });

        res.send({ url: session.url, sessionId: session.id });
      } catch (err) {
        console.error("Stripe Error:", err);
        res.status(500).send({ message: "Stripe session failed" });
      }
    });

    // save funding record
    app.post("/fundings", async (req, res) => {
      try {
        const { amount, name, email, sessionId } = req.body;

        if (!amount || !name || !email || !sessionId) {
          return res.status(400).send({ message: "Missing required fields" });
        }

        const existing = await fundsCollection.findOne({ sessionId });
        if (existing) {
          return res.send({ success: true, message: "Already saved" });
        }

        const result = await fundsCollection.insertOne({
          amount: parseInt(amount),
          name,
          email,
          sessionId,
          date: new Date(),
        });

        res.send({ success: true, fundingId: result.insertedId });
      } catch (err) {
        console.error("Save Funding Error:", err);
        res.status(500).send({ message: "Failed to save funding" });
      }
    });

    // get all funding records
    app.get("/fundings", async (req, res) => {
      try {
        const fundings = await fundsCollection.find().toArray();
        res.send(fundings);
      } catch (err) {
        console.error("Fetch Fundings Error:", err);
        res.status(500).send({ message: "Failed to fetch fundings" });
      }
    });

    // get total funding amount
    app.get("/fundings/total", async (req, res) => {
      try {
        const funds = await fundsCollection.find().toArray();
        const total = funds.reduce((sum, f) => sum + f.amount, 0);
        res.send({ total });
      } catch (err) {
        console.error("Total Funding Error:", err);
        res.status(500).send({ message: "Failed to calculate total" });
      }
    });

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } catch (error) {
    console.error(error);
  }
}

run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Welcome to the Blood Connect API!");
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
