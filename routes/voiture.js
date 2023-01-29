var express = require('express');
var router = express.Router();
const MongoClient = require('mongodb').MongoClient;
const ObjectId = require("mongodb").ObjectId;
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const fs = require("fs");
const nodemailer = require('nodemailer');



function auth(req, res, next) 
{
    const token = req.header('x-auth-token');
    if (!token) 
    {
        return res.status(401).json({ message: 'Aucun token, autorisation refusée' });
    }

    try 
    {
        const decoded = jwt.verify(token, "Tsanta");
        console.log(decoded);
        req.user = decoded;
        next();
    } 
    catch (err) 
    {
        res.status(400).json({ message: 'Token non valide' });
    }
}



router.post('/depot', auth, async (req, res) => {

    const numero = req.body.numero;
    const marque = req.body.marque;
    const idclient = req.body.idclient;
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
        idclient: idclient,
        evenement: [evenement]
    };

    await db.collection("voiture").insertOne(newCar);

    res.status(201).json({ voiture: newCar, message: "Voiture déposée avec succès" });

    client.close();
});


router.put('/reception', auth , async (req, res) => {
    const numero = req.body.numero;
    const dateReception = new Date();
    console.log(req.body.reparation);
    const evenement = {
        type: "reception",
        date: dateReception,
        reparation: req.body.reparation
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


router.get('/non-sortie', auth, async (req, res) => {

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
                "mostRecentEvent.date": 1,
                "mostRecentEvent.reparation": 1
            }
        },
        {
            $match: {
                "mostRecentEvent.type": "reception"
            }
        }
      ]).toArray();
    client.close();
    res.send(result);
});


router.put('/commencer-reparation', auth , async (req, res) => {

    const numero = req.body.numero;
    const description = req.body.description;

    const client = new MongoClient('mongodb+srv://tsanta:ETU001146@cluster0.6oftdrm.mongodb.net/?retryWrites=true&w=majority', { useUnifiedTopology: true });
    await client.connect();
    const db = client.db("Garage");

    const carExists = await db.collection("voiture").findOne({ numero: numero });
    if (!carExists) {
        return res.status(404).json({ message: "Cette voiture n'existe pas" });
    }

    const lastEvent = await db.collection("voiture").findOne({ numero: numero }, { $sort: { evenement: -1 }, $limit: 1 });

    if(lastEvent.evenement[0].type !== "depot") {
        return res.status(400).json({ message: "Dernier événement doit être un depot" });
    }

    const dateDebut = new Date();
    const update = await db.collection("voiture").updateOne({
        numero: numero,
        "evenement.reparation.description": description
      }, {
        $set: {
          "evenement.$[outer].reparation.$[inner].debut_reparation": new Date()
        }
      }, {
        arrayFilters: [
          { "outer.reparation.description": description },
          { "inner.description": description }
        ]
      });

    res.status(200).json({ message: "La reparation commencé" });

    client.close();
});



router.put('/finir-reparation', auth , async (req, res) => {

    const numero = req.body.numero;
    const description = req.body.description;

    const client = new MongoClient('mongodb+srv://tsanta:ETU001146@cluster0.6oftdrm.mongodb.net/?retryWrites=true&w=majority', { useUnifiedTopology: true });
    await client.connect();
    const db = client.db("Garage");

    const carExists = await db.collection("voiture").findOne({ numero: numero });
    if (!carExists) {
        return res.status(404).json({ message: "Cette voiture n'existe pas" });
    }

    const lastEvent = await db.collection("voiture").findOne({ numero: numero }, { $sort: { evenement: -1 }, $limit: 1 });

    if(lastEvent.evenement[0].type !== "depot") {
        return res.status(400).json({ message: "Dernier événement doit être un depot" });
    }

    const dateDebut = new Date();
    const update = await db.collection("voiture").updateOne({
        numero: numero,
        "evenement.reparation.description": description
      }, {
        $set: {
          "evenement.$[outer].reparation.$[inner].fin_reparation": new Date()
        }
      }, {
        arrayFilters: [
          { "outer.reparation.description": description },
          { "inner.description": description }
        ]
      });

    res.status(200).json({ message: "La reparation commencé" });

    client.close();
});


router.put('/payer-reparation', auth , async (req, res) => {

    const numero = req.body.numero;
    const description = req.body.description;

    const client = new MongoClient('mongodb+srv://tsanta:ETU001146@cluster0.6oftdrm.mongodb.net/?retryWrites=true&w=majority', { useUnifiedTopology: true });
    await client.connect();
    const db = client.db("Garage");

    const carExists = await db.collection("voiture").findOne({ numero: numero });
    if (!carExists) {
        return res.status(404).json({ message: "Cette voiture n'existe pas" });
    }

    const lastEvent = await db.collection("voiture").findOne({ numero: numero }, { $sort: { evenement: -1 }, $limit: 1 });

    if(lastEvent.evenement[0].type !== "depot") {
        return res.status(400).json({ message: "Dernier événement doit être un depot" });
    }

    const dateDebut = new Date();
    const update = await db.collection("voiture").updateOne({
        numero: numero,
        "evenement.reparation.description": description
      }, {
        $set: {
          "evenement.$[outer].reparation.$[inner].etat": "paye"
        }
      }, {
        arrayFilters: [
          { "outer.reparation.description": description },
          { "inner.description": description }
        ]
      });

    res.status(200).json({ message: "La reparation commencé" });

    client.close();
});


router.put('/validation-sortie', auth , async (req, res) => {
    const numero = req.body.numero;
    const date = new Date();
    const options = { timeZone: "Indian/Antananarivo" };
    const formattedDate = date.toLocaleString("fr-FR", options);
    const dateValidation = new Date(formattedDate);
    const evenement = {
        type: "validation sortie",
        date: dateValidation,
        reparation: req.body.reparation
    };

    const client = new MongoClient('mongodb+srv://tsanta:ETU001146@cluster0.6oftdrm.mongodb.net/?retryWrites=true&w=majority', { useUnifiedTopology: true });
    await client.connect();
    const db = client.db("Garage");

    const carExists = await db.collection("voiture").findOne({ numero: numero });
    if (!carExists) {
        return res.status(404).json({ message: "Cette voiture n'existe pas" });
    }
    
    const lastEvent = await db.collection("voiture").findOne({ numero: numero }, { $sort: { evenement: -1 }, $limit: 1 });

    await db.collection("voiture").updateOne({ numero: numero }, { $push: { evenement: evenement } });

    res.status(200).json({ message: "Bon de sortie validé" });

    client.close();
});

router.get('/', auth , function(req, res, next) { res.send('VOITURE'); });

module.exports = router;