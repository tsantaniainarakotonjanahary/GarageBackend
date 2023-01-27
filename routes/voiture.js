var express = require('express');
var router = express.Router();
const MongoClient = require('mongodb').MongoClient;
const ObjectId = require("mongodb").ObjectId;
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const fs = require("fs");
const nodemailer = require('nodemailer');
var auth = require("../routes/users");

router.get('/', auth , function(req, res, next) { res.send('VOITURE'); });

router.post('/depot', auth, async (req, res) => {

    const numero = req.body.numero;
    const marque = req.body.marque;
    const dateDepot = new Date();

    const evenement = {
        type: "depot",
        date: dateDepot
    };

    const client = new MongoClient('mongodb+srv://tsanta:ETU001146@cluster0.6oftdrm.mongodb.net/?retryWrites=true&w=majority', { useUnifiedTopology: true });
    await client.connect();
    const db = client.db("Garage");

    const carExists = await db.collection("voiture").findOne({ numero: numero });
    if (carExists) {
        return res.status(400).json({ message: "Cette voiture existe déjà" });
    }

    const newCar = {
        marque: marque,
        numero: numero,
        evenement: [evenement]
    };

    await db.collection("voiture").insertOne(newCar);

    res.status(201).json({ voiture: newCar, message: "Voiture déposée avec succès" });

    client.close();
});


router.put('/reception', auth , async (req, res) => {

    const numero = req.body.numero;
    const dateReception = new Date();
    const evenement = {
        type: "reception",
        date: dateReception
    };

    const client = new MongoClient('mongodb+srv://tsanta:ETU001146@cluster0.6oftdrm.mongodb.net/?retryWrites=true&w=majority', { useUnifiedTopology: true });
    await client.connect();
    const db = client.db("Garage");

    const carExists = await db.collection("voiture").findOne({ numero: numero });
    if (!carExists) {
        return res.status(404).json({ message: "Cette voiture n'existe pas" });
    }

    await db.collection("voiture").updateOne({ numero: numero }, { $push: { evenement: evenement } });

    res.status(200).json({ message: "Voiture receptionée avec succès" });

    client.close();
});

router.get('/non-receptionees', auth, async (req, res) => {
    const client = new MongoClient('mongodb+srv://tsanta:ETU001146@cluster0.6oftdrm.mongodb.net/?retryWrites=true&w=majority', { useUnifiedTopology: true });
    await client.connect();
    const collection = client.db("Garage").collection("voiture");
    const result = await collection.aggregate([
        {
            $addFields: {
                mostRecentEvent: { $arrayElemAt: [ "$evenement", -1 ] }
            }
        },
        {
            $lookup: {
                from: "voiture",
                localField: "mostRecentEvent.date",
                foreignField: "evenement.date",
                as: "voiture_join"
            }
        },
        {
            $project: {
                "voiture_join.marque": 1,
                "voiture_join.numero": 1,
                "mostRecentEvent.type": 1,
                "mostRecentEvent.date": 1
            }
        },
        {
            $match: {
                "mostRecentEvent.type": "depot"
            }
        }
      ]).toArray();
    client.close();
    res.send(result);
});

module.exports = router;