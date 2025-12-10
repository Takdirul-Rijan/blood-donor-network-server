const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
require("dotenv").config();
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

    // GET SINGLE REQUEST
    app.get("/requests/:id", async (req, res) => {
      const id = req.params.id;
      const request = await requestsCollection.findOne({
        _id: new ObjectId(id),
      });
      res.json(request);
    });

    // UPDATE REQUEST
    app.put("/requests/:id", async (req, res) => {
      const id = req.params.id;
      const body = req.body;

      const updated = await requestsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: body }
      );

      res.json(updated);
    });

    app.patch("/requests/status/:id", async (req, res) => {
      const id = req.params.id;
      const { status } = req.body;

      await requestsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status } }
      );

      res.json({ message: "Status updated" });
    });

    app.delete("/requests/:id", async (req, res) => {
      const id = req.params.id;

      const result = await requestsCollection.deleteOne({
        _id: new ObjectId(id),
      });

      res.json(result);
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
