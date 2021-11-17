const express = require("express");
const { MongoClient } = require("mongodb");
const cors = require("cors");
const app = express();
require("dotenv").config();
const fileUpload = require("express-fileupload");
const admin = require("firebase-admin");
const ObjectId = require("mongodb").ObjectId;
const stripe = require("stripe")(process.env.STRIPE_SECRET);

const port = process.env.PORT || 8080;
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
// token middleware
admin.initializeApp({
   credential: admin.credential.cert(serviceAccount),
});

// middleware
app.use(cors());
app.use(express.json());
app.use(fileUpload());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.nebgy.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
// console.log(uri);
const client = new MongoClient(uri, {
   useNewUrlParser: true,
   useUnifiedTopology: true,
});

async function verifyToken(req, res, next) {
   if (req.headers?.authorization?.startsWith("Bearer ")) {
      const token = req.headers.authorization.split(" ")[1];
      try {
         const decodedUser = await admin.auth().verifyIdToken(token);
         req.decodedEmail = decodedUser.email;
      } catch {}
   }

   next();
}

async function run() {
   try {
      await client.connect();
      console.log("connected to db");
      const database = client.db("doctors_portal");
      const appointmentCollection = database.collection("appointments");
      const userCollection = database.collection("users");
      const doctorCollection = database.collection("doctors");

      app.get("/appointments", verifyToken, async (req, res) => {
         const email = req.query.email;
         const date = req.query.date;
         // console.log(date);
         const query = { email: email, date: date };
         // console.log(query);
         const cursor = appointmentCollection.find(query);
         const appointments = await cursor.toArray();
         res.json(appointments);
      });

      app.get("/appointments/:id", async (req, res) => {
         const id = req.params.id;
         const query = { _id: ObjectId(id) };
         const result = await appointmentCollection.findOne(query);
         res.send(result);
      });

      // appointments post api
      app.post("/appointments", async (req, res) => {
         const newAppointment = req.body;
         const result = await appointmentCollection.insertOne(newAppointment);
         res.json(result);
      });

      app.put("/appointments/:id", async (req, res) => {
         const id = req.params.id;
         const payment = req.body;
         const filter = { _id: ObjectId(id) };
         const updateDoc = { $set: { payment: payment } };
         const result = await appointmentCollection.updateOne(
            filter,
            updateDoc
         );
         res.json(result);
      });

      app.get("/doctors", async (req, res) => {
         const cursor = doctorCollection.find({});
         const doctors = await cursor.toArray();
         res.send(doctors);
      });

      // POST doctors
      app.post("/doctors", async (req, res) => {
         // console.log("body", req.body);
         const name = req.body.name;
         const email = req.body.email;
         const pic = req.files.image;
         const picData = pic.data;
         const encodedPic = picData.toString("base64");
         const imageBuffer = Buffer.from(encodedPic, "base64");
         const doctor = {
            name,
            email,
            image: imageBuffer,
         };
         const result = await doctorCollection.insertOne(doctor);
         console.log("files", result);
         res.json(result);
      });

      app.get("/users/:email", async (req, res) => {
         const email = req.params.email;
         const query = { email: email };
         const user = await userCollection.findOne(query);
         let isAdmin = false;
         if (user?.role === "admin") {
            isAdmin = true;
         }
         res.json({ admin: isAdmin });
      });

      app.post("/users", async (req, res) => {
         const newUser = req.body;
         const result = await userCollection.insertOne(newUser);
         res.json(result);
         console.log(result);
      });

      app.put("/users", async (req, res) => {
         const user = req.body;
         const filter = { email: user.email };
         const options = { upsert: true };
         const updateDoc = { $set: user };
         const result = await userCollection.updateOne(
            filter,
            updateDoc,
            options
         );
         res.json(result);
      });

      // token
      app.put("/users/admin", verifyToken, async (req, res) => {
         const user = req.body;
         // console.log("decodedEmail", req.decodedEmail);
         const requester = req.decodedEmail;
         if (requester) {
            const requesterAccount = await userCollection.findOne({
               email: requester,
            });
            if (requesterAccount.role === "admin") {
               const filter = { email: user.email };
               const updateDoc = { $set: { role: "admin" } };
               const result = await userCollection.updateOne(filter, updateDoc);
               res.json(result);
            }
         } else {
            res.status(403).json({
               message: "you do not have access to make admin",
            });
         }
      });

      app.post("/create-payment-intent", async (req, res) => {
         const paymentInfo = req.body;
         const amount = paymentInfo.price * 100;
         const paymentIntent = await stripe.paymentIntents.create({
            currency: "usd",
            amount: amount,
            payment_method_types: ["card"],
         });
         res.json({ clientSecret: paymentIntent.client_secret });
      });
   } finally {
      // await client.close();
   }
}
run().catch(console.dir);

app.get("/", (req, res) => {
   res.send("doctors portal running");
});
app.listen(port, () => {
   console.log("doctors portal running on", port);
});
