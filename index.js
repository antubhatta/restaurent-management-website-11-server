const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const app = express();
const port = process.env.PORT || 5000;

// middleware
app.use(
  cors({
    origin: ["http://localhost:5173"],
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

const verify = (req, res, next) => {
  const token = req?.cookies?.token;
  console.log("token in the middleware", token);
  // no token available
  if (!token) {
    return res.status(401).send({ message: "unauthorized access" });
  }
  jwt.verify(token, process.env.TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "unauthorized access" });
    }
    req.user = decoded;
    next();
  });
};

// const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.xgdhjcn.mongodb.net/?retryWrites=true&w=majority`;
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.xgdhjcn.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection

    // Authentication
    // auth related api
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.TOKEN_SECRET, {
        expiresIn: "1h",
      });

      res
        .cookie("token", token, {
          httpOnly: true,
          secure: true,
          sameSite: "none",
        })
        .send({ success: true });
    });

    app.post("/logout", async (req, res) => {
      const user = req.body;
      console.log("logging out", user);
      res.clearCookie("token", { maxAge: 0 }).send({ success: true });
    });

    const foodsCollection = client
      .db("restaurentManagement")
      .collection("foods");

    app.get("/foods", async (req, res) => {
      const page = parseInt(req.query.page) || 1;
      const size = parseInt(req.query.size) || 10;

      const result = await foodsCollection
        .find()
        .skip((page - 1) * size)
        .limit(size)
        .toArray();

      res.send(result);
    });

    app.get("/foods/user/:email", async (req, res) => {
      const email = req.params.email;
      const query = { buyer_email: email };

      const result = await foodsCollection.find(query).toArray();
      res.send(result);
    });

    app.get("/count/foods", async (req, res) => {
      const result = await foodsCollection.countDocuments({});
      res.status(200).send({ count: result });
    });

    app.get("/foods/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };

      const result = await foodsCollection.findOne(query, {});

      res.send(result);
    });

    app.get("/top/foods", async (req, res) => {
      const result = await foodsCollection
        .find()
        .sort({ orderCount: -1 })
        .limit(6)
        .toArray();
      res.send(result);
    });

    app.post("/foods", verify, async (req, res) => {
      const newFood = req.body;
      const result = await foodsCollection.insertOne(newFood);
      res.send(result);
    });

    app.patch("/foods/:id", verify, async (req, res) => {
      const id = req.params.id;

      const filter = { _id: new ObjectId(id) };
      delete req.body._id;
      const updatedFood = {
        $set: req.body,
      };
      const options = { upsert: false };

      const result = await foodsCollection.updateOne(
        filter,
        updatedFood,
        options
      );
      res.send(result);
    });

    app.delete("/foods/:id", verify, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await foodsCollection.deleteOne(query);
      res.send(result);
    });

    // Order collection
    const ordersCollection = client
      .db("restaurentManagement")
      .collection("orders");

    app.get("/orders", verify, async (req, res) => {
      if (req.user.email !== req.query.email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      let query = {};
      if (req.query?.email) {
        query = { email: req.query.email };
      }

      console.log(req.query.email, req.query);

      const email = req.query.email;
      query = { buyerEmail: email };

      const result = await ordersCollection.find(query).toArray();
      res.send(result);
    });

    app.post("/orders", verify, async (req, res) => {
      const newOrder = req.body;

      // extract quantity from order
      const quantity = parseInt(newOrder.quantity);
      const foodId = newOrder.foodId;

      const filter = { _id: new ObjectId(foodId) };

      // get the food
      const food = await foodsCollection.findOne(filter, {});

      // check if buyer is not seller
      if (food.sellerEmail === newOrder.buyerEmail)
        return res.send({ message: "You cannot buy your own food" });

      // check if food quantity is enough
      if (food.quantity < quantity)
        return res.send({ message: "Not enough food" });

      // update food quantity
      const updatedFood = {
        $inc: { quantity: -quantity, orderCount: food.orderCount + 1 },
      };
      const options = { upsert: false };
      await foodsCollection.updateOne(filter, updatedFood, options);

      const result = await ordersCollection.insertOne(newOrder);
      res.send(result);
    });

    app.delete("/orders/:id", verify, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };

      const result = await ordersCollection.deleteOne(query);
      res.status(204).send(result);
    });
  

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Restaurent website is running");
});

app.listen(port, () => {
  console.log(
    `Restaurent management website server is running on port: ${port}`
  );
});
