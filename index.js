const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require("mongodb");
const app = express();
require("dotenv").config();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(cors());

// MongoDB URI
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.qcldgif.mongodb.net/?appName=Cluster0`;

// MongoClient instance
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect to MongoDB
    await client.connect();
    const db = client.db("blood_connect_db");
    const usersCollection = db.collection("users");
    const requestsCollection = db.collection("requests");

    // Register a new user
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

    // Get user profile by email
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

    // get user role
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

    // Update user profile by email
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

    // create a blood request
    app.post("/requests", async (req, res) => {
      const requestData = req.body;
      // console.log("headers", req.headers);

      const result = await requestsCollection.insertOne(requestData);
      res.send(result);
    });

    // Get requests by donor
    app.get("/requests", async (req, res) => {
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
          .toArray();

        res.json(donorRequests);
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error fetching requests" });
      }
    });

    // Send a ping to confirm the connection
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
