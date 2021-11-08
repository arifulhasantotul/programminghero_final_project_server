const express = require("express");
const { MongoClient } = require("mongodb");
const cors = require("cors");
const app = express();
require("dotenv").config();
const admin = require("firebase-admin");
const port = process.env.PORT || 8080;

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
// token middleware
admin.initializeApp({
   credential: admin.credential.cert(serviceAccount),
});

// middleware
app.use(cors());
app.use(express.json());

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

      // appointments post api
      app.post("/appointments", async (req, res) => {
         const newAppointment = req.body;
         const result = await appointmentCollection.insertOne(newAppointment);
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
