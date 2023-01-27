var express = require('express');
var router = express.Router();
const MongoClient = require('mongodb').MongoClient;
const ObjectId = require("mongodb").ObjectId;
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const fs = require("fs");
const nodemailer = require('nodemailer');

const sendgridTransport = require('nodemailer-sendgrid-transport');

const firebase = require("firebase-admin");
const serviceAccount = require("../credentials.json");

firebase.initializeApp({
  credential: firebase.credential.cert(serviceAccount),
  storageBucket: "healthycar-5c25f.appspot.com"
});

const bucket = firebase.storage().bucket();

const multer = require('multer');
const path = require('path'); // Ajout de la librairie path pour récupérer l'extension

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({ storage });

router.get('/', auth , function(req, res, next) { res.send('USER'); });


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


router.post('/login', async (req, res) => {

    const email = req.body.email;
    const password = req.body.password;
    const client = new MongoClient('mongodb+srv://tsanta:ETU001146@cluster0.6oftdrm.mongodb.net/?retryWrites=true&w=majority', { useUnifiedTopology: true });
    await client.connect();

    const db = client.db("Garage");

    let user = await db.collection("client").findOne({ email: email });

    if (!user) 
    {
        user = await db.collection("employe").findOne({ email: email });
    }

    if (!user) 
    {
        return res.status(401).json({ message: "Utilisateur non trouvé" });
    }

    console.log(user);

    if (user.etat !== "Validate") 
    {
        return res.status(401).json({ message: "Client non validé" });
    }

    const passwordIsValid = await bcrypt.compare(password, user.password);

    if (!passwordIsValid) 
    {
        return res.status(401).json({ message: "Mot de passe incorrect" });
    }

    const token = jwt.sign({ id: user._id }, "Tsanta", { expiresIn: 86400 });

    res.status(200).json({ user: user, token: token });

    client.close();
});

const emailRegex = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

router.post('/register', async (req, res) => {

    
    const nom = req.body.nom;
    const prenom = req.body.prenom;
    const email = req.body.email;
    const password = req.body.password;
    const passwordConf = req.body.passwordConf;
    const profil = req.body.profil;


    if (password !== passwordConf) {
        return res.status(400).json({ message: "Les mots de passe ne correspondent pas" });
    }

    if (!emailRegex.test(email)) {
        return res.status(400).json({ message: "Adresse e-mail non valide" });
    }

    if (!/[A-Z]/.test(password)) {
        return res.status(400).json({ message: "Le mot de passe doit contenir au moins une lettre majuscule" });
    }

    if (!/[a-z]/.test(password)) {
        return res.status(400).json({ message: "Le mot de passe doit contenir au moins une lettre minuscule" });
    }

    if (!/[0-9]/.test(password)) {
        return res.status(400).json({ message: "Le mot de passe doit contenir au moins un chiffre" });
    }

    if (!/[^A-Za-z0-9]/.test(password)) {
        return res.status(400).json({ message: "Le mot de passe doit contenir au moins un caractère spécial" });
    }

    if (password.length < 8) {
        return res.status(400).json({ message: "Le mot de passe doit contenir au moins 8 caractères" });
    }

        
    const client = new MongoClient('mongodb+srv://tsanta:ETU001146@cluster0.6oftdrm.mongodb.net/?retryWrites=true&w=majority', { useUnifiedTopology: true });
    await client.connect();
    const db = client.db("Garage");

    const emailExists = await db.collection("client").findOne({ email: email });

    if (emailExists) 
    {
        return res.status(400).json({ message: "Cette adresse e-mail est déjà utilisée" });
    }

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);

    const newClient = {
        nom: nom,
        prenom: prenom,
        email: email,
        password: hash,
        profil: profil,
        etat: "non validate"
    };

    const { insertedId } = await db.collection("client").insertOne(newClient);

    const token = jwt.sign({ id: insertedId }, "Tsanta", { expiresIn: 86400 });

    const verificationLink = `https://garage-backend-sigma.vercel.app/users/verify?token=${token}`;
    

    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: "healthycar00reply@gmail.com",
            pass: "hswviujoemmcbvcg"
        }
    });
    
    const mailOptions = {
        from: "healthycar00reply@gmail.com",
        to: email,
        subject: 'Validation de compte',
        text: `Cliquez sur ce lien pour valider votre compte: ${verificationLink}`,
        html: `<p>Cliquez sur ce lien pour valider votre compte: <a href="${verificationLink}">${verificationLink}</a></p>`,
    };
    
    transporter.sendMail(mailOptions, (error, info) => {
        if(error){
            return res.status(400).json({ message: error });
        }else{
            res.status(201).json({ client: newClient, message: "vous allez recevoir un email de verification pour confirmer votre inscription" + info.response });
        }
    });


    client.close();
});

router.put('/update', auth, async (req, res) => {
    const client = new MongoClient('mongodb+srv://tsanta:ETU001146@cluster0.6oftdrm.mongodb.net/?retryWrites=true&w=majority',{ useUnifiedTopology: true });
    await client.connect();
    const db = client.db("Garage");
    let user = await db.collection("client").findOne({_id: new ObjectId(req.user.id)});
    let collectionName = 'client';
    if (!user)
    {
    user = await db.collection("employe").findOne({_id: new ObjectId(req.user.id)});
    collectionName = 'employe';
    }
    if (!user) 
{
  return res.status(401).json({ message: "Utilisateur non trouvé" });
}
user.nom = req.body.nom || user.nom;
user.prenom = req.body.prenom || user.prenom;
user.email = req.body.email || user.email;
user.profil = req.body.profil || user.profil;
if(req.body.password){ user.password = await bcrypt.hash(req.body.password, 10); }
db.collection(collectionName).updateOne({_id: new ObjectId(req.user.id)}, { $set: user },(err, result) => {
    if (err) {
        console.log(err);
        return res.status(500).json({ message: "Error updating profile" });
    }
    client.close();
    res.status(200).json({ message: "Profile updated successfully" });
  });
});



router.get('/verify', async (req, res) => {
    const token = req.query.token;

    if (!token) {
        return res.status(401).json({ message: 'Aucun token, autorisation refusée' });
    }

    try {
        const client = new MongoClient('mongodb+srv://tsanta:ETU001146@cluster0.6oftdrm.mongodb.net/?retryWrites=true&w=majority',{ useUnifiedTopology: true });
        await client.connect();
        const db = client.db("Garage");
        const decoded = jwt.verify(token, 'Tsanta');
        console.log(decoded);
        const user = await db.collection("client").findOne({ _id: new ObjectId(decoded.id) });
        if (!user) {
            return res.status(404).json({ message: 'Utilisateur non trouvé' });
        }
        await db.collection("client").updateOne({ _id: new ObjectId(decoded.id) }, { $set: { etat: "Validate" } });
        res.redirect(`https://m1p10mean-tahiana-tsantaniaina.vercel.app/client?token=${token}`);
    } catch (err) {
        res.status(400).json({ message: 'Token non valide' });
    }
});


module.exports = router;


