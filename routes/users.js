var express = require('express');
var router = express.Router();
const MongoClient = require('mongodb').MongoClient;
const ObjectId = require("mongodb").ObjectId;
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const fs = require("fs");
const nodemailer = require('nodemailer');

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

module.exports = auth;

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
        profil: "default.png",
        etat: "non validate"
    };

    await db.collection("client").insertOne(newClient);


    const token = jwt.sign({ id: newClient._id }, "Tsanta", { expiresIn: 86400 });

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
        text: 'Cliquez sur ce lien pour valider votre compte: https://garage-backend-sigma.vercel.app/users/verify',
        html: '<p>Cliquez sur ce lien pour valider votre compte: <a href="https://garage-backend-sigma.vercel.app/users/verify">https://garage-backend-sigma.vercel.app/users/verify</a></p>',
        headers: {
            'x-auth-token': token
        }
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if(error){
            console.log(error);
        }else{
            console.log('Email sent: ' + info.response);
        }
    });


    res.status(201).json({ client: newClient, message: "vous allez recevoir un email de verification pour confirmer votre inscription" });

    client.close();
});

router.post('/upload', (req, res) => {
    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).send('No files were uploaded.');
    }
    
    const fs = require('fs')

const dir = './uploads'

fs.mkdir(dir, err => {
  if (err.code!=="EEXIST") {
    console.log('Directory is created.')
  }

})

    let file = req.files.files;
  
    file.mv(`./uploads/${file.name}`, function(err) {
      if (err) return res.status(500).send(err);
  
      res.send('File uploaded!');
    });
  });
  
router.get('/download/:fileName', (req, res) => {
    const fileName = req.params.fileName;
    console.log(fileName);
    res.download(`uploads/${fileName}`);
});
  


router.patch('/update', auth, async (req, res) => {
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
if(req.body.password){
  user.password = await bcrypt.hash(req.body.password, 10);
}
if(req.body.profileImg){
    const file = req.body.profileImg;
    const fileName = req.user.id + '-' + Date.now() + '.' + file.split(';')[0].split('/')[1];
    const filePath = './uploads/' + fileName;
    fs.writeFile(filePath, file, (err) => {
      if (err) {
        return res.status(500).json({ message: "Error uploading file" });
      }
      user.profil = fileName;
      db.collection(collectionName).updateOne({_id: new ObjectId(req.user.id)}, { $set: user },(err, result) => {
        if (err) {
            console.log(err);
            return res.status(500).json({ message: "Error updating profile" });
        }
        client.close();
        res.status(200).json({ message: "Profile updated successfully" });
      });
    });
} else {
  db.collection(collectionName).updateOne({_id: new ObjectId(req.user.id)}, { $set: user },(err, result) => {
    if (err) {
        console.log(err);
        return res.status(500).json({ message: "Error updating profile" });
    }
    client.close();
    res.status(200).json({ message: "Profile updated successfully" });
  });
}
});

router.get('/', auth , function(req, res, next) { res.send('USER'); });

router.get('/verify', (req, res) => {

    const token = req.header('x-auth-token');
    if (!token) 
    {
        return res.status(401).json({ message: 'Aucun token, autorisation refusée' });
    }

    try 
    {
        const decoded = jwt.verify(token, 'Tsanta');
        res.set('x-auth-token', token);
        res.redirect('https://your-app.com/home');
    } 
    catch (err) 
    {
        res.status(400).json({ message: 'Token non valide' });
    }
});


module.exports = router;


