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

function getDatesBetween(startDate, endDate) {
    let currentDate = new Date(startDate);
    const end = new Date(endDate);
    const dates = [];
  
    while (currentDate <= end) {
      dates.push(new Date(currentDate));
      currentDate.setDate(currentDate.getDate() + 1);
    }
  
    return dates;
  }
  

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
    const evenement = {
        type: "reception",
        date: dateReception,
        reparation: req.body.reparation 
        //
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

router.put('/recuperer', auth , async (req, res) => {
    const numero = req.body.numero;
    const dateValidation = new Date();
    dateValidation.setHours(dateValidation.getHours() + 3);  
    const evenement = {
        type: "recuperation",
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

    const idclient = req.user.id;
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
                "evenement.type": { "$ne": "recuperation" }
            }
        }
    ]).toArray();
    client.close();
    res.send(result);
});

router.get('/temp-rep-moyenne', auth, async (req, res) => {

    const client = new MongoClient('mongodb+srv://tsanta:ETU001146@cluster0.6oftdrm.mongodb.net/?retryWrites=true&w=majority', { useUnifiedTopology: true });
    await client.connect();
    const collection = client.db("Garage").collection("voiture");
    const result = await collection.aggregate([
        {
          $unwind: "$evenement"
        },
        {
          $match: {
            "evenement.type": "reception",
            "evenement.reparation": {
              $ne: null
            },
            "evenement.reparation.debut_reparation": {
              $ne: null
            },
            "evenement.reparation.fin_reparation": {
              $ne: null
            }
          }
        },
        {
          $unwind: "$evenement.reparation"
        },
        {
            $group: {
                _id: {
                  numero: "$numero",
                  reception_date: "$evenement.date"
                },
                min_debut_reparation: {
                  $min: "$evenement.reparation.debut_reparation"
                },
                max_fin_reparation: {
                    $max: "$evenement.reparation.fin_reparation"
                },
                nombre_reception: {
                    $sum: 1
                },
                descriptions: {
                    $push: "$evenement.reparation.description"
                }
              }
        },
        {
            $project: {
                _id: 0 ,
                numero: "$_id.numero",
                reception_date: "$_id.reception_date",
                min_debut_reparation: 1 ,
                max_fin_reparation:1 ,
                min_debut_reparation_ms: {
                    $toLong: "$min_debut_reparation"
                },
                max_fin_reparation_ms: {
                    $toLong: "$max_fin_reparation"
                },
                difference_ms: {
                    $subtract: [ "$max_fin_reparation_ms", "$min_debut_reparation_ms" ]
                },
                duree_reparation_moyenne_reception_voiture: {
                    $divide: [ "$difference_ms", "$nombre_reception" ]
                },
                descriptions: 1
              }
          }
      ]).toArray();

      
        var nombre_reception = result.length;
        var difference_ms_total = 0;

        for (var i = 0; i < result.length; i++) {
        result[i].difference_ms = result[i].max_fin_reparation_ms - result[i].min_debut_reparation_ms;
        difference_ms_total += result[i].difference_ms;
        }

        for (var i = 0; i < result.length; i++) {
        result[i].duree_reparation_moyenne_reception_voiture = difference_ms_total / nombre_reception;
        }

        let sum = result.reduce((acc, item) => {
            return acc + item.difference_ms;
          }, 0);
         
          result.forEach(function(element) {
            const durationInMs = Math.round(element.duree_reparation_moyenne_reception_voiture);
            const durationInSeconds = durationInMs / 1000;
            const durationInMinutes = durationInSeconds / 60;
            const durationInHours = durationInMinutes / 60;
            const durationInDays = durationInHours / 24;
            const durationInSecondsRounded = Math.floor(durationInSeconds % 60);
            const durationInMinutesRounded = Math.floor(durationInMinutes % 60);
            const durationInHoursRounded = Math.floor(durationInHours % 24);
            const durationInDaysRounded = Math.floor(durationInDays);
            element.duree_reparation_moyenne_reception_voiture_jour = durationInDaysRounded;
            element.duree_reparation_moyenne_reception_voiture_heure = durationInHoursRounded;
            element.duree_reparation_moyenne_reception_voiture_minute = durationInMinutesRounded;
            element.duree_reparation_moyenne_reception_voiture_seconde = durationInSecondsRounded;
            element.duree_reparation_moyenne_reception_voiture_milliseconde = durationInMs;
            element.duree_reparation_moyenne_reception_voiture_date = new Date(element.duree_reparation_moyenne_reception_voiture);
          });

      console.log(result);
    client.close();
    res.send(result);
});

