var express = require('express');
var router = express.Router();
const MongoClient = require('mongodb').MongoClient;
//const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
/*
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
        req.user = decoded;
        next();
    } 
    catch (err) 
    {
        res.status(400).json({ message: 'Token non valide' });
    }
}

module.exports = auth;*/
/*
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
    const emailConf = req.body.emailConf;
    const password = req.body.password;
    const passwordConf = req.body.passwordConf;

    if (email !== emailConf) {
        return res.status(400).json({ message: "Les adresses e-mail ne correspondent pas" });
    }

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

    res.status(201).json({ client: newClient, token: token });

    client.close();
});
*/
router.get('/' , function(req, res, next) { res.send('USER'); });


module.exports = router;


