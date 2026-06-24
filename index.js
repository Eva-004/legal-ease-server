const express = require("express");
const dontenv = require("dotenv");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
dontenv.config();

const uri = process.env.MONGODB_URI;
const { createRemoteJWKSet, jwtVerify } = require('jose-cjs');

const app = express();
const PORT = process.env.PORT;

app.use(express.json());
app.use(cors());

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const JWKS = createRemoteJWKSet(
  new URL(`${process.env.CLIENT_URL}/api/auth/jwks`)
)

const verifyToken = async (req, res, next) => {
  const authHeader = req?.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ message: 'unauthorized' })
  }
  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ message: 'unauthorized' })
  }

  try {
    const { payload } = await jwtVerify(token, JWKS)
    console.log(payload)
    next();
  } catch (error) {
    res.status(403).json({ message: 'forbidden' })
  }
}

async function run() {
  try {
    await client.connect();
    const db = client.db("legal-ease");
    const userCollection = db.collection("user");
    const hiringCollection = db.collection("hiring")


    app.patch("/api/user/update-profile", verifyToken, async (req, res) => {

      const { email, name, image } = req.body;
      console.log(email)
      const result = await userCollection.updateOne(
        { email },
        {
          $set: { name, image },
        }
      );

      res.json(result)
    });

    app.get('/lawyers', async (req, res) => {

      const search = req.query.search || '';
      const specialization = req.query.specialization || '';
      const status = req.query.status || "";
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 8;

      const query = {
        role: "lawyer"
      };

      if (search) {

        query.name = {
          $regex: search,
          $options: "i"
        }

      }
      if (specialization) {
        query.specialization = specialization
      }


      if (status) {
        query.status = status;
      }
      const totalLawyers = await userCollection.countDocuments(query);
      const lawyers = await userCollection.find(query).skip((page - 1) * limit).limit(limit).toArray();

      res.json({
        lawyers,
        totalLawyers,
        currentPage: page,
        totalPages: Math.ceil(totalLawyers / limit)
      });
    });

    app.get('/lawyers/:id', async (req, res) => {
      const { id } = req.params;
      const result = await userCollection.findOne({ _id: new ObjectId(id) });
      res.json(result)
    });

    app.get("/featured-lawyers", async (req, res) => {

      const lawyers = await userCollection
        .aggregate([
          {
            $match: {
              role: "lawyer",
            },
          },
          {
            $sample: {
              size: 6,
            },
          },
        ])
        .toArray();

      res.send(lawyers);
    });

    app.post("/hire-lawyer", verifyToken, async (req, res) => {
      const hireData = req.body;

      const result = await hiringCollection.insertOne({
        ...hireData,
        status: "pending",
        paymentStatus: "unpaid",
        createdAt: new Date(),
      });

      res.json(result);
    });

    app.get("/hire-lawyer", verifyToken, async (req, res) => {
      const result = await hiringCollection.find().toArray();
      res.json(result);
    });

    app.get("/lawyer/:email", async (req, res) => {
      const email = req.params.email;

      const lawyer = await userCollection.findOne({
        email,
        role: "lawyer",
      });

      res.json(lawyer);
    });

    app.patch("/lawyer/profile/:email", async (req, res) => {
      const email = req.params.email;

      const {
        specialization,
        consultationFee,
        status,
        bio,
      } = req.body;

      const result = await userCollection.updateOne(
        { email },
        {
          $set: {
            specialization,
            consultationFee,
            status,
            bio,
          },
        }
      );

      res.json(result);
    });

    app.post("/lawyer/services/:email", verifyToken, async (req, res) => {
      const { email } = req.params;
      const { service } = req.body;

      const result = await userCollection.updateOne(
        { email, role: "lawyer" },
        {
          $push: {
            services: {
              id: new ObjectId().toString(),
              title: service,
              createdAt: new Date(),
            },
          },
        }
      );

      res.json(result);
    });

    app.patch(
      "/lawyer/services/:email/:serviceId",
      verifyToken,
      async (req, res) => {
        const { email, serviceId } = req.params;
        const { title } = req.body;

        const result = await userCollection.updateOne(
          {
            email,
            role: "lawyer",
            "services.id": serviceId,
          },
          {
            $set: {
              "services.$.title": title,
            },
          }
        );

        res.json(result);
      }
    );

    app.delete(
      "/lawyer/services/:email/:serviceId",
      verifyToken,
      async (req, res) => {
        const { email, serviceId } = req.params;

        const result = await userCollection.updateOne(
          {
            email,
            role: "lawyer",
          },
          {
            $pull: {
              services: {
                id: serviceId,
              },
            },
          }
        );

        res.json(result);
      }
    );

    app.get("/lawyer/services/:email", async (req, res) => {
      const { email } = req.params;

      const lawyer = await userCollection.findOne(
        { email, role: "lawyer" },
        {
          projection: {
            services: 1,
          },
        }
      );

      res.json(lawyer?.services || []);
    });

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Server is running fine!");
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
