var express = require('express');
var router = express.Router();
const auth = require('../routes/users'); 

router.get('/',auth , function(req, res, next) { res.send('INDEX'); });

module.exports = router;