router.get('/ca-per-day', auth, async (req, res) => {
    const idclient = req.user.id;
    console.log(idclient);
    const client = new MongoClient('mongodb+srv://tsanta:ETU001146@cluster0.6oftdrm.mongodb.net/?retryWrites=true&w=majority', { useUnifiedTopology: true });
    await client.connect();
    const collection = client.db("Garage").collection("voiture");

    let start = new Date(req.query.startDate);
    let end = new Date(req.query.endDate);
    let dates = getDatesBetween(start, end);
    console.log(dates);
    if (!dates || !Array.isArray(dates)) {
        return res.status(400).send({ error: "La liste de dates est manquante ou mal formée dans la requête" });
    }

    const pipeline = [
        {
            $match: {
                "evenement.type": "reception",
                "evenement.reparation.payement": {
                    $gte: start,
                    $lte: end
                }
            }
        },
        {
            $unwind: "$evenement",
        },
        {
            $unwind: "$evenement.reparation",
        },
        {
            $match: {
                "evenement.reparation.etat": "paye",
                "evenement.reparation.payement": {
                    $gte: start,
                    $lte: end
                }
            }
        },
        {
            $group: {
                _id: {
                    day: { $dateToString: { format: "%Y-%m-%d", date: "$evenement.reparation.payement" } },
                },
                totalCA: {
                    $sum: {
                        $add: [
                            "$evenement.reparation.frais",
                            {
                                $sum: {
                                    $map: {
                                        input: "$evenement.reparation.achat_piece",
                                        in: {
                                            $multiply: ["$$this.pu", "$$this.quantite"]
                                        }
                                    }
                                }
                            }
                        ]
                    }
                }
            }
        },
        {
            $sort: { "_id.day": 1 }
        }
    ];

    const ca = await collection.aggregate(pipeline).toArray();
    const result = ca.map(entry => ({ date: entry._id.day, ca: entry.totalCA }));
    client.close();
    res.send(result);
});



router.get('/ca-per-month', auth, async (req, res) => {
    const idclient = req.user.id;
    const client = new MongoClient('mongodb+srv://tsanta:ETU001146@cluster0.6oftdrm.mongodb.net/?retryWrites=true&w=majority', { useUnifiedTopology: true });
    await client.connect();
    const collection = client.db("Garage").collection("voiture");
    let val = getMonthDatesByMonthAndYear(req.query.month, req.query.year);
    let start = new Date(val.start);
    let end = new Date(val.end);
    let dates = getDatesBetween(start, end);
    console.log(dates);
    if (!dates || !Array.isArray(dates)) {
        return res.status(400).send({ error: "La liste de dates est manquante ou mal formée dans la requête" });
    }

    const pipeline = [
        {
            $match: {
                "evenement.type": "reception",
                "evenement.reparation.payement": {
                    $gte: start,
                    $lte: end
                }
            }
        },
        {
            $unwind: "$evenement",
        },
        {
            $unwind: "$evenement.reparation",
        },
        {
            $match: {
                "evenement.reparation.etat": "paye",
                "evenement.reparation.payement": {
                    $gte: start,
                    $lte: end
                }
            }
        },
        {
            $group: {
                _id: {
                    day: { $dateToString: { format: "%Y-%m-%d", date: "$evenement.reparation.payement" } },
                },
                totalCA: {
                    $sum: {
                        $add: [
                            "$evenement.reparation.frais",
                            {
                                $sum: {
                                    $map: {
                                        input: "$evenement.reparation.achat_piece",
                                        in: {
                                            $multiply: ["$$this.pu", "$$this.quantite"]
                                        }
                                    }
                                }
                            }
                        ]
                    }
                }
            }
        },
        {
            $sort: { "_id.day": 1 }
        }
    ];

    const ca = await collection.aggregate(pipeline).toArray();

    let somme = 0 ;
    ca.forEach((entry)=>{
        somme = somme + entry.totalCA
    });

    const result = ca.map(entry => ({ date: entry._id.day, ca: entry.totalCA }));
    client.close();
    res.send({somme});
});

function getMonthDatesByMonthAndYear(month, year) {
    let startDate = new Date(year, month - 1, 1);
    let endDate = new Date(year, month, 0);
    return { start: startDate, end: endDate };
  }
  



router.get('/', auth , function(req, res, next) { res.send('VOITURE'); });

module.exports = router;