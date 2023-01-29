var express = require('express');
var router = express.Router();
const MongoClient = require('mongodb').MongoClient;
const ObjectId = require("mongodb").ObjectId;
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const fs = require("fs");
const nodemailer = require('nodemailer');
const moment = require('moment-timezone');
const { DateTime } = require('luxon');
const { setTimeZone } = require('date-fns');

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
    dateDepot.setHours(dateDepot.getHours() + 3);
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
    dateReception.setHours(dateReception.getHours() + 3);
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
    dateDebut.setHours(dateDebut.getHours() + 3);
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

    const dateFin = new Date();
    dateFin.setHours(dateFin.getHours() + 3);
    
    const update = await db.collection("voiture").updateOne({
        numero: numero,
        "evenement.reparation.description": description
      }, {
        $set: {
          "evenement.$[outer].reparation.$[inner].fin_reparation": dateFin
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

    const currentDate = new Date();
    console.log(currentDate);
    currentDate.setHours(currentDate.getHours() + 3);   
    console.log(currentDate);

    const update = await db.collection("voiture").updateOne({
        numero: numero,
        "evenement.reparation.description": description
      }, {
        $set: {
          "evenement.$[outer].reparation.$[inner].etat": "paye",
          "evenement.$[outer].reparation.$[inner].payement":  currentDate 
        }
      }, {
        arrayFilters: [
          { "outer.reparation.description": description },
          { "inner.description": description }
        ]
      });

    res.status(200).json({ message: "La reparation payé" });

    client.close();
});


router.put('/validation-sortie', auth , async (req, res) => {
    const numero = req.body.numero;
    const dateValidation = new Date();
    dateValidation.setHours(dateValidation.getHours() + 3);  
    const evenement = {
        type: "validation sortie",
        date: dateValidation,
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



router.get('/voiture-present', auth, async (req, res) => {

    const idclient = req.body.idclient;
    console.log(idclient);
    const client = new MongoClient('mongodb+srv://tsanta:ETU001146@cluster0.6oftdrm.mongodb.net/?retryWrites=true&w=majority', { useUnifiedTopology: true });
    await client.connect();
    const collection = client.db("Garage").collection("voiture");
    const result = await collection.aggregate([
        {
            $match: {
                "idclient": idclient
            }
        },
        {
            $unwind: "$evenement"
        },
        {
            $sort: {
                "_id": 1,
                "evenement.date": -1
            }
        },
        {
            $group: {
                _id: "$_id",
                marque: { $first: "$marque" },
                numero: { $first: "$numero" },
                idclient: { $first: "$idclient" },
                evenement: { $first: "$evenement" }
            }
        },
        {
            $match: {
                "evenement.type": { "$ne": "validation sortie" }
            }
        }
    ]).toArray();
    client.close();
    res.send(result);
});

router.get('/', auth , function(req, res, next) { res.send('VOITURE'); });

module.exports = router;