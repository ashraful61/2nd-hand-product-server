const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const port = process.env.PORT || 5000;

const app = express();

// middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@clustertestashraf.z94m9ys.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send("unauthorized access");
  }

  const token = authHeader.split(" ")[1];

  jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: "forbidden access" });
    }
    req.decoded = decoded;
    next();
  });
}

async function run() {
  try {
    const database = client.db("useProductsDb");
    const productCategoriesCollection =
      database.collection("productCategories");
    const bookingsCollection = database.collection("bookings");
    const usersCollection = database.collection("users");
    const productsCollection = database.collection("products");
    const paymentsCollection = database.collection("payments");

    // NOTE: make sure you use verifyAdmin after verifyJWT
    const verifyAdmin = async (req, res, next) => {
      const decodedEmail = req.decoded.email;
      const query = { email: decodedEmail };
      const user = await usersCollection.findOne(query);

      if (user?.role !== "admin") {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    app.post("/products", async (req, res) => {
      //verifyJWT, verifyAdmin
      const product = req.body;
      product.sellStatus = "available";
      product.isAdvertised = false;
      const result = await productsCollection.insertOne(product);
      res.send(result);
    });

    app.delete("/products/:id", async (req, res) => {
      //verifyJWT, verifyAdmin,
      const id = req.params.id;
      const filter = { _id: ObjectId(id) };
      const result = await productsCollection.deleteOne(filter);
      res.send(result);
    });

    app.get("/products", async (req, res) => {
      //verifyJWT, verifyAdmin
      const query = {};
      const products = await productsCollection.find(query).toArray();
      res.send(products);
    });

    app.get("/products/advertise/:email", async (req, res) => {
      //verifyJWT, verifyAdmin
      const email = req.params.email;

      const query = {
        email: email,
        isAdvertised: true,
        sellStatus: "available",
      };

      const products = await productsCollection.find(query).toArray();
      res.send(products);
    });

    //Get products by category id
    app.get("/products/:name", async (req, res) => {
      //verifyJWT, verifyAdmin
      const name = req.params.name;
      const query = {
        product_category: name,
      };
      const products = await productsCollection.find(query).toArray();
      res.send(products);
    });

    app.patch("/products/advertise/:id", async (req, res) => {
      //verifyJWT, verifyAdmin
      const id = req.params.id;
      const query = { _id: ObjectId(id) };

      const updatedDoc = {
        $set: {
          isAdvertised: true,
        },
      };
      const result = await productsCollection.updateOne(query, updatedDoc);

      res.send(result);
    });

    app.get("/bookings", verifyJWT, async (req, res) => {
      const email = req.query.email;
      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res.status(403).send({ message: "forbidden access" });
      }

      const query = { email: email };
      const bookings = await bookingsCollection.find(query).toArray();
      res.send(bookings);
    });

    app.get("/bookings/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const booking = await bookingsCollection.findOne(query);
      res.send(booking);
    });

    app.post("/bookings", async (req, res) => {
      const booking = req.body;

      const query = {
        email: booking.email,
        name: booking.name,
      };

      const alreadyBooked = await bookingsCollection.find(query).toArray();

      if (alreadyBooked.length) {
        const message = `You already have a booking on ${booking.name}`;
        return res.send({ acknowledged: false, message });
      }

      const result = await bookingsCollection.insertOne(booking);

      res.send(result);
    });

    app.post("/create-payment-intent", async (req, res) => {
      const booking = req.body;
      const price = booking.price;
      const amount = price * 100;

      const paymentIntent = await stripe.paymentIntents.create({
        currency: "usd",
        amount: amount,
        payment_method_types: ["card"],
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    app.post("/payments", async (req, res) => {
      const payment = req.body;
      const result = await paymentsCollection.insertOne(payment);

      const id = payment.bookingId;
      const filter = { _id: ObjectId(id) };
      const updatedDoc = {
        $set: {
          paid: true,
          transactionId: payment.transactionId,
        },
      };
      const updatedResult = await bookingsCollection.updateOne(
        filter,
        updatedDoc
      );

      const productId = payment.productId;
      const filterProduct = { _id: ObjectId(productId) };
      const updatedProduct = {
        $set: {
          sellStatus: "sold",
        },
      };
      const updatedProductResult = await productsCollection.updateOne(
        filterProduct,
        updatedProduct
      );

      res.send(result);
    });

    //Jwt authentication
    app.get("/jwt", async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      if (user) {
        const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, {
          expiresIn: "10d",
        });
        return res.send({ accessToken: token });
      }
      res.status(403).send({ accessToken: "" });
    });


    //Users API
    //Get All Users
    app.get("/users", async (req, res) => {
      const query = {};
      const users = await usersCollection.find(query).toArray();
      res.send(users);
    });

    //Update user by Id
    app.patch("/users/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const updatedDoc = {
        $set: {
          isVerified: true
        }
      }
      const users = await usersCollection.updateOne(query, updatedDoc);
      res.send(users);
    });

    //Add users
    app.post("/users", async (req, res) => {
      const user = req.body;

      // TODO: make sure you do not enter duplicate user email
      // only insert users if the user doesn't exist in the database
      const singleUser = await usersCollection.findOne({ email: user?.email });

      if (singleUser?.email) {
        const message = `${singleUser?.email} already exists`;

        return res.send({ isUserExist: true, message });
      }

      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    //Get user role by email
    app.get("/users/role/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const user = await usersCollection.findOne(query);
      res.send({ role: user?.role });
    });

    app.delete("/users/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: ObjectId(id) };
      const user = await usersCollection.deleteOne(filter);
      res.send(user);
    });

    //Get product categories api with filter(name field only)
    app.get("/productCategories", async (req, res) => {
      const query = {};
      const result = await productCategoriesCollection
        .find(query)
        .project({ name: 1 })
        .toArray();
      res.send(result);
    });

  } finally {
  }
}
run().catch(console.dir);

app.get("/", async (req, res) => {
  res.send("Used product server is running");
});

app.listen(port, () => console.log(`Used product running on ${port}`));
