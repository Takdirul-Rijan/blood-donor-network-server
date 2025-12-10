const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
require("dotenv").config();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());

// MongoDB connection URL using credentials from environment variables
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.qcldgif.mongodb.net/?appName=Cluster0`;

// Create MongoDB client with server API configuration
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// Main function to run database operations
async function run() {
  try {
    await client.connect();

    const db = client.db("blood_connect_db");
    const usersCollection = db.collection("users");
    const requestsCollection = db.collection("requests");
    const fundsCollection = db.collection("funds");

    // User registration route
    app.post("/users/register", async (req, res) => {
      console.log("Register request body:", req.body);

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

    // Get user data by email
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

    // Get user role by email
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

    // Update user data
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

    // Admin Dashboard statistics
    app.get("/admin/dashboard-stats", async (req, res) => {
      try {
        const totalUsers = await usersCollection.countDocuments({});
        const totalRequests = await requestsCollection.countDocuments({});
        const totalFunds = await fundsCollection
          .aggregate([{ $group: { _id: null, total: { $sum: "$amount" } } }])
          .toArray();

        res.json({
          totalUsers,
          totalRequests,
          totalFunds: totalFunds[0]?.total || 0,
        });
      } catch (error) {
        console.error("Error fetching admin stats:", error);
        res.status(500).json({ message: "Error fetching admin statistics" });
      }
    });

    // Create a blood request
    app.post("/requests", async (req, res) => {
      const requestData = req.body;

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

    // Get 3 most recent requests for a donor
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

        const formatted = donorRequests.map((req) => ({
          _id: req._id,
          recipientName: req.patientName || "Not Provided",
          recipientLocation:
            `${req.district || ""}, ${req.upazila || ""}`.replace(/, $/, "") ||
            "Not Provided",
          donationDate: req.neededDate || "Not Provided",
          donationTime: req.neededTime || "Not Provided",
          bloodGroup: req.bloodGroup || "Not Provided",
          donationStatus: req.status || "pending",
          donorName: req.requesterName,
          donorEmail: req.requesterEmail,
          createdAt: req.createdAt,
        }));

        res.json(formatted);
      } catch (error) {
        res.status(500).json({ message: "Error fetching recent requests" });
      }
    });

    // Get all requests with pagination and optional status filter
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

        const formatted = donorRequests.map((req) => ({
          _id: req._id,
          recipientName: req.patientName || "Not Provided",
          recipientLocation:
            `${req.district || ""}, ${req.upazila || ""}`.replace(/, $/, "") ||
            "Not Provided",
          donationDate: req.neededDate || "Not Provided",
          donationTime: req.neededTime || "Not Provided",
          bloodGroup: req.bloodGroup || "Not Provided",
          donationStatus: req.status || "pending",
          donorName: req.requesterName,
          donorEmail: req.requesterEmail,
          createdAt: req.createdAt,
        }));

        res.json({ data: formatted, total });
      } catch (error) {
        console.error("Error in /requests/all:", error);
        res.status(500).json({ message: "Error fetching requests" });
      }
    });

    // Get a single request by ID
    app.get("/requests/:id", async (req, res) => {
      const id = req.params.id;
      const request = await requestsCollection.findOne({
        _id: new ObjectId(id),
      });

      res.json(request);
    });

    // Update a request by ID (full update)
    app.put("/requests/:id", async (req, res) => {
      const id = req.params.id;
      const body = req.body;

      const updated = await requestsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: body }
      );

      res.json(updated);
    });

    // Update only request status
    app.patch("/requests/status/:id", async (req, res) => {
      const id = req.params.id;
      const { status } = req.body;

      await requestsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status } }
      );

      res.json({ message: "Status updated" });
    });

    // Delete a request by ID
    app.delete("/requests/:id", async (req, res) => {
      const id = req.params.id;

      const result = await requestsCollection.deleteOne({
        _id: new ObjectId(id),
      });

      res.json(result);
    });

    // all users management

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

    app.patch("/admin/users/status/:email", async (req, res) => {
      const email = req.params.email;
      const { status } = req.body;

      await usersCollection.updateOne({ email }, { $set: { status } });

      res.json({ success: true });
    });

    app.patch("/admin/users/role/:email", async (req, res) => {
      const email = req.params.email;
      const { role } = req.body;

      await usersCollection.updateOne({ email }, { $set: { role } });

      res.json({ success: true });
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

// Root route
app.get("/", (req, res) => {
  res.send("Welcome to the Blood Connect API!");
});

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
