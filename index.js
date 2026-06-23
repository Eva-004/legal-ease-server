const express = require("express");
const dontenv = require("dotenv");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
dontenv.config();

const uri = process.env.MONGODB_URI;

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

async function run() {
  try {
    await client.connect();
    const db = client.db("legal-ease");
    const userCollection = db.collection("user");


    app.patch("/api/user/update-profile", async (req, res) => {

      const { email, name, image } = req.body;

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
